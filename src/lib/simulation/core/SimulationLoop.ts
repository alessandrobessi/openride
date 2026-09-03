/**
 * Fixed-timestep accumulator (AGENTS.md §6, OPENRIDE-BLUEPRINT.md §11).
 *
 * Core simulation must advance in fixed increments, never by the raw
 * `requestAnimationFrame` delta. Each rendered frame calls {@link advance} with
 * the real elapsed time; the loop runs zero or more fixed steps and returns an
 * interpolation factor `alpha ∈ [0, 1)` for blending the previous and current
 * simulation states at render time.
 *
 * This module is pure (no Three.js, no Rapier, no DOM) so it runs in headless
 * Node tests.
 */
export interface SimulationLoopOptions {
	/** Fixed step size in seconds. Default 1/120 (MOTORCYCLE-PHYSICS.md §62). */
	fixedDtS?: number;
	/**
	 * Largest real frame delta accepted in one call, in seconds. Longer gaps
	 * (backgrounded tab) are truncated instead of simulated in full
	 * (MOTORCYCLE-PHYSICS.md §65). Default 0.25.
	 */
	maxFrameDeltaS?: number;
	/**
	 * Hard cap on fixed steps per {@link advance} call, a spiral-of-death guard
	 * if a step ever costs more wall time than it represents. Default 8.
	 */
	maxStepsPerFrame?: number;
}

export class SimulationLoop {
	readonly fixedDtS: number;
	private readonly maxFrameDeltaS: number;
	private readonly maxStepsPerFrame: number;

	private accumulatorS = 0;
	private totalSteps = 0;

	constructor(options: SimulationLoopOptions = {}) {
		this.fixedDtS = options.fixedDtS ?? 1 / 120;
		this.maxFrameDeltaS = options.maxFrameDeltaS ?? 0.25;
		this.maxStepsPerFrame = options.maxStepsPerFrame ?? 8;
		if (!(this.fixedDtS > 0)) throw new Error('SimulationLoop: fixedDtS must be > 0');
	}

	/** Total fixed steps executed since construction. */
	get stepCount(): number {
		return this.totalSteps;
	}

	/** Unspent time carried into the next frame, in seconds. */
	get pendingS(): number {
		return this.accumulatorS;
	}

	/**
	 * Advance the accumulator by `frameDeltaS` real seconds, invoking `step` once
	 * per elapsed fixed interval.
	 *
	 * @returns `alpha`, the fraction of a fixed step already accumulated toward
	 *   the next one — the render interpolation factor.
	 */
	advance(frameDeltaS: number, step: (dtS: number) => void): number {
		const clamped = Math.min(Math.max(frameDeltaS, 0), this.maxFrameDeltaS);
		this.accumulatorS += clamped;

		let steps = 0;
		while (this.accumulatorS >= this.fixedDtS && steps < this.maxStepsPerFrame) {
			step(this.fixedDtS);
			this.accumulatorS -= this.fixedDtS;
			steps += 1;
			this.totalSteps += 1;
		}

		// If we hit the step cap, drop the backlog so alpha stays well-defined and
		// the sim does not perpetually chase real time.
		if (this.accumulatorS >= this.fixedDtS) this.accumulatorS = 0;

		return this.accumulatorS / this.fixedDtS;
	}

	/** Discard pending time (e.g. after a hard reset). */
	reset(): void {
		this.accumulatorS = 0;
	}
}
