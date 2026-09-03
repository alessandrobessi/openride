import { clamp, smoothstep } from '../core/math';
import { GRAVITY_MPS2 } from '../core/constants';
import type { RiderProfile } from './RiderProfile';

/**
 * Turns the rider's turn intention `u_s ∈ [−1, 1]` into a target lean and a yaw
 * command (MOTORCYCLE-PHYSICS.md §40–43).
 *
 *   a_y,target = u_s · a_y,max · f(v)          (no cornering at a standstill)
 *   φ_target   = atan(a_y,target / g)          (§37)
 *   ψ̇_target  = blend( direct low-speed steer , g·tan φ / v )   (§41, §45)
 *
 * **M7 scope**: the yaw command is realised by a first-order yaw-rate tracking
 * torque — "arcade-ish" steering that M9 replaces with a countersteering torque
 * acting through the front contact. Marked accordingly.
 */
export interface SteeringCommand {
	targetLeanRad: number;
	targetYawRateRadS: number;
	/** Geometric steering angle estimate for telemetry (bicycle model, §40). */
	steeringAngleRad: number;
}

const LOW_SPEED_YAW_GAIN = 1.2; // rad/s per unit u_s at parking speed
const MIN_CORNER_SPEED_MPS = 1.0;
/** How fast the rider is willing to roll the bike into / out of lean, rad/s. */
const MAX_LEAN_RATE_RAD_S = 0.9;

export class SteeringController {
	private readonly profile: RiderProfile;
	private readonly wheelbaseM: number;
	private readonly maxLeanRad: number;
	/** Slew-limited target lean so a step input does not snap the bike over. */
	private currentTargetLeanRad = 0;

	constructor(profile: RiderProfile, wheelbaseM: number, maxLeanRad: number) {
		this.profile = profile;
		this.wheelbaseM = wheelbaseM;
		this.maxLeanRad = maxLeanRad;
	}

	command(turnIntention: number, speedMps: number, dtS: number): SteeringCommand {
		const us = clamp(turnIntention, -1, 1);
		const speed = Math.abs(speedMps);

		// Lateral-accel demand ramps in from a standstill.
		const cornerReady = smoothstep(0.5, 4, speed);
		const ayTarget = us * this.profile.maxTargetLateralAccelerationMps2 * cornerReady;
		const commandedLeanRad = clamp(
			Math.atan(ayTarget / GRAVITY_MPS2),
			-this.maxLeanRad,
			this.maxLeanRad
		);
		// Slew toward it — the rider leans the bike over at a finite rate.
		const maxStep = MAX_LEAN_RATE_RAD_S * dtS;
		this.currentTargetLeanRad += clamp(
			commandedLeanRad - this.currentTargetLeanRad,
			-maxStep,
			maxStep
		);
		const targetLeanRad = this.currentTargetLeanRad;

		// Low speed: direct steering. High speed: yaw follows lean (steady corner).
		const highSpeedBlend = smoothstep(
			this.profile.steering.lowSpeedTransitionStartMps,
			this.profile.steering.lowSpeedTransitionEndMps,
			speed
		);
		const directYawRate = us * LOW_SPEED_YAW_GAIN;
		const leanLedYawRate =
			(GRAVITY_MPS2 * Math.tan(targetLeanRad)) / Math.max(speed, MIN_CORNER_SPEED_MPS);
		const targetYawRateRadS =
			(1 - highSpeedBlend) * directYawRate + highSpeedBlend * leanLedYawRate;

		// Bicycle-model steering angle for the geometry it implies (telemetry only).
		const steeringAngleRad = Math.atan(
			(targetYawRateRadS * this.wheelbaseM) / Math.max(speed, 0.5)
		);

		return { targetLeanRad, targetYawRateRadS, steeringAngleRad };
	}
}
