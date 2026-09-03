import * as THREE from 'three';
import { RenderLoop, type RenderLoopFrame } from './RenderLoop';
import { applyInterpolatedTransform } from './interpolate';
import { createScene, type TestScene } from './scene/createScene';
import { createLighting, type Lighting } from './lighting/createLighting';
import { createCamera, type InspectionCamera } from './camera/createCamera';
import { createFirstPersonCamera, type FirstPersonCamera } from './camera/createFirstPersonCamera';
import { createCockpit, type Cockpit } from './cockpit/createCockpit';
import {
	createInstrumentCluster,
	type InstrumentCluster
} from './cockpit/instruments/InstrumentCluster';
import { SimulationLoop } from '$lib/simulation/core/SimulationLoop';
import { RapierWorld, type Transform } from '$lib/simulation/physics/RapierWorld';
import {
	createMotorcycleRig,
	type MotorcycleRig
} from '$lib/simulation/physics/createMotorcycleRig';
import { ADVENTURE_1200 } from '$lib/simulation/motorcycle/configs/adventure-1200';
import type { MotorcycleControls } from '$lib/simulation/motorcycle/Motorcycle';
import { LocalFrame, STELVIO_ORIGIN } from '$lib/world/geo/enu';
import { fetchWorldManifest, type WorldManifest } from '$lib/world/WorldManifest';
import { fetchRoadMesh, type LoadedRoadMesh } from '$lib/world/roads/loadRoadMesh';
import { fetchTerrainIndex } from '$lib/world/terrain/loadTerrain';
import type {
	TerrainChunkHeights,
	TerrainChunkMeta,
	TerrainIndex
} from '$lib/world/terrain/TerrainChunk';
import { WorldManager, type ChunkSink } from '$lib/world/streaming/WorldManager';
import { asset } from '$lib/paths';

/** The world package the ride stage boots. */
const WORLD_DIR = 'worlds/stelvio';

/**
 * Owns the WebGL renderer, the test scene, the inspection camera, the fixed-step
 * simulation loop and the Rapier world. Browser-only — construct from
 * `onMount`, never during SSR/prerender.
 *
 * Physics state is authoritative; rendering interpolates it (AGENTS.md §5, §6).
 * M3 shows the motorcycle rig as a debug view: a translucent chassis box with
 * wheel discs, contact-point markers and a CG axis triad, resting on the ground.
 */
export interface ViewportStats {
	fps: number;
	physicsHz: number;
	drawCalls: number;
	triangles: number;
	speedKmh: number;
	rpm: number;
	gear: number;
	stalled: boolean;
	rollDeg: number;
	targetLeanDeg: number;
	frontLoadN: number;
	rearLoadN: number;
	frontGrip: number;
	rearGrip: number;
	absActive: boolean;
	tcActive: boolean;
	absOn: boolean;
	tcOn: boolean;
	latDeg: number;
	lonDeg: number;
	activeChunks: number;
	chunkId: string;
	view: 'cockpit' | 'chase';
}

const FIXED_DT_S = 1 / 120;

const NEUTRAL_CONTROLS: MotorcycleControls = {
	throttle: 0,
	clutch: 1,
	frontBrake: 0,
	rearBrake: 0,
	steeringInput: 0
};

export class Viewport {
	readonly renderer: THREE.WebGLRenderer;
	private readonly canvas: HTMLCanvasElement;
	private readonly testScene: TestScene;
	private readonly lighting: Lighting;
	private readonly inspectionCamera: InspectionCamera;
	private readonly fpCamera: FirstPersonCamera;
	private readonly loop: RenderLoop;
	private readonly resizeObserver: ResizeObserver;

