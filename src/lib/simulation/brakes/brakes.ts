import { clamp } from '../core/math';
import type { BrakeConfig, GeometryConfig } from '../motorcycle/config';

/**
 * Ideal longitudinal braking force from brake-torque demand
 * (MOTORCYCLE-PHYSICS.md §25):
 *
 *   F_b = u_b · T_b,max / r
 *
 * per axle, summed. Inputs are normalised 0..1. The result is the *ideal*
 * demand; actual force is grip-limited from M10 (bounded tyre grip) and
 * modulated by ABS from M12. Brake response lag (config `*ResponseTimeS`) is
 * applied by the caller / control layer, not here.
 */
export interface BrakeForces {
	frontN: number;
	rearN: number;
	totalN: number;
}

export function brakeForcesN(
	frontBrake01: number,
	rearBrake01: number,
	brakes: BrakeConfig,
	geometry: GeometryConfig
): BrakeForces {
	const frontN = (clamp(frontBrake01, 0, 1) * brakes.frontMaxTorqueNm) / geometry.frontWheelRadiusM;
	const rearN = (clamp(rearBrake01, 0, 1) * brakes.rearMaxTorqueNm) / geometry.rearWheelRadiusM;
	return { frontN, rearN, totalN: frontN + rearN };
}
