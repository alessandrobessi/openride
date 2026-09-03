import { IDENTITY_QUAT, ZERO_VEC3, type Quat, type Vec3 } from '../core/math';

/**
 * The single authoritative simulation state for one motorcycle
 * (MOTORCYCLE-PHYSICS.md §6, AGENTS.md §9). Do not keep a second authoritative
 * copy of any field elsewhere.
 *
 * Chassis pose and velocity are *owned by the Rapier rigid body* and mirrored
 * here each step for controllers, telemetry and rendering. Suspension
 * compression and axle normal loads are computed by OpenRide from the wheel
 * contact model. Fields not yet driven by a milestone stay at their neutral
 * defaults.
 */
export interface MotorcycleState {
	// --- chassis pose (mirrored from Rapier) ---
	positionWorldM: Vec3;
	linearVelocityWorldMps: Vec3;
	angularVelocityWorldRadS: Vec3;
	orientationWorld: Quat;
	/** Derived from `orientationWorld`; cached for controllers/telemetry. */
	yawRad: number;
	pitchRad: number;
	rollRad: number;
	/** Signed forward ground speed along the horizontal heading, m/s (derived). */
	forwardSpeedMps: number;
	/** Road gradient at the contact, radians (derived; + = uphill ahead). */
	roadGradientRad: number;

	// --- controls (normalised, set by the rider/input layer) ---
	throttle: number; // 0..1
	clutch: number; // 0..1 (1 = fully engaged)
	frontBrake: number; // 0..1
	rearBrake: number; // 0..1
	steeringInput: number; // -1..1 turn intention
	steeringAngleRad: number;

	// --- driveline (M5+/M6+) ---
	engineOmegaRadS: number;
	engineRPM: number;
	/** Net crankshaft torque (combustion − friction/engine-braking), N·m. */
	engineTorqueNm: number;
	engineStalled: boolean;
	gear: number; // 0 = neutral
	frontWheelOmegaRadS: number;
	rearWheelOmegaRadS: number;
	/** Longitudinal force delivered at the rear contact patch, N (+ drive / − engine braking). */
	driveForceN: number;

	// --- suspension / contact (M3+) ---
	frontSuspensionCompressionM: number;
	rearSuspensionCompressionM: number;
	frontContactGround: boolean;
	rearContactGround: boolean;
	frontNormalLoadN: number;
	rearNormalLoadN: number;

	// --- tyres (M10+) ---
	frontSlipRatio: number;
	rearSlipRatio: number;
	frontSlipAngleRad: number;
	rearSlipAngleRad: number;
}

export function createMotorcycleState(): MotorcycleState {
	return {
		positionWorldM: { ...ZERO_VEC3 },
		linearVelocityWorldMps: { ...ZERO_VEC3 },
		angularVelocityWorldRadS: { ...ZERO_VEC3 },
		orientationWorld: { ...IDENTITY_QUAT },
		yawRad: 0,
		pitchRad: 0,
		rollRad: 0,
		forwardSpeedMps: 0,
		roadGradientRad: 0,

		throttle: 0,
		clutch: 1,
		frontBrake: 0,
		rearBrake: 0,
		steeringInput: 0,
		steeringAngleRad: 0,

		engineOmegaRadS: 0,
		engineRPM: 0,
		engineTorqueNm: 0,
		engineStalled: false,
		gear: 0,
		frontWheelOmegaRadS: 0,
		rearWheelOmegaRadS: 0,
		driveForceN: 0,

		frontSuspensionCompressionM: 0,
		rearSuspensionCompressionM: 0,
		frontContactGround: false,
		rearContactGround: false,
		frontNormalLoadN: 0,
		rearNormalLoadN: 0,

		frontSlipRatio: 0,
		rearSlipRatio: 0,
		frontSlipAngleRad: 0,
		rearSlipAngleRad: 0
	};
}
