import type { AeroConfig } from '../motorcycle/config';

/**
 * Aerodynamic drag magnitude (MOTORCYCLE-PHYSICS.md §11, OPENRIDE-BLUEPRINT.md
 * §14):
 *
 *   F_d = ½ · ρ · C_d · A · v²
 *
 * Pure. `airSpeedMps` is the air-relative forward speed; M4 assumes still air so
 * this is the ground speed. The caller applies the result opposite to the
 * direction of travel. Top speed must emerge from where this balances drive —
 * never hardcode it (MOTORCYCLE-PHYSICS.md §11).
 */
export function dragForceN(airSpeedMps: number, aero: AeroConfig): number {
	const q = 0.5 * aero.airDensityKgM3 * aero.dragCoefficient * aero.frontalAreaM2;
	return q * airSpeedMps * airSpeedMps;
}

/** The speed-independent drag coefficient ½·ρ·C_d·A (N per (m/s)²). */
export function dragCoefficientNPerMps2(aero: AeroConfig): number {
	return 0.5 * aero.airDensityKgM3 * aero.dragCoefficient * aero.frontalAreaM2;
}
