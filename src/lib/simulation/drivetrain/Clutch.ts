import { clamp } from '../core/math';
import type { ClutchConfig } from '../motorcycle/config';

/** Clutch slip-torque capacity, N·m: `T_cap = u_c · T_clutch,max` (§21). */
export function clutchCapacityNm(engagementU01: number, config: ClutchConfig): number {
	return clamp(engagementU01, 0, 1) * config.maxTorqueNm;
}

/**
 * Slipping-clutch transfer torque (MOTORCYCLE-PHYSICS.md §21):
 *
 *   T_cap = u_c · T_clutch,max
 *   T_c   = clamp(k_c · Δω, −T_cap, +T_cap)
 *
 * where `u_c ∈ [0,1]` is the clutch engagement (1 = fully engaged),
 * `Δω = ω_engine − ω_drivetrain` (engine-side), and `k_c` is the clutch
 * stiffness. Positive `T_c` = engine driving the wheel; negative = the wheel
 * back-driving the engine (engine braking through the driveline).
 *
 * This is the plain explicit law; {@link Drivetrain} wraps it in a
 * lock-up solve so a stiff `k_c` stays stable at 120 Hz through the tall low
 * gears. Pure. A smoother friction curve can replace the linear `k_c·Δω`
 * later (§21).
 */
export function clutchTransferTorqueNm(
	engagementU01: number,
	deltaOmegaRadS: number,
	config: ClutchConfig
): number {
	const capNm = clutchCapacityNm(engagementU01, config);
	return clamp(config.stiffnessNmPerRadS * deltaOmegaRadS, -capNm, capNm);
}
