/**
 * Tyre slip quantities (MOTORCYCLE-PHYSICS.md §32–33).
 */

const LOW_SPEED_EPS_MPS = 0.5;

/**
 * Longitudinal slip ratio (§32):
 *
 *   κ = (ω·r − v_x) / max(|v_x|, ε)
 *
 * κ ≈ 0 rolling, κ > 0 drive slip (wheelspin), κ < 0 braking slip (toward lock).
 * At very low speed the denominator is floored to keep it well-behaved.
 */
export function slipRatio(
	wheelOmegaRadS: number,
	wheelRadiusM: number,
	contactSpeedMps: number
): number {
	const wheelSurfaceSpeed = wheelOmegaRadS * wheelRadiusM;
	const denom = Math.max(Math.abs(contactSpeedMps), LOW_SPEED_EPS_MPS);
	return (wheelSurfaceSpeed - contactSpeedMps) / denom;
}

/**
 * Tyre slip angle (§33):
 *
 *   α = atan2(v_y, |v_x| + ε) − δ
 *
 * `v_y` is the lateral contact-patch velocity, `v_x` the longitudinal one, `δ`
 * the wheel steer angle (0 for the rear).
 */
export function slipAngleRad(
	lateralSpeedMps: number,
	longitudinalSpeedMps: number,
	steerAngleRad: number
): number {
	return (
		Math.atan2(lateralSpeedMps, Math.abs(longitudinalSpeedMps) + LOW_SPEED_EPS_MPS) - steerAngleRad
	);
}
