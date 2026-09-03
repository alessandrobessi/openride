/**
 * Rolling resistance (MOTORCYCLE-PHYSICS.md §12):
 *
 *   F_rr = C_rr · F_z
 *
 * where `F_z` is the supported normal load (already reduced by cos θ on a slope
 * via the axle loads / gradient normal scale). Opposes the direction of travel.
 * `C_rr` is a surface property (see `world/surface.ts`), not a motorcycle
 * constant.
 */
export function rollingResistanceForceN(
	normalLoadN: number,
	rollingResistanceCoeff: number
): number {
	return rollingResistanceCoeff * Math.max(normalLoadN, 0);
}
