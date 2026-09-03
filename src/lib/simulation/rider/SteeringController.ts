import { clamp, smoothstep } from '../core/math';
import { leanFromLateralAccelRad } from './leanModel';
import type { RiderProfile } from './RiderProfile';

/**
 * Turns the rider's turn intention `u_s ∈ [−1, 1]` into a curvature (yaw-rate)
 * command and a *derived* target lean (MOTORCYCLE-PHYSICS.md §37–43).
 *
 *   ψ̇_target  = u_s · k, capped so |a_y| = |v·ψ̇| ≤ a_y,max; blended with a
 *               direct parking-speed steer at low speed (§45)
 *   a_y,target = v · ψ̇_target
 *   φ_target   = atan(a_y,target / g)               (§37, §43)
 *
 * Because the lean target is derived from `v · ψ̇`, the same turn intention
 * produces more lean at higher speed and more lean as the radius tightens —
 * lean varies naturally with speed and corner radius (M8). The target is
 * slew-rate-limited so a step input cannot snap the bike over.
 *
 * **Still M7-provisional**: the yaw command is realised by a yaw-rate tracking
 * torque + a provisional cornering force; M9 replaces that with a
 * countersteering steer torque acting through the front contact, and M10 adds
 * real tyre lateral forces.
 */
export interface SteeringCommand {
	targetLeanRad: number;
	targetYawRateRadS: number;
	/** Geometric steering angle estimate for telemetry (bicycle model, §40). */
	steeringAngleRad: number;
}

/** Curvature demand at full intention, rad/s (before the lateral-accel cap). */
const TURN_INTENT_YAW_GAIN = 0.8;
const LOW_SPEED_YAW_GAIN = 1.8; // rad/s per unit u_s at parking speed
const MIN_CORNER_SPEED_MPS = 1.0;
/** How fast the rider rolls the bike into / out of lean, rad/s. */
const MAX_LEAN_RATE_RAD_S = 0.9;

export class SteeringController {
	private readonly profile: RiderProfile;
	private readonly wheelbaseM: number;
	private readonly maxLeanRad: number;
	private currentTargetLeanRad = 0;

	constructor(profile: RiderProfile, wheelbaseM: number, maxLeanRad: number) {
		this.profile = profile;
		this.wheelbaseM = wheelbaseM;
		this.maxLeanRad = maxLeanRad;
	}

	command(turnIntention: number, speedMps: number, dtS: number): SteeringCommand {
		const us = clamp(turnIntention, -1, 1);
		const speed = Math.abs(speedMps);
		const ayMax = this.profile.maxTargetLateralAccelerationMps2;

		// Curvature demand, capped so lateral acceleration stays within the rider's
		// limit (this is what stops a full-lock input from spinning at low speed).
		const yawRateCap = ayMax / Math.max(speed, MIN_CORNER_SPEED_MPS);
		let targetYawRateRadS = clamp(us * TURN_INTENT_YAW_GAIN, -yawRateCap, yawRateCap);

		// Low speed: blend toward direct (parking-lot) steering (§45).
		const highSpeedBlend = smoothstep(
			this.profile.steering.lowSpeedTransitionStartMps,
			this.profile.steering.lowSpeedTransitionEndMps,
			speed
		);
		targetYawRateRadS =
			(1 - highSpeedBlend) * (us * LOW_SPEED_YAW_GAIN) + highSpeedBlend * targetYawRateRadS;

		// Target lean DERIVED from the cornering demand — varies with speed/radius.
		// The rider leans *into* the turn: a left turn (positive yaw rate in this
		// frame) is a left lean, which is a negative roll about the forward axis
		// (positive roll tips the rider's left side up). Hence the sign.
		const ayTarget = speed * targetYawRateRadS;
		const commandedLeanRad = clamp(
			-leanFromLateralAccelRad(ayTarget),
			-this.maxLeanRad,
			this.maxLeanRad
		);
		const maxStep = MAX_LEAN_RATE_RAD_S * dtS;
		this.currentTargetLeanRad += clamp(
			commandedLeanRad - this.currentTargetLeanRad,
			-maxStep,
			maxStep
		);

		const steeringAngleRad = Math.atan(
			(targetYawRateRadS * this.wheelbaseM) / Math.max(speed, 0.5)
		);

		return {
			targetLeanRad: this.currentTargetLeanRad,
			targetYawRateRadS,
			steeringAngleRad
		};
	}
}
