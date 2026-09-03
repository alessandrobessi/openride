import { GRAVITY_MPS2 } from '../core/constants';

/**
 * Road-gradient force resolution (MOTORCYCLE-PHYSICS.md §10, §12).
 *
 * Grade is a *fraction* (rise / run): 0.10 is a 10 % slope, not 10°. Do not
 * confuse the two. This is essential for the Stelvio climb.
 *
 * The MVP applies the gradient purely longitudinally while keeping level-road
 * axle-load equations (MOTORCYCLE-PHYSICS.md §28); road-normal gravity
 * components come with real terrain contact later.
 */
export interface GradientForces {
	/** Component of gravity resisting uphill travel, N (positive uphill). */
	alongSlopeN: number;
	/** cos θ factor for scaling the normal load / rolling resistance on a slope. */
	normalScale: number;
	angleRad: number;
}

export function gradientForces(massKg: number, gradeFraction: number): GradientForces {
	const angleRad = Math.atan(gradeFraction);
	return {
		alongSlopeN: massKg * GRAVITY_MPS2 * Math.sin(angleRad),
		normalScale: Math.cos(angleRad),
		angleRad
	};
}
