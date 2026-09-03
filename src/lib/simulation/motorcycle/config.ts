/**
 * Motorcycle configuration types, grouped by the ownership tree in
 * ADVENTURE-1200.md §20:
 *
 *   MotorcycleConfig
 *   ├── physical    (mass, geometry, inertia, aero)
 *   ├── powertrain  (engine, torque curve, gearbox, clutch)
 *   └── chassis     (tyres, brakes, suspension, rolling resistance)
 *
 * The virtual rider is deliberately *not* part of this — see
 * `simulation/rider/profiles/` — so one machine can be paired with different
 * rider profiles.
 *
 * These are calibration parameters, not claimed manufacturer values
 * (AGENTS.md §11, MOTORCYCLE-PHYSICS.md §7). Baseline numbers come from
 * ADVENTURE-1200.md and are expected to be tuned.
 */

export interface MassConfig {
	bikeKg: number;
	riderKg: number;
	totalKg: number;
}

export interface GeometryConfig {
	wheelbaseM: number;
	/** Horizontal CG distance measured forward from the rear-wheel contact point. */
	cgFromRearAxleM: number;
	/** Combined bike + rider CG height above the ground. */
	cgHeightM: number;
	frontWheelRadiusM: number;
	rearWheelRadiusM: number;
	frontSuspensionTravelM: number;
	rearSuspensionTravelM: number;
	maxSteeringAngleRad: number;
	maxLeanAngleRad: number;
}

export interface InertiaConfig {
	/** Roll = about the body forward (+z) axis. */
	rollKgM2: number;
	/** Pitch = about the body right (+x) axis. */
	pitchKgM2: number;
	/** Yaw = about the body up (+y) axis. */
	yawKgM2: number;
	engineKgM2: number;
	frontWheelKgM2: number;
	rearWheelKgM2: number;
}

export interface AeroConfig {
	dragCoefficient: number;
	frontalAreaM2: number;
	airDensityKgM3: number;
}

export interface PhysicalConfig {
	mass: MassConfig;
	geometry: GeometryConfig;
	inertia: InertiaConfig;
	aero: AeroConfig;
}

export interface EngineConfig {
	displacementCc: number;
	idleRPM: number;
	stallRPM: number;
	redlineRPM: number;
	limiterRPM: number;
	peakPowerKw: number;
	peakPowerRPM: number;
	peakTorqueNm: number;
	peakTorqueRPM: number;
	engineFrictionBaseNm: number;
	engineFrictionPerRadS: number;
	engineBrakeCoefficient: number;
	throttleResponseTimeS: number;
}

export interface TorquePoint {
	rpm: number;
	torqueNm: number;
}

export interface GearboxConfig {
	primaryRatio: number;
	/** Index 0 is neutral (ratio 0), then 1st…6th. */
	gearRatios: number[];
	finalDriveRatio: number;
	efficiency: number;
	shiftCutTimeS: number;
}

export interface ClutchConfig {
	maxTorqueNm: number;
	stiffnessNmPerRadS: number;
}

export interface PowertrainConfig {
	engine: EngineConfig;
	torqueCurve: TorquePoint[];
	gearbox: GearboxConfig;
	clutch: ClutchConfig;
}

export interface AxleSuspensionConfig {
	springRateNPerM: number;
	dampingCompressionNsPerM: number;
	dampingReboundNsPerM: number;
	preloadM: number;
	travelM: number;
}

export interface SuspensionConfig {
	front: AxleSuspensionConfig;
	rear: AxleSuspensionConfig;
}

export interface BrakeConfig {
	frontMaxTorqueNm: number;
	rearMaxTorqueNm: number;
	frontResponseTimeS: number;
	rearResponseTimeS: number;
}

export interface TireConfig {
	frontCorneringStiffnessNPerRad: number;
	rearCorneringStiffnessNPerRad: number;
	frontLongitudinalStiffnessN: number;
	rearLongitudinalStiffnessN: number;
	relaxationTimeS: number;
}

export interface ChassisConfig {
	suspension: SuspensionConfig;
	brakes: BrakeConfig;
	tires: TireConfig;
}

export interface MotorcycleConfig {
	id: string;
	name: string;
	physical: PhysicalConfig;
	powertrain: PowertrainConfig;
	chassis: ChassisConfig;
}

/** Front axle distance forward of the CG, derived from geometry. */
export function frontAxleFromCgM(geometry: GeometryConfig): number {
	return geometry.wheelbaseM - geometry.cgFromRearAxleM;
}
