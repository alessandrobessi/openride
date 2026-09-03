import * as THREE from 'three';
import { RenderLoop, type RenderLoopFrame } from './RenderLoop';
import { applyInterpolatedTransform } from './interpolate';
import { createScene, type TestScene } from './scene/createScene';
import { createLighting, type Lighting } from './lighting/createLighting';
import { createCamera, type InspectionCamera } from './camera/createCamera';
import { SimulationLoop } from '$lib/simulation/core/SimulationLoop';
import { RapierWorld, type Transform } from '$lib/simulation/physics/RapierWorld';

/**
 * Owns the WebGL renderer, the test scene, the inspection camera, the
 * fixed-step simulation loop and the Rapier world, and keeps them sized to a
 * canvas element. Browser-only — construct from `onMount`, never during
 * SSR/prerender.
 *
 * Physics state is authoritative; rendering interpolates it (AGENTS.md §5, §6).
 * In M2 the only simulated object is a dynamic test box that falls onto the
 * static ground; M3 replaces it with the motorcycle rig.
 */
export interface ViewportStats {
	fps: number;
	physicsHz: number;
	drawCalls: number;
	triangles: number;
}

const FIXED_DT_S = 1 / 120;
const TEST_BOX_HALF = 0.5;
const TEST_BOX_DROP_Y = 8;

export class Viewport {
	readonly renderer: THREE.WebGLRenderer;
	private readonly canvas: HTMLCanvasElement;
	private readonly testScene: TestScene;
	private readonly lighting: Lighting;
	private readonly inspectionCamera: InspectionCamera;
	private readonly loop: RenderLoop;
	private readonly resizeObserver: ResizeObserver;

	private readonly simLoop = new SimulationLoop({ fixedDtS: FIXED_DT_S });
	private physics: RapierWorld | undefined;
	private testBox: THREE.Mesh | undefined;
	private testBoxHandle = -1;
	private prevTransform: Transform = identityTransform(TEST_BOX_DROP_Y);
	private currTransform: Transform = identityTransform(TEST_BOX_DROP_Y);

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

	/** Build the physics world and begin rendering. */
	async start(onStats?: (stats: ViewportStats) => void): Promise<void> {
		this.onStats = onStats;

		const physics = await RapierWorld.create();
		if (this.disposed) {
			physics.dispose();
			return;
		}
		physics.addStaticGround();
		this.testBoxHandle = physics.addDynamicBox({
			halfExtentsM: { x: TEST_BOX_HALF, y: TEST_BOX_HALF, z: TEST_BOX_HALF },
			positionM: { x: 0, y: TEST_BOX_DROP_Y, z: 0 }
		});
		this.physics = physics;
		this.prevTransform = physics.getTransform(this.testBoxHandle);
		this.currTransform = this.prevTransform;

		const geometry = new THREE.BoxGeometry(TEST_BOX_HALF * 2, TEST_BOX_HALF * 2, TEST_BOX_HALF * 2);
		const material = new THREE.MeshStandardMaterial({ color: 0x6cc0ff, roughness: 0.4 });
		this.testBox = new THREE.Mesh(geometry, material);
		this.testBox.name = 'test-box';
		this.testScene.scene.add(this.testBox);

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
		if (this.testBox) {
			this.testBox.geometry.dispose();
			(this.testBox.material as THREE.Material).dispose();
		}
		this.physics?.dispose();
		this.renderer.dispose();
	}

	private resize(): void {
		const width = this.canvas.clientWidth || window.innerWidth;
		const height = this.canvas.clientHeight || window.innerHeight;
		this.renderer.setSize(width, height, false);
		this.inspectionCamera.setViewportSize(width, height);
	}

	private renderFrame(frame: RenderLoopFrame): void {
		if (this.physics && this.testBox) {
			const alpha = this.simLoop.advance(frame.frameDeltaS, (dtS) => {
				this.prevTransform = this.currTransform;
				this.physics!.step(dtS);
				this.currTransform = this.physics!.getTransform(this.testBoxHandle);
			});
			applyInterpolatedTransform(this.testBox, this.prevTransform, this.currTransform, alpha);
		}

		this.inspectionCamera.update();
		this.renderer.render(this.testScene.scene, this.inspectionCamera.camera);
		this.frameCount += 1;

		if (this.onStats && this.frameCount % 15 === 0) {
			this.onStats({
				fps: this.loop.fps,
				physicsHz: 1 / FIXED_DT_S,
				drawCalls: this.renderer.info.render.calls,
				triangles: this.renderer.info.render.triangles
			});
		}
	}
}

function identityTransform(y: number): Transform {
	return { position: { x: 0, y, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
}
