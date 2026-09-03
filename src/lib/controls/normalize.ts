/**
 * Shared input-conditioning helpers for the control layer (milestone M22).
 * Raw device values never reach the simulation — they pass through here first
 * and come out clamped and normalised (AGENTS.md §15, §26).
 */

/** Clamp to `[0, 1]`, mapping NaN to 0. */
export function clamp01(v: number): number {
	return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0;
}

/** Clamp to `[-1, 1]`, mapping NaN to 0. */
export function clampSigned(v: number): number {
	return Number.isFinite(v) ? Math.min(1, Math.max(-1, v)) : 0;
}

/**
 * One-sided dead zone for a `[0, 1]` axis (triggers): values at or below
 * `dz` read as 0, the rest is rescaled so `dz→0` and `1→1`.
 */
export function deadzone01(v: number, dz: number): number {
	const x = clamp01(v);
	if (x <= dz) return 0;
	return (x - dz) / (1 - dz);
}

/**
 * Symmetric dead zone for a `[-1, 1]` axis (a single stick component):
 * `|v| ≤ dz` reads as 0, the rest is rescaled to keep full range.
 */
export function deadzoneSigned(v: number, dz: number): number {
	const x = clampSigned(v);
	const m = Math.abs(x);
	if (m <= dz) return 0;
	return Math.sign(x) * ((m - dz) / (1 - dz));
}

/**
 * Radial dead zone for a stick: if the vector magnitude is within `dz` both
 * components read as 0; otherwise the magnitude is rescaled `dz→0`, `1→1` and
 * the direction is preserved. Returns the conditioned `[x, y]`.
 */
export function radialDeadzone(x: number, y: number, dz: number): [number, number] {
	const px = clampSigned(x);
	const py = clampSigned(y);
	const mag = Math.hypot(px, py);
	if (mag <= dz) return [0, 0];
	const scaled = Math.min(1, (mag - dz) / (1 - dz)) / mag;
	return [px * scaled, py * scaled];
}

/**
 * Response curve: `sign(v) · |v|^expo`. `expo = 1` is linear; `expo > 1` gives
 * a softer centre and finer low-end control. Input and output share range.
 */
export function expo(v: number, exponent: number): number {
	const e = Math.max(1, exponent);
	return Math.sign(v) * Math.pow(Math.abs(clampSigned(v)), e);
}
