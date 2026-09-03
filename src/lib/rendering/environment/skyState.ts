/**
 * Time-of-day → sky / sun / fog parameters (milestone M28). A simple, plausible
 * daily arc (not an ephemeris): the sun climbs from the eastern horizon at
 * ~06:00 to a southern peak at noon and sets in the west at ~18:00, with light,
 * colour and haze following it. Pure and unit-tested; `createSkyAndLighting`
 * turns it into a Three sky mesh, lights and fog.
 */

export interface SkyState {
	/** Sun elevation above the horizon, radians (negative at night). */
	sunElevationRad: number;
	/** Sun azimuth, radians — 0 = north, increasing clockwise (towards east). */
	sunAzimuthRad: number;
	/** 0 at/under the horizon, 1 with the sun high. */
	dayFactor: number;
	/** Directional-light intensity. */
	lightIntensity: number;
	/** Directional-light colour, 0xRRGGBB. */
	lightColor: number;
	/** Hemisphere-light intensity. */
	ambientIntensity: number;
	/** Exponential fog colour + density (mountain haze). */
	fogColor: number;
	fogDensity: number;
	/** Peak elevation used for the sky shader, radians. */
	turbidity: number;
}

const DEG = Math.PI / 180;
/** Stelvio is at ~46.5° N; midsummer noon sun ≈ 67°. Use a gentle 62°. */
const MAX_ELEVATION_RAD = 62 * DEG;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * clamp01(t);

/** Component-wise lerp between two packed 0xRRGGBB colours. */
function lerpColor(a: number, b: number, t: number): number {
	const ar = (a >> 16) & 255;
	const ag = (a >> 8) & 255;
	const ab = a & 255;
	const br = (b >> 16) & 255;
	const bg = (b >> 8) & 255;
	const bb = b & 255;
	const r = Math.round(lerp(ar, br, t));
	const g = Math.round(lerp(ag, bg, t));
	const bl = Math.round(lerp(ab, bb, t));
	return (r << 16) | (g << 8) | bl;
}

export function skyStateForHour(hour: number): SkyState {
	const h = ((hour % 24) + 24) % 24;

	// Elevation: a sine arc, zero at 06:00 / 18:00, peak at noon, below at night.
	const dayPhase = ((h - 6) / 12) * Math.PI;
	const sunElevationRad = Math.sin(dayPhase) * MAX_ELEVATION_RAD;

	// Azimuth: east (90°) at sunrise → south (180°) at noon → west (270°) at sunset,
	// then wrapping through the night.
	const sunAzimuthRad = ((90 + ((h - 6) / 12) * 180) * DEG) % (Math.PI * 2);

	const dayFactor = clamp01(Math.sin(Math.max(0, sunElevationRad)) / Math.sin(MAX_ELEVATION_RAD));
	// How close to the horizon the sun is while still up (1 = on the horizon).
	const horizonFactor = sunElevationRad > 0 ? clamp01(1 - sunElevationRad / (12 * DEG)) : 0;

	const lightIntensity = lerp(0.06, 3.0, dayFactor); // moonlight floor → full sun
	const ambientIntensity = lerp(0.12, 1.15, dayFactor);

	// Warm the sunlight and the haze near sunrise / sunset.
	const lightColor = lerpColor(0xfff2dd, 0xff8f52, horizonFactor);

	const dayFog = 0xaebdc9;
	const nightFog = 0x0c1018;
	let fogColor = lerpColor(nightFog, dayFog, dayFactor);
	fogColor = lerpColor(fogColor, 0xcaa07a, horizonFactor * 0.6);
	const fogDensity = lerp(0.0016, 0.00055, dayFactor);

	const turbidity = lerp(2.2, 4.5, dayFactor);

	return {
		sunElevationRad,
		sunAzimuthRad,
		dayFactor,
		lightIntensity,
		lightColor,
		ambientIntensity,
		fogColor,
		fogDensity,
		turbidity
	};
}