	private readonly simLoop = new SimulationLoop({ fixedDtS: FIXED_DT_S });
	/** Debug: report the chassis position back as geographic coordinates (M13).
	 *  Re-anchored on the manifest origin once the world loads (M18). */
	private geoFrame = new LocalFrame(STELVIO_ORIGIN);
	private rig: MotorcycleRig | undefined;
	private readonly controls: MotorcycleControls = { ...NEUTRAL_CONTROLS };
	/** Keyboard sets a target; the clutch eases toward it so takeup is smooth. */
	private clutchTarget = 1;
	private readonly disposables: Array<{ dispose: () => void }> = [];

	private chassisMesh: THREE.Object3D | undefined;
	/** The M3 debug primitives (box + axes + wheel discs); hidden in cockpit view. */
	private debugGroup: THREE.Group | undefined;
	private cockpit: Cockpit | undefined;
	private cluster: InstrumentCluster | undefined;
	/** First-person cockpit is the default ride view (M20); 'chase' is the debug orbit cam. */
	private viewMode: 'cockpit' | 'chase' = 'cockpit';
	private frontContactMarker: THREE.Mesh | undefined;
	private rearContactMarker: THREE.Mesh | undefined;
	private prevTransform: Transform = identityTransform();
	private currTransform: Transform = identityTransform();

	/** Terrain chunk streaming (M19). */
	private worldManager: WorldManager | undefined;
	private terrainGroup: THREE.Group | undefined;
	private terrainMat: THREE.MeshStandardMaterial | undefined;
	private readonly terrainColliders = new Map<string, number>();
	private readonly terrainMeshes = new Map<string, THREE.Mesh>();
	private streamStats = { activeChunks: 0, chunkId: '—' };

	private frameCount = 0;
	private disposed = false;
	private onStats: ((stats: ViewportStats) => void) | undefined;

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;

		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;

		this.testScene = createScene();
		this.lighting = createLighting();
		this.testScene.scene.add(this.lighting.group);

		this.inspectionCamera = createCamera(canvas);
		this.fpCamera = createFirstPersonCamera();

