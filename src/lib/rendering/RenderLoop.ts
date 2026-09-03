/**
 * A `requestAnimationFrame` render loop with a clamped frame delta and a rolling
 * FPS estimate.
 *
 * This drives *rendering only*. Core physics must never be stepped from the raw
 * `requestAnimationFrame` delta (AGENTS.md §6); the fixed-step simulation loop
 * (M2+) will consume `frameDeltaS` through its own accumulator.
 */
export interface RenderLoopFrame {
	/** Seconds since the previous frame, clamped to `maxFrameDeltaS`. */
	frameDeltaS: number;
	/** Monotonic seconds since the loop started. */
	elapsedS: number;
	/** Rolling frames-per-second estimate. */
	fps: number;
}

export interface RenderLoopOptions {
	/**
	 * Upper bound on a single frame delta, in seconds. Protects against huge
	 * catch-up steps after the tab was backgrounded (MOTORCYCLE-PHYSICS.md §65).
	 */
	maxFrameDeltaS?: number;
}

export class RenderLoop {
	private readonly onFrame: (frame: RenderLoopFrame) => void;
	private readonly maxFrameDeltaS: number;

	private rafId = 0;
	private running = false;
	private startTimeMs = 0;
	private lastFrameMs = 0;

	private fpsAccumS = 0;
	private fpsFrames = 0;
	private fpsValue = 0;

	constructor(onFrame: (frame: RenderLoopFrame) => void, options: RenderLoopOptions = {}) {
		this.onFrame = onFrame;
		this.maxFrameDeltaS = options.maxFrameDeltaS ?? 0.25;
	}

	get isRunning(): boolean {
		return this.running;
	}

	get fps(): number {
		return this.fpsValue;
	}

	start(): void {
		if (this.running) return;
		this.running = true;
		this.startTimeMs = performance.now();
		this.lastFrameMs = this.startTimeMs;
		this.rafId = requestAnimationFrame(this.tick);
	}

	stop(): void {
		if (!this.running) return;
		this.running = false;
		cancelAnimationFrame(this.rafId);
	}

	private readonly tick = (nowMs: number): void => {
		if (!this.running) return;
		this.rafId = requestAnimationFrame(this.tick);

		const rawDeltaS = (nowMs - this.lastFrameMs) / 1000;
		this.lastFrameMs = nowMs;
		const frameDeltaS = Math.min(Math.max(rawDeltaS, 0), this.maxFrameDeltaS);

		this.fpsAccumS += rawDeltaS;
		this.fpsFrames += 1;
		if (this.fpsAccumS >= 0.5) {
			this.fpsValue = this.fpsFrames / this.fpsAccumS;
			this.fpsAccumS = 0;
			this.fpsFrames = 0;
		}

		this.onFrame({
			frameDeltaS,
			elapsedS: (nowMs - this.startTimeMs) / 1000,
			fps: this.fpsValue
		});
	};
}
