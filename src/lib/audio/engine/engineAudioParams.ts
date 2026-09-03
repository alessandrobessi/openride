/**
 * Maps a `MotorcycleState` sample to procedural engine-synth parameters
 * (milestone M23, AGENTS.md §21 — layered synthesis, never a single pitched
 * loop). Pure and unit-tested; {@link EngineAudio} turns these into a Web Audio
 * graph.
 */

/** Firing events per crankshaft revolution for the default twin (4-stroke). */
export const FIRINGS_PER_REV = 1;

export interface EngineAudioInputs {
	rpm: number;
	idleRpm: number;
	redlineRpm: number;
	/** Actual throttle after response lag, 0..1. */
	throttle: number;
	/** Load proxy, 0..1 (e.g. positive engine torque over peak torque). */
	load01: number;
	/** Closed throttle while spinning well above idle in gear. */
	engineBraking: boolean;
	stalled: boolean;
}

export interface EngineAudioParams {
	/** Cylinder firing frequency — the tone bed's fundamental, Hz. */
	fundamentalHz: number;
	/** Roughness between the two detuned oscillators, cents. */
	detuneCents: number;
	/** Sub-oscillator level (at half the fundamental), linear 0..1. */
	subGain: number;
	/** Oscillator bed level, linear 0..1. */
	toneGain: number;
	/** Low-pass cutoff for the tone bed, Hz — brighter with revs / throttle. */
	brightnessHz: number;
	/** Intake / mechanical noise bed level, linear 0..1. */
	noiseGain: number;
	/** Band-pass centre for the noise bed, Hz. */
	noiseCenterHz: number;
	/** Overrun burble amount, 0..1. */
	overrunLevel: number;
	/** Master level, linear 0..1 — zero when stalled. */
	masterGain: number;
}

const clamp = (v: number, lo: number, hi: number): number =>
	Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo;
const clamp01 = (v: number): number => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * clamp01(t);

export function engineAudioParams(i: EngineAudioInputs): EngineAudioParams {
	const throttle = clamp01(i.throttle);
	const load = clamp01(i.load01);
	const span = Math.max(1, i.redlineRpm - i.idleRpm);
	const revFrac = clamp01((i.rpm - i.idleRpm) / span);

	const fundamentalHz = clamp((Math.max(0, i.rpm) / 60) * FIRINGS_PER_REV, 6, 420);

	const overrunLevel = i.engineBraking && !i.stalled ? clamp01(0.35 + 0.65 * revFrac) : 0;
	const darken = overrunLevel > 0 ? 0.62 : 1;

	const brightnessHz =
		lerp(480, 4200, revFrac) * lerp(0.55, 1, throttle) * lerp(1, 1.25, load) * darken;

	const toneGain = lerp(0.16, 0.46, revFrac) * (0.45 + 0.55 * throttle) + overrunLevel * 0.12;
	const subGain = lerp(0.22, 0.44, revFrac);
	const noiseGain =
		lerp(0.05, 0.2, revFrac) * (0.35 + 0.65 * throttle) + overrunLevel * 0.18 + load * 0.04;
	const noiseCenterHz = lerp(600, 3000, revFrac) * darken;
	const detuneCents = lerp(6, 20, revFrac) + load * 8;

	const drive = clamp01(0.4 * revFrac + 0.35 * throttle + 0.15 * load + 0.1 * overrunLevel);
	const masterGain = i.stalled ? 0 : lerp(0.32, 0.92, drive);

	return {
		fundamentalHz,
		detuneCents,
		subGain,
		toneGain: clamp01(toneGain),
		brightnessHz: clamp(brightnessHz, 200, 12000),
		noiseGain: clamp01(noiseGain),
		noiseCenterHz: clamp(noiseCenterHz, 200, 8000),
		overrunLevel,
		masterGain: clamp01(masterGain)
	};
}
