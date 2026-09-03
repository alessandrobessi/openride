/**
 * Road-surface physical properties (MOTORCYCLE-PHYSICS.md §54,
 * OPENRIDE-BLUEPRINT.md §24). These belong to the *surface*, not the
 * motorcycle. The Stelvio MVP begins on dry asphalt.
 *
 * `muLongitudinal` / `muLateral` are consumed from M10 (bounded tyre grip);
 * `rollingResistance` is used from M4.
 */
export interface SurfacePhysics {
	rollingResistance: number;
	muLongitudinal: number;
	muLateral: number;
}

/** ADVENTURE-1200.md §10–11 baseline for dry asphalt. */
export const DRY_ASPHALT: SurfacePhysics = {
	rollingResistance: 0.015,
	muLongitudinal: 1.15,
	muLateral: 1.1
};
