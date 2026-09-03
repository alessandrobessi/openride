/**
 * Friction-ellipse grip limit (MOTORCYCLE-PHYSICS.md §30–31, §84,
 * OPENRIDE-BLUEPRINT.md §22).
 *
 *   (F_x / (μ_x·F_z))² + (F_y / (μ_y·F_z))² ≤ 1
 *
 * A single grip budget shared between braking/driving and cornering: if the
 * combined demand exceeds the ellipse, both components are scaled down
 * uniformly so the result sits on it. Returns the grip utilisation `U`
 * (√(...) of the *demand*): U < 1 below the limit, U ≥ 1 saturated.
 */
export interface EllipseResult {
	fxN: number;
	fyN: number;
	/** Demand utilisation before clamping (§84). */
	utilization: number;
	saturated: boolean;
}

export function clampToFrictionEllipse(
	fxDemandN: number,
	fyDemandN: number,
	muX: number,
	muY: number,
	normalLoadN: number
): EllipseResult {
	const xMax = Math.max(muX * normalLoadN, 1e-6);
	const yMax = Math.max(muY * normalLoadN, 1e-6);

	const nx = fxDemandN / xMax;
	const ny = fyDemandN / yMax;
	const utilization = Math.hypot(nx, ny);

	if (utilization <= 1 || normalLoadN <= 0) {
		return { fxN: fxDemandN, fyN: fyDemandN, utilization, saturated: false };
	}
	const scale = 1 / utilization;
	return { fxN: fxDemandN * scale, fyN: fyDemandN * scale, utilization, saturated: true };
}
