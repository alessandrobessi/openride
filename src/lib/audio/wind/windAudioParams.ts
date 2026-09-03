/**
 * Speed → wind-noise parameters (milestone M24, AGENTS.md §21). Pure and
 * unit-tested; {@link import('../ambient/AmbientAudio').AmbientAudio} realises
 * it as filtered noise. The point of M24 is that perceived speed tracks
 * velocity even with the instruments hidden, so wind must rise steeply.
 */

/** Speed at which wind is treated as "full", m/s (~216 km/h). */
export const WIND_REFERENCE_MPS = 60;

export interface WindAudioParams {
	/** Broadband rush level, linear 0..1. */
	level: number;
	/** High-pass cutoff, Hz — the rush brightens with speed. */
	cutoffHz: number;
	/** Low buffeting rumble level, linear 0..1. */
	buffetLevel: number;
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * clamp01(t);

export function windAudioParams(speedMps: number): WindAudioParams {
	const s = clamp01(Math.abs(speedMps) / WIND_REFERENCE_MPS);

	// Aerodynamic noise grows faster than linearly with speed.
	const level = Math.pow(s, 1.7) * 0.55;
	const cutoffHz = lerp(250, 6500, Math.pow(s, 0.9));
	// Buffeting peaks in the mid range and eases as the rush takes over.
	const buffetLevel = Math.pow(s, 1.3) * (1 - 0.4 * s) * 0.3;

	return {
		level: clamp01(level),
		cutoffHz,
		buffetLevel: clamp01(buffetLevel)
	};
}
