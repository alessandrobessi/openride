import { clamp, smoothstep } from '../core/math';
import type { RiderSteeringProfile } from './RiderProfile';

/**
 * Countersteering (MOTORCYCLE-PHYSICS.md §42–45, OPENRIDE-BLUEPRINT.md §19).
 *
 * At speed a rider initiates a left turn by briefly steering *right*: the front
 * contact force rolls the bike left, then it turns left from the lean. OpenRide
 * models this as a rider feed-forward, layered on the balance controller:
 *
 *   M_cs = K_cs · e_φ · w(v)        (§44)  — a turn-in roll moment that fades
 *                                          as the lean error e_φ closes;
 *   δ_cs = −sign(lean change) · … · w(v)   — the transient opposite steering
 *                                          angle, for telemetry / §75.
 *
 * `w(v)` (speed weight) takes it to zero at parking speed, where direct
 * steering is used instead (§45).
 */
export interface CountersteerOutput {
	/** Extra roll moment assisting turn-in, N·m (added to the balance torque). */
	rollMomentNm: number;
	/** Transient steering angle: opposite to the turn during turn-in, rad (telemetry). */
	steerAngleRad: number;
	/** Speed weight 0 → 1 applied to the countersteer effect. */
	speedWeight: number;
}

const ROLL_MOMENT_SCALE = 26; // N·m per (countersteerGain · rad of lean error)
const COUNTER_ANGLE_SCALE = 0.09; // rad of opposite steer per unit turn-in demand

export function countersteer(params: {
	leanRad: number;
	leanRateRadS: number;
	targetLeanRad: number;
	speedMps: number;
	profile: RiderSteeringProfile;
}): CountersteerOutput {
	const { leanRad, leanRateRadS, targetLeanRad, speedMps, profile } = params;
	const speed = Math.abs(speedMps);
	const speedWeight = smoothstep(
		profile.lowSpeedTransitionStartMps,
		profile.lowSpeedTransitionEndMps,
		speed
	);

	const leanError = targetLeanRad - leanRad;

	// Turn-in roll moment: proportional to the lean error, fades as it closes.
	const rollMomentNm = profile.countersteerGain * ROLL_MOMENT_SCALE * leanError * speedWeight;

	// How hard the rider is still trying to change the lean. While turning in the
	// handlebars sit *opposite* to the turn: the geometric steer angle for the
	// established turn has the opposite sign to the lean error driving turn-in,
	// so the countersteer telemetry follows the lean-error sign directly.
	const turnInDemand = leanError - 0.2 * leanRateRadS;
	const steerAngleRad =
		Math.sign(turnInDemand) *
		Math.min(Math.abs(turnInDemand), 1) *
		COUNTER_ANGLE_SCALE *
		speedWeight;

	return {
		rollMomentNm: clamp(
			rollMomentNm,
			-profile.maxSteeringTorqueNm * 12,
			profile.maxSteeringTorqueNm * 12
		),
		steerAngleRad,
		speedWeight
	};
}
