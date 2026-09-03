import { clamp } from '../core/math';

/**
 * **TEMP until M5 (engine) + M6 (gearbox/clutch).**
 *
 * A placeholder tractive force: a constant maximum drive force scaled by
 * throttle. It exists so that acceleration and top speed still *emerge* from the
 * longitudinal force balance (`m·a = F_drive − resistances`) rather than being
 * assigned (AGENTS.md §13). It is deliberately not a real powertrain — no RPM,
 * no gears — so 0–100 km/h time is not representative yet; only the top-speed
 * equilibrium and gradient sensitivity are.
 *
 * Sized so that top speed lands in the ADVENTURE-1200.md §21 range
 * (~200–220 km/h) against baseline drag + rolling resistance. Replaced in M6 by
 * `torque(RPM) · gearRatio · finalDrive · efficiency / rearWheelRadius`.
 */
export const STUB_MAX_DRIVE_FORCE_N = 1000;

export function stubDriveForceN(throttle01: number): number {
	return clamp(throttle01, 0, 1) * STUB_MAX_DRIVE_FORCE_N;
}
