import { GRAVITY_MPS2 } from '../core/constants';

/**
 * Lean geometry (MOTORCYCLE-PHYSICS.md §37–39).
 *
 * These are *references and equilibrium targets*, not rules that assign roll —
 * the motorcycle's roll is a physical state integrated by the rigid body and
 * held near equilibrium by the balance controller (AGENTS.md §13, §88).
 */

/** Steady-state lean for a flat, constant-radius corner: φ = atan(v² / (r·g))  (§37). */
export function equilibriumLeanRad(speedMps: number, radiusM: number): number {
	if (radiusM <= 0) return 0;
	return Math.atan((speedMps * speedMps) / (radiusM * GRAVITY_MPS2));
}

/** Equivalently, from lateral acceleration: φ = atan(a_y / g)  (§37). */
export function leanFromLateralAccelRad(lateralAccelMps2: number): number {
	return Math.atan(lateralAccelMps2 / GRAVITY_MPS2);
}

/** Path radius implied by a speed and yaw rate: r = v / ψ̇  (§40–41). */
export function radiusFromYawRateM(speedMps: number, yawRateRadS: number): number {
	if (Math.abs(yawRateRadS) < 1e-4) return Infinity;
	return speedMps / yawRateRadS;
}

/**
 * Reduced roll model acceleration (§39), for reference / validation:
 *
 *   I_φ·φ̈ = K_a·(φ_target − φ) − C_φ·φ̇ + M_disturbance
 *
 * OpenRide realises this through the balance controller acting on the rigid
 * body rather than integrating it standalone, but the shape is the same.
 */
export function reducedRollAccelRadS2(params: {
	rollRad: number;
	rollRateRadS: number;
	targetLeanRad: number;
	rollInertiaKgM2: number;
	stiffnessNmPerRad: number;
	dampingNmSPerRad: number;
	disturbanceNm?: number;
}): number {
	const { rollRad, rollRateRadS, targetLeanRad, rollInertiaKgM2 } = params;
	const restoring = params.stiffnessNmPerRad * (targetLeanRad - rollRad);
	const damping = params.dampingNmSPerRad * rollRateRadS;
	return (restoring - damping + (params.disturbanceNm ?? 0)) / rollInertiaKgM2;
}
