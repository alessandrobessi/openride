import * as THREE from 'three';
import { RenderLoop } from './RenderLoop';
import { createScene, type TestScene } from './scene/createScene';
import { createLighting, type Lighting } from './lighting/createLighting';
import { createCamera, type InspectionCamera } from './camera/createCamera';

/**
 * Owns the WebGL renderer, the test scene, the inspection camera and the render
 * loop, and keeps them sized to a canvas element. Browser-only — construct it
 * from `onMount`, never during SSR/prerender.
 *
 * Rendering is a consumer of state, not a source of it (AGENTS.md §5, §16). In
 * M1 there is no simulation yet, so the per-frame hook only advances the camera
 * controls; M2+ will step the fixed-timestep simulation here and render an
 * interpolated view.
 */
export interface ViewportStats {
	fps: number;
	drawCalls: number;
	triangles: number;
}

export class Viewport {
	readonly renderer: THREE.WebGLRenderer;
	private readonly canvas: HTMLCanvasElement;
	private readonly testScene: TestScene;
	private readonly lighting: Lighting;
	private readonly inspectionCamera: InspectionCamera;
	private readonly loop: RenderLoop;
	private readonly resizeObserver: ResizeObserver;

	private frameCount = 0;
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

		this.loop = new RenderLoop(() => this.renderFrame());

		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(this.canvas);
		this.resize();
	}

	get frames(): number {
		return this.frameCount;
	}

	start(onStats?: (stats: ViewportStats) => void): void {
		this.onStats = onStats;
		this.loop.start();
	}

	stop(): void {
		this.loop.stop();
	}

	dispose(): void {
		this.loop.stop();
		this.resizeObserver.disconnect();
		this.inspectionCamera.dispose();
		this.lighting.dispose();
		this.testScene.dispose();
		this.renderer.dispose();
	}

	private resize(): void {
		const width = this.canvas.clientWidth || window.innerWidth;
		const height = this.canvas.clientHeight || window.innerHeight;
		this.renderer.setSize(width, height, false);
		this.inspectionCamera.setViewportSize(width, height);
	}

	private renderFrame(): void {
		this.inspectionCamera.update();
		this.renderer.render(this.testScene.scene, this.inspectionCamera.camera);
		this.frameCount += 1;

		if (this.onStats && this.frameCount % 15 === 0) {
			this.onStats({
				fps: this.loop.fps,
				drawCalls: this.renderer.info.render.calls,
				triangles: this.renderer.info.render.triangles
			});
		}
	}
}
