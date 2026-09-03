import type { TorquePoint } from '../motorcycle/config';

/**
 * Full-throttle engine torque, linearly interpolated between sampled points
 * (MOTORCYCLE-PHYSICS.md §15, OPENRIDE-BLUEPRINT.md §15). Below the first / above
 * the last sample the endpoint value is held.
 *
 * The curve must be sorted by ascending RPM (the ADVENTURE-1200 table is).
 */
export function interpolateTorqueNm(curve: readonly TorquePoint[], rpm: number): number {
	if (curve.length === 0) return 0;
	if (rpm <= curve[0].rpm) return curve[0].torqueNm;
	const last = curve[curve.length - 1];
	if (rpm >= last.rpm) return last.torqueNm;

	for (let i = 1; i < curve.length; i++) {
		const b = curve[i];
		if (rpm <= b.rpm) {
			const a = curve[i - 1];
			const t = (rpm - a.rpm) / (b.rpm - a.rpm);
			return a.torqueNm + t * (b.torqueNm - a.torqueNm);
		}
	}
	return last.torqueNm;
}

export const RPM_PER_RAD_S = 60 / (2 * Math.PI);

export function rpmFromOmega(omegaRadS: number): number {
	return omegaRadS * RPM_PER_RAD_S;
}

export function omegaFromRpm(rpm: number): number {
	return rpm / RPM_PER_RAD_S;
}
