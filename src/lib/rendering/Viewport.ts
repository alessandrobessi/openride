import * as THREE from 'three';
import { RenderLoop, type RenderLoopFrame } from './RenderLoop';
import { applyInterpolatedTransform } from './interpolate';
import { createScene, type TestScene } from './scene/createScene';
import { createLighting, type Lighting } from './lighting/createLighting';
import { createCamera, type InspectionCamera } from './camera/createCamera';
import { SimulationLoop } from '$lib/simulation/core/SimulationLoop';
import { type Transform } from '$lib/simulation/physics/RapierWorld';
import {
	createMotorcycleRig,
	type MotorcycleRig
} from '$lib/simulation/physics/createMotorcycleRig';
import { ADVENTURE_1200 } from '$lib/simulation/motorcycle/configs/adventure-1200';
import type { MotorcycleControls } from '$lib/simulation/motorcycle/Motorcycle';

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
	frontLoadN: number;
	rearLoadN: number;
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
	private readonly loop: RenderLoop;
	private readonly resizeObserver: ResizeObserver;

	private readonly simLoop = new SimulationLoop({ fixedDtS: FIXED_DT_S });
	private rig: MotorcycleRig | undefined;
	private readonly controls: MotorcycleControls = { ...NEUTRAL_CONTROLS };
	/** Keyboard sets a target; the clutch eases toward it so takeup is smooth. */
	private clutchTarget = 1;
	private readonly disposables: Array<{ dispose: () => void }> = [];

	private chassisMesh: THREE.Object3D | undefined;
	private frontContactMarker: THREE.Mesh | undefined;
	private rearContactMarker: THREE.Mesh | undefined;
	private prevTransform: Transform = identityTransform();
	private currTransform: Transform = identityTransform();

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

	/** Keyboard/gamepad clutch: true = engaged. The value eases toward this. */
	setClutchEngaged(engaged: boolean): void {
		this.clutchTarget = engaged ? 1 : 0;
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

	/** Build the physics world + motorcycle rig and begin rendering. */
	async start(onStats?: (stats: ViewportStats) => void): Promise<void> {
		this.onStats = onStats;

		const rig = await createMotorcycleRig(ADVENTURE_1200);
		if (this.disposed) {
			rig.world.dispose();
			return;
		}
		this.rig = rig;
		this.buildDebugMotorcycle();
		this.prevTransform = rig.world.getTransform(rig.chassisHandle);
		this.currTransform = this.prevTransform;

		this.loop.start();
	}

	stop(): void {
		this.loop.stop();
	}

	dispose(): void {
		this.disposed = true;
		this.loop.stop();
		this.resizeObserver.disconnect();
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
		group.name = 'motorcycle-debug';

		const bodyGeom = new THREE.BoxGeometry(0.7, 1.0, 2.1);
		const bodyMat = new THREE.MeshStandardMaterial({
			color: 0x6cc0ff,
			transparent: true,
			opacity: 0.35,
			roughness: 0.5
		});
		group.add(new THREE.Mesh(bodyGeom, bodyMat));
		this.track(bodyGeom, bodyMat);

		const cg = new THREE.AxesHelper(0.5);
		group.add(cg);
		this.track(cg.geometry, cg.material as THREE.Material);

		group.add(
			this.wheelDisc(
				geo.frontWheelRadiusM,
				geo.wheelbaseM - geo.cgFromRearAxleM,
				geo.frontWheelRadiusM - geo.cgHeightM
			)
		);
		group.add(
			this.wheelDisc(
				geo.rearWheelRadiusM,
				-geo.cgFromRearAxleM,
				geo.rearWheelRadiusM - geo.cgHeightM,
				true
			)
		);

		this.testScene.scene.add(group);
		this.chassisMesh = group;

		const markerGeom = new THREE.SphereGeometry(0.05, 12, 12);
		const markerMat = new THREE.MeshBasicMaterial({ color: 0xff5a4a });
		this.frontContactMarker = new THREE.Mesh(markerGeom, markerMat);
		this.rearContactMarker = new THREE.Mesh(markerGeom, markerMat);
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
			// Keep the inspection camera loosely trained on the moving bike.
			this.inspectionCamera.follow(this.chassisMesh.position);
		}

		this.inspectionCamera.update();
		this.renderer.render(this.testScene.scene, this.inspectionCamera.camera);
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
				frontLoadN: this.rig?.motorcycle.state.frontNormalLoadN ?? 0,
				rearLoadN: this.rig?.motorcycle.state.rearNormalLoadN ?? 0
			});
		}
	}
}

function identityTransform(): Transform {
	return { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
}
