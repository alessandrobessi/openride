import { clamp } from '../core/math';
import type { ClutchConfig } from '../motorcycle/config';

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
 * Pure. A smoother friction curve can replace the linear `k_c·Δω` later (§21).
 */
export function clutchTransferTorqueNm(
	engagementU01: number,
	deltaOmegaRadS: number,
	config: ClutchConfig
): number {
	const capNm = clamp(engagementU01, 0, 1) * config.maxTorqueNm;
	return clamp(config.stiffnessNmPerRadS * deltaOmegaRadS, -capNm, capNm);
}
