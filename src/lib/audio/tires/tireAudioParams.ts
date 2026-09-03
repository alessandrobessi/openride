/**
 * Speed + surface + tyre load → rolling-noise parameters (milestone M24).
 * Pure and unit-tested. For the Stelvio MVP the only surface is dry asphalt,
 * but the shape (roughness → grain, brightness) is surface-driven so more can
 * be added later without touching the audio graph.
 */

export const TIRE_REFERENCE_MPS = 60;

export interface TireSurface {
	/** 0 = glass-smooth, 1 = coarse chip — scales grain and darkens the roll. */
	roughness: number;
	/** Overall loudness multiplier for the surface. */
	loudness: number;
}

/** Dry asphalt (matches simulation `world/surface.ts` DRY_ASPHALT for MVP). */
export const ASPHALT: TireSurface = { roughness: 0.28, loudness: 1 };

export interface TireAudioInputs {
	speedMps: number;
	surface: TireSurface;
	/** Grip utilisation 0..1+ — scrub adds level when the tyre is worked hard. */
	gripUtilization: number;
}

export interface TireAudioParams {
	/** Rolling-roar level, linear 0..1. */
	level: number;
	/** Low-pass cutoff, Hz. */
	cutoffHz: number;
	/** Coarse-grain (chip) noise level, linear 0..1. */
	grainLevel: number;
}

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * clamp01(t);

export function tireAudioParams(i: TireAudioInputs): TireAudioParams {
	const s = clamp01(Math.abs(i.speedMps) / TIRE_REFERENCE_MPS);
	const rough = clamp01(i.surface.roughness);
	const scrub = clamp01((i.gripUtilization - 0.6) / 0.4); // only near the limit

	const level = (Math.pow(s, 1.1) * (0.55 + 0.45 * rough) + 0.12 * scrub * s) * i.surface.loudness;
	const cutoffHz = lerp(180, 2400, s) * lerp(1.1, 0.75, rough);
	const grainLevel = rough * Math.pow(s, 1.2) * 0.5;

	return {
		level: clamp01(level),
		cutoffHz: Math.max(120, cutoffHz),
		grainLevel: clamp01(grainLevel)
	};
}
