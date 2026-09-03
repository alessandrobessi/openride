import { GRAVITY_MPS2 } from '../core/constants';
import type { GeometryConfig } from './config';

/**
 * Static and longitudinally-transferred axle loads (MOTORCYCLE-PHYSICS.md
 * §26–27).
 *
 * Static:  F_zf,0 = m·g·a/L ,  F_zr,0 = m·g·b/L      (a = CG→rear, b = L−a)
 * Transfer under longitudinal acceleration a_x:
 *          F_zf = F_zf,0 − m·a_x·h/L
 *          F_zr = F_zr,0 + m·a_x·h/L
 * so braking (a_x < 0) loads the front and unloads the rear.
 *
 * In OpenRide the *actual* axle loads emerge from the suspension as the chassis
 * pitches (§50); these helpers give the reference the pitch response is tuned to
 * and that the §77 test checks against.
 */
export interface AxleLoads {
	frontN: number;
	rearN: number;
}

export function staticAxleLoadsN(massKg: number, geometry: GeometryConfig): AxleLoads {
	const weightN = massKg * GRAVITY_MPS2;
	const frontFraction = geometry.cgFromRearAxleM / geometry.wheelbaseM; // a / L
	return { frontN: weightN * frontFraction, rearN: weightN * (1 - frontFraction) };
}

/** Signed load moved from rear to front, N. `longAccelMps2` > 0 = accelerating. */
export function longitudinalTransferN(
	massKg: number,
	longAccelMps2: number,
	geometry: GeometryConfig
): number {
	return -(massKg * longAccelMps2 * geometry.cgHeightM) / geometry.wheelbaseM;
}

export function transferredAxleLoadsN(
	massKg: number,
	longAccelMps2: number,
	geometry: GeometryConfig
): AxleLoads {
	const staticLoads = staticAxleLoadsN(massKg, geometry);
	const delta = longitudinalTransferN(massKg, longAccelMps2, geometry);
	return {
		frontN: Math.max(0, staticLoads.frontN + delta),
		rearN: Math.max(0, staticLoads.rearN - delta)
	};
}