		this.loop = new RenderLoop((frame) => this.renderFrame(frame));

		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(this.canvas);
		this.resize();
	}

	get frames(): number {
		return this.frameCount;
	}

	/** Feed normalised control inputs (from keyboard/gamepad). Merged, not replaced. */
	setControls(partial: Partial<MotorcycleControls>): void {
		Object.assign(this.controls, partial);
	}

	/** Keyboard clutch: true = engaged. The value eases toward this. */
	setClutchEngaged(engaged: boolean): void {
		this.clutchTarget = engaged ? 1 : 0;
	}

	/** Gamepad analog clutch: 1 = engaged, 0 = pulled in. The value eases toward this. */
	setClutchInput(value01: number): void {
		this.clutchTarget = Number.isFinite(value01) ? Math.min(1, Math.max(0, value01)) : 1;
	}

	shiftUp(): void {
		this.rig?.motorcycle.shiftUp();
	}

	shiftDown(): void {
		this.rig?.motorcycle.shiftDown();
	}

	restartEngine(): void {
		this.rig?.motorcycle.restartEngine();
	}

	toggleAssist(assist: 'abs' | 'tractionControl' | 'wheelieControl'): void {
		const m = this.rig?.motorcycle;
		if (m) m.setAssistEnabled(assist, !m.isAssistEnabled(assist));
	}

	/** Switch between the first-person cockpit (M20) and the debug chase orbit cam. */
	toggleView(): void {
		this.viewMode = this.viewMode === 'cockpit' ? 'chase' : 'cockpit';
		const cockpitView = this.viewMode === 'cockpit';
		if (this.debugGroup) this.debugGroup.visible = !cockpitView;
		if (this.cockpit) this.cockpit.group.visible = cockpitView;
		if (this.frontContactMarker) this.frontContactMarker.visible = !cockpitView;
		if (this.rearContactMarker) this.rearContactMarker.visible = !cockpitView;
		if (cockpitView && this.chassisMesh) {
			this.fpCamera.reset(this.chassisMesh.position, this.chassisMesh.quaternion);
		}
	}

	private geoFromChassis(): { latDeg: number; lonDeg: number } {
		const p = this.rig?.motorcycle.state.positionWorldM;
		if (!p) return { latDeg: STELVIO_ORIGIN.latDeg, lonDeg: STELVIO_ORIGIN.lonDeg };
		const g = this.geoFrame.toGeo({ x: p.x, y: p.y, z: p.z });
		return { latDeg: g.latDeg, lonDeg: g.lonDeg };
	}

	/** Build the physics world + motorcycle rig and begin rendering. */
	async start(onStats?: (stats: ViewportStats) => void): Promise<void> {
		this.onStats = onStats;

		// Boot the world purely from its manifest (M18); fall back to the flat
		// test plane if the package can't be loaded.
		const worldDir = asset(WORLD_DIR);
		let manifest: WorldManifest | undefined;
		let road: LoadedRoadMesh | undefined;
		let terrainIndex: TerrainIndex | undefined;
		let terrainDir = '';
		try {
			manifest = await fetchWorldManifest(worldDir);
			road = await fetchRoadMesh(`${worldDir}/${manifest.assets.roads}`);
			terrainDir = `${worldDir}/${manifest.assets.terrain}`;
			try {
				terrainIndex = await fetchTerrainIndex(terrainDir);
			} catch (err) {
				console.warn('World terrain package unavailable — road only:', err);
			}
		} catch (err) {
			console.warn('World package unavailable — using the flat test plane:', err);
			manifest = undefined;
			road = undefined;
		}
		if (this.disposed) return;

		let rig: MotorcycleRig;
		if (manifest && road) {
			this.geoFrame = new LocalFrame(manifest.origin);
			const world = await RapierWorld.create();
			world.addStaticGround(2000, 1, -40); // safety floor far below the road
			world.addTrimeshCollider(road.collision.positions, road.collision.indices);
			if (terrainIndex) {
				this.startTerrainStreaming(terrainIndex, terrainDir, world);
				this.worldManager?.update(manifest.spawn.x, manifest.spawn.z);
			}
			rig = await createMotorcycleRig(ADVENTURE_1200, {
				world,
				withGround: false,
				spawn: manifest.spawn
			});
			this.addRoadSurface(road);
		} else {
			rig = await createMotorcycleRig(ADVENTURE_1200);
		}
		if (this.disposed) {
			rig.world.dispose();
			return;
		}

		this.rig = rig;
		this.buildDebugMotorcycle();
		this.prevTransform = rig.world.getTransform(rig.chassisHandle);
		this.currTransform = this.prevTransform;

		// Seat the cockpit camera on the spawn pose so the first frame is right.
		if (this.chassisMesh) {
			applyInterpolatedTransform(this.chassisMesh, this.prevTransform, this.currTransform, 1);
			this.fpCamera.reset(this.chassisMesh.position, this.chassisMesh.quaternion);
		}

		this.loop.start();
	}

	private addRoadSurface(road: LoadedRoadMesh): void {
		const geom = new THREE.BufferGeometry();
		geom.setAttribute('position', new THREE.BufferAttribute(road.surface.positions, 3));
		geom.setAttribute('normal', new THREE.BufferAttribute(road.surface.normals, 3));
		geom.setAttribute('uv', new THREE.BufferAttribute(road.surface.uvs, 2));
		geom.setIndex(new THREE.BufferAttribute(road.surface.indices, 1));
		const mat = new THREE.MeshStandardMaterial({ color: 0x4a4f57, roughness: 0.95 });
		const mesh = new THREE.Mesh(geom, mat);
		mesh.name = 'road-surface';
		this.testScene.scene.add(mesh);
		this.track(geom, mat);
		// The flat test plane is just noise once we're on the real road.
		this.testScene.ground.visible = false;
	}

	/**
	 * Wire up DEM terrain streaming (M17 geometry, M19 streaming). The
	 * {@link WorldManager} decides which chunks are near the rider; this sink
	 * turns each activate/deactivate into a Rapier heightfield collider and a
	 * displaced grid mesh built from the same height grid so they never diverge.
	 */
	private startTerrainStreaming(index: TerrainIndex, terrainDir: string, world: RapierWorld): void {
		this.terrainGroup = new THREE.Group();
		this.terrainGroup.name = 'terrain';
		this.terrainMat = new THREE.MeshStandardMaterial({
			color: 0x6b7355,
			roughness: 1,
			flatShading: true
		});
		this.track(this.terrainMat);
		this.testScene.scene.add(this.terrainGroup);

		const sink: ChunkSink = {
			activate: (meta, heights) => {
				const handle = world.addHeightfieldChunk(
					heights.gridSize,
					heights.heights,
					meta.sizeM,
					meta.originX + meta.sizeM / 2,
					meta.originZ + meta.sizeM / 2
				);
				this.terrainColliders.set(meta.id, handle);

				const geom = this.buildChunkGeometry(meta, heights);
				const mesh = new THREE.Mesh(geom, this.terrainMat);
				mesh.name = `terrain-${meta.id}`;
				this.terrainGroup?.add(mesh);
				this.terrainMeshes.set(meta.id, mesh);
			},
			deactivate: (meta) => {
				const handle = this.terrainColliders.get(meta.id);
				if (handle !== undefined) world.removeCollider(handle);
				this.terrainColliders.delete(meta.id);

				const mesh = this.terrainMeshes.get(meta.id);
				if (mesh) {
					this.terrainGroup?.remove(mesh);
					mesh.geometry.dispose();
				}
				this.terrainMeshes.delete(meta.id);
			}
		};

		this.worldManager = new WorldManager(index, sink, {
			fetchChunk: async (file) => {
				const res = await fetch(`${terrainDir}/${file}`);
				if (!res.ok) throw new Error(`terrain chunk ${file}: HTTP ${res.status}`);
				return res.arrayBuffer();
			}
		});
	}

	private buildChunkGeometry(
		meta: TerrainChunkMeta,
		heights: TerrainChunkHeights
	): THREE.BufferGeometry {
		const g = heights.gridSize;
		const step = meta.sizeM / (g - 1);
		const positions = new Float32Array(g * g * 3);
		for (let r = 0; r < g; r++) {
			for (let c = 0; c < g; c++) {
				const i = (r * g + c) * 3;
				positions[i] = meta.originX + c * step;
				positions[i + 1] = heights.heights[r * g + c];
				positions[i + 2] = meta.originZ + r * step;
			}
		}
		const indices = new Uint32Array((g - 1) * (g - 1) * 6);
		let k = 0;
		for (let r = 0; r < g - 1; r++) {
			for (let c = 0; c < g - 1; c++) {
				const a = r * g + c;
				const b = a + 1;
				const d = a + g;
				const e = d + 1;
				indices[k++] = a;
				indices[k++] = d;
				indices[k++] = b;
				indices[k++] = b;
				indices[k++] = d;
				indices[k++] = e;
			}
		}
		const geom = new THREE.BufferGeometry();
		geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geom.setIndex(new THREE.BufferAttribute(indices, 1));
		geom.computeVertexNormals();
		return geom;
	}

	stop(): void {
		this.loop.stop();
	}

	dispose(): void {
		this.disposed = true;
		this.loop.stop();
		this.resizeObserver.disconnect();
		this.worldManager?.dispose();
		this.terrainColliders.clear();
		this.terrainMeshes.clear();
		this.fpCamera.dispose();
		this.inspectionCamera.dispose();
		this.lighting.dispose();
		this.testScene.dispose();
		for (const d of this.disposables) d.dispose();
		this.rig?.world.dispose();
		this.renderer.dispose();
	}

	private buildDebugMotorcycle(): void {
		const geo = ADVENTURE_1200.physical.geometry;
		const group = new THREE.Group();
		group.name = 'motorcycle';

		// M3 debug primitives — a translucent chassis box, a CG triad and wheel
		// discs. Kept for the chase view; hidden from the cockpit.
		const debug = new THREE.Group();
		debug.name = 'motorcycle-debug';

		const bodyGeom = new THREE.BoxGeometry(0.7, 1.0, 2.1);
		const bodyMat = new THREE.MeshStandardMaterial({
			color: 0x6cc0ff,
			transparent: true,
			opacity: 0.35,
			roughness: 0.5
		});
		debug.add(new THREE.Mesh(bodyGeom, bodyMat));
		this.track(bodyGeom, bodyMat);

		const cg = new THREE.AxesHelper(0.5);
		debug.add(cg);
		this.track(cg.geometry, cg.material as THREE.Material);

		debug.add(
			this.wheelDisc(
				geo.frontWheelRadiusM,
				geo.wheelbaseM - geo.cgFromRearAxleM,
				geo.frontWheelRadiusM - geo.cgHeightM
			)
		);
		debug.add(
			this.wheelDisc(
				geo.rearWheelRadiusM,
				-geo.cgFromRearAxleM,
				geo.rearWheelRadiusM - geo.cgHeightM,
				true
			)
		);
		group.add(debug);
		this.debugGroup = debug;

		this.cockpit = createCockpit();
		group.add(this.cockpit.group);
		this.track(this.cockpit);

		// Live instrument cluster (M21) painted onto the cockpit's cluster face.
		this.cluster = createInstrumentCluster();
		const faceMat = this.cockpit.clusterFace.material as THREE.MeshBasicMaterial;
		faceMat.map = this.cluster.texture;
		faceMat.color.set(0xffffff);
		faceMat.needsUpdate = true;
		this.track(this.cluster);

		// Cockpit is the default view: show the cockpit, hide the debug rig.
		debug.visible = false;
		this.cockpit.group.visible = true;

		this.testScene.scene.add(group);
		this.chassisMesh = group;

		const markerGeom = new THREE.SphereGeometry(0.05, 12, 12);
		const markerMat = new THREE.MeshBasicMaterial({ color: 0xff5a4a });
		this.frontContactMarker = new THREE.Mesh(markerGeom, markerMat);
		this.rearContactMarker = new THREE.Mesh(markerGeom, markerMat);
		this.frontContactMarker.visible = false;
		this.rearContactMarker.visible = false;
		this.testScene.scene.add(this.frontContactMarker, this.rearContactMarker);
		this.track(markerGeom, markerMat);
	}

	private wheelDisc(radiusM: number, axleZ: number, centreY: number, rear = false): THREE.Mesh {
		const g = new THREE.CylinderGeometry(radiusM, radiusM, 0.12, 28);
		const m = new THREE.MeshStandardMaterial({ color: rear ? 0x9fe8b0 : 0xf0f0f0, roughness: 0.6 });
		const mesh = new THREE.Mesh(g, m);
		mesh.rotation.z = Math.PI / 2; // axle along body x
		mesh.position.set(0, centreY, axleZ);
		this.track(g, m);
		return mesh;
	}

	private track(...items: Array<{ dispose: () => void }>): void {
		this.disposables.push(...items);
	}

	private resize(): void {
		const width = this.canvas.clientWidth || window.innerWidth;
		const height = this.canvas.clientHeight || window.innerHeight;
		this.renderer.setSize(width, height, false);
		this.inspectionCamera.setViewportSize(width, height);
		this.fpCamera.setViewportSize(width, height);
	}

	private renderFrame(frame: RenderLoopFrame): void {
		if (this.rig && this.chassisMesh) {
			const { motorcycle, world, chassisHandle } = this.rig;
			const alpha = this.simLoop.advance(frame.frameDeltaS, (dtS) => {
				this.prevTransform = this.currTransform;
				// Ease the clutch toward its keyboard target (~0.25 s takeup).
				this.controls.clutch += (this.clutchTarget - this.controls.clutch) * 0.15;
				motorcycle.setControls(this.controls);
				motorcycle.update(dtS);
				world.step(dtS);
				this.currTransform = world.getTransform(chassisHandle);
			});
			applyInterpolatedTransform(this.chassisMesh, this.prevTransform, this.currTransform, alpha);
			const fc = motorcycle.debug.frontContactWorldM;
			const rc = motorcycle.debug.rearContactWorldM;
			this.frontContactMarker?.position.set(fc.x, fc.y, fc.z);
			this.rearContactMarker?.position.set(rc.x, rc.y, rc.z);

			if (this.viewMode === 'cockpit') {
				this.fpCamera.update(
					this.chassisMesh.position,
					this.chassisMesh.quaternion,
					frame.frameDeltaS
				);
			} else {
				// Keep the inspection camera loosely trained on the moving bike.
				this.inspectionCamera.follow(this.chassisMesh.position);
			}

			// Stream terrain chunks around the rider (M19) — a few times a second.
			if (this.worldManager && this.frameCount % 12 === 0) {
				const p = motorcycle.state.positionWorldM;
				this.worldManager.update(p.x, p.z);
				const s = this.worldManager.statsAt(p.x, p.z);
				this.streamStats = { activeChunks: s.activeChunks, chunkId: s.currentChunkId ?? '—' };
			}

			// Repaint the instrument cluster from sampled state (M21).
			if (this.cluster && this.viewMode === 'cockpit') {
				const s = motorcycle.state;
				this.cluster.update({
					speedKmh: s.forwardSpeedMps * 3.6,
					rpm: s.engineRPM,
					redlineRpm: ADVENTURE_1200.powertrain.engine.redlineRPM,
					gear: s.gear,
					stalled: s.engineStalled,
					absEnabled: motorcycle.isAssistEnabled('abs'),
					absActive: s.absActive,
					tcEnabled: motorcycle.isAssistEnabled('tractionControl'),
					tcActive: s.tractionControlActive
				});
			}
		}

		const camera =
			this.viewMode === 'cockpit' && this.chassisMesh
				? this.fpCamera.camera
				: this.inspectionCamera.camera;
		if (camera === this.inspectionCamera.camera) this.inspectionCamera.update();
		this.renderer.render(this.testScene.scene, camera);
		this.frameCount += 1;

		if (this.onStats && this.frameCount % 15 === 0) {
			this.onStats({
				fps: this.loop.fps,
				physicsHz: 1 / FIXED_DT_S,
				drawCalls: this.renderer.info.render.calls,
				triangles: this.renderer.info.render.triangles,
				speedKmh: (this.rig?.motorcycle.state.forwardSpeedMps ?? 0) * 3.6,
				rpm: this.rig?.motorcycle.state.engineRPM ?? 0,
				gear: this.rig?.motorcycle.state.gear ?? 0,
				stalled: this.rig?.motorcycle.state.engineStalled ?? false,
				rollDeg: ((this.rig?.motorcycle.state.rollRad ?? 0) * 180) / Math.PI,
				targetLeanDeg: ((this.rig?.motorcycle.state.targetLeanRad ?? 0) * 180) / Math.PI,
				frontLoadN: this.rig?.motorcycle.state.frontNormalLoadN ?? 0,
				rearLoadN: this.rig?.motorcycle.state.rearNormalLoadN ?? 0,
				frontGrip: this.rig?.motorcycle.state.frontGripUtilization ?? 0,
				rearGrip: this.rig?.motorcycle.state.rearGripUtilization ?? 0,
				absActive: this.rig?.motorcycle.state.absActive ?? false,
				tcActive: this.rig?.motorcycle.state.tractionControlActive ?? false,
				absOn: this.rig?.motorcycle.isAssistEnabled('abs') ?? true,
				tcOn: this.rig?.motorcycle.isAssistEnabled('tractionControl') ?? true,
				...this.geoFromChassis(),
				activeChunks: this.streamStats.activeChunks,
				chunkId: this.streamStats.chunkId,
				view: this.viewMode
			});
		}
	}
}

function identityTransform(): Transform {
	return { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
}
