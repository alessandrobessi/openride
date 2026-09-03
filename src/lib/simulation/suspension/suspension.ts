import { clamp } from '../core/math';
import type { AxleSuspensionConfig } from '../motorcycle/config';

/**
 * One-dimensional spring–damper strut force (MOTORCYCLE-PHYSICS.md §48–49,
 * OPENRIDE-BLUEPRINT.md §23). Pure — no engine, no Rapier.
 *
 *   F = k·compression + c·compressionVelocity   (+ bump stop past full travel)
 *
 * with separate compression/rebound damping coefficients, a one-sided spring
 * (a strut cannot pull the wheel down), and a stiff bump stop past full travel.
 * The returned force is the magnitude pushing the chassis away from the wheel,
 * i.e. the tyre normal load (M11 consumes it for weight transfer).
 *
 * `config.preloadM` is deliberately NOT applied as a constant force offset here:
 * with the ADVENTURE-1200 baseline that term (k·preload) alone exceeds the
 * static axle load and the bike would sit on topped-out struts. Preload is a
 * ride-height adjustment; modelling it as a free-length / rest-height offset is
 * a later suspension refinement (MOTORCYCLE-PHYSICS.md §87).
 */
export interface SuspensionForceInput {
	/** Strut compression from full extension, metres (≥ 0; 0 = topped out). */
	compressionM: number;
	/** Rate of change of compression, m/s (+ = compressing). */
	compressionVelMps: number;
}

const BUMP_STOP_RATE_N_PER_M = 400_000;
const BUMP_STOP_DAMPING_NS_PER_M = 8_000;

export function suspensionForceN(
	input: SuspensionForceInput,
	config: AxleSuspensionConfig
): number {
	const { compressionM, compressionVelMps } = input;
	if (compressionM <= 0) return 0; // wheel airborne / strut topped out

	const spring = config.springRateNPerM * compressionM;

	const damping =
		compressionVelMps >= 0
			? config.dampingCompressionNsPerM * compressionVelMps
			: config.dampingReboundNsPerM * compressionVelMps;

	let force = spring + damping;

	// Progressive bump stop once travel is exhausted.
	const overTravel = compressionM - config.travelM;
	if (overTravel > 0) {
		force += BUMP_STOP_RATE_N_PER_M * overTravel;
		if (compressionVelMps > 0) force += BUMP_STOP_DAMPING_NS_PER_M * compressionVelMps;
	}

	// A strut can only push.
	return Math.max(force, 0);
}

/** Clamp a raw geometric compression to the physically meaningful range. */
export function clampCompressionM(rawCompressionM: number, config: AxleSuspensionConfig): number {
	// Allow a little past travel so the bump stop can react before hard clamping.
	return clamp(rawCompressionM, 0, config.travelM * 1.5);
}
