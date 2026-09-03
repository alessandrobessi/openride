import { clamp, dot, normalize, scale, toYawPitchRoll, vec3, type Vec3 } from '../core/math';
import { clampCompressionM, suspensionForceN } from '../suspension/suspension';
import { Engine } from '../engine/Engine';
import { dragForceN } from '../aero/drag';
import { rollingResistanceForceN } from '../tires/rollingResistance';
import { brakeForcesN } from '../brakes/brakes';
import { Drivetrain } from '../drivetrain/Drivetrain';
import { gradientForces } from '../world/gradient';
import { DRY_ASPHALT, type SurfacePhysics } from '../world/surface';
import {
	frontAxleFromCgM,
	type AeroConfig,
	type AxleSuspensionConfig,
	type BrakeConfig,
	type GeometryConfig,
	type MotorcycleConfig
} from './config';
import type { ChassisRig } from './ChassisRig';
import { createMotorcycleState, type MotorcycleState } from './MotorcycleState';

/** Normalised control inputs sampled once per step (MOTORCYCLE-PHYSICS.md §80). */
export interface MotorcycleControls {
	throttle: number; // 0..1
	clutch: number; // 0..1 (1 = engaged)
	frontBrake: number; // 0..1
	rearBrake: number; // 0..1
	steeringInput: number; // -1..1
}

/** Per-step environment around the motorcycle. */
export interface MotorcycleEnvironment {
	/** Road gradient ahead as a fraction (rise/run); + = uphill. */
	gradeFraction: number;
	surface: SurfacePhysics;
}

/**
 * The motorcycle simulation orchestrator (MOTORCYCLE-PHYSICS.md §80,
 * OPENRIDE-BLUEPRINT.md §5). Pure: it depends only on the {@link ChassisRig}
 * interface and the config, never on Rapier or Three.js, so it runs in headless
 * tests.
 *
 * **Scope so far**:
 * - M3 — the two-wheel rig: chassis body, raycast contacts, spring–damper
 *   suspension, a temporary balance stabiliser.
 * - M4 — longitudinal dynamics: net forward force applied at the CG, so speed
 *   emerges from `m·a = ΣF` (AGENTS.md §13).
 * - M5 — engine as an isolated rotational system.
 * - M6 — clutch + gearbox + final drive: the engine now drives (and back-drives)
 *   the rear contact patch. The rear wheel is still locked to ground speed —
 *   tyre-force limits, wheel spin, rider control and weight transfer come next.
 */
interface WheelGeometry {
	/** Strut-top attachment in the body frame: on the axle line, at CG height. */
	strutTopLocalM: Vec3;
	suspension: AxleSuspensionConfig;
}

// TEMP until M7: the virtual-rider balance controller replaces this. It keeps
// the free two-wheel body upright so M3 can be inspected and tested —
// deliberately crude: a roll angle/rate PD about the body forward axis plus
// light angular damping. It applies no lateral or longitudinal force.
const TEMP_ROLL_STIFFNESS_NM_PER_RAD = 4200;
const TEMP_ROLL_DAMPING_NM_S_PER_RAD = 850;
const TEMP_ANGULAR_DAMPING_NM_S = 220;

const DOWN_WORLD: Vec3 = { x: 0, y: -1, z: 0 };
const UP_WORLD: Vec3 = { x: 0, y: 1, z: 0 };
const FORWARD_LOCAL: Vec3 = { x: 0, y: 0, z: 1 };
const RAY_SLACK_M = 0.35;

/** Below this speed, velocity-opposing forces (drag, rolling resistance, brakes) are gated off. */
const SPEED_DEADBAND_MPS = 0.03;

/** Non-authoritative values for debug rendering only. */
export interface MotorcycleDebug {
	frontContactWorldM: Vec3;
	rearContactWorldM: Vec3;
	frontStrutTopWorldM: Vec3;
	rearStrutTopWorldM: Vec3;
}

export class Motorcycle {
	readonly config: MotorcycleConfig;
	readonly state: MotorcycleState;
	readonly debug: MotorcycleDebug = {
		frontContactWorldM: vec3(),
		rearContactWorldM: vec3(),
		frontStrutTopWorldM: vec3(),
		rearStrutTopWorldM: vec3()
	};

	private readonly rig: ChassisRig;
	private readonly front: WheelGeometry;
	private readonly rear: WheelGeometry;
	private readonly massKg: number;
	private readonly aero: AeroConfig;
	private readonly geometry: GeometryConfig;
	private readonly brakeConfig: BrakeConfig;
	private readonly engine: Engine;
	private readonly drivetrain: Drivetrain;

	private environment: MotorcycleEnvironment = {
		gradeFraction: 0,
		surface: DRY_ASPHALT
	};
	/**
	 * Ray length, from a strut top straight down, at which suspension compression
	 * is exactly zero (wheel just touching the ground). With the strut top at CG
	 * height this equals the CG height for both wheels.
	 */
	private readonly zeroCompressionReachM: number;

	private frontCompressionM = 0;
	private rearCompressionM = 0;

	/** Spawn CG height so the bike settles into ride height under its own weight. */
	static spawnHeightM(config: MotorcycleConfig): number {
		return config.physical.geometry.cgHeightM + 0.05;
	}

	constructor(rig: ChassisRig, config: MotorcycleConfig) {
		this.rig = rig;
		this.config = config;
		this.state = createMotorcycleState();

		const geo = config.physical.geometry;
		this.geometry = geo;
		this.massKg = config.physical.mass.totalKg;
		this.aero = config.physical.aero;
		this.brakeConfig = config.chassis.brakes;
		this.engine = new Engine(
			config.powertrain.engine,
			config.powertrain.torqueCurve,
			config.physical.inertia.engineKgM2
		);
		this.drivetrain = new Drivetrain(config.powertrain, geo);

		this.zeroCompressionReachM = geo.cgHeightM;
		this.front = {
			strutTopLocalM: vec3(0, 0, frontAxleFromCgM(geo)),
			suspension: config.chassis.suspension.front
		};
		this.rear = {
			strutTopLocalM: vec3(0, 0, -geo.cgFromRearAxleM),
			suspension: config.chassis.suspension.rear
		};
	}

	/** Sample normalised controls for this step (MOTORCYCLE-PHYSICS.md §80 step 1). */
	setControls(controls: MotorcycleControls): void {
		this.state.throttle = clamp(controls.throttle, 0, 1);
		this.state.clutch = clamp(controls.clutch, 0, 1);
		this.state.frontBrake = clamp(controls.frontBrake, 0, 1);
		this.state.rearBrake = clamp(controls.rearBrake, 0, 1);
		this.state.steeringInput = clamp(controls.steeringInput, -1, 1);
	}

	setEnvironment(environment: Partial<MotorcycleEnvironment>): void {
		this.environment = { ...this.environment, ...environment };
	}

	shiftUp(): void {
		this.drivetrain.gearbox.shiftUp();
	}

	shiftDown(): void {
		this.drivetrain.gearbox.shiftDown();
	}

	selectGear(gear: number): void {
		this.drivetrain.gearbox.selectGear(gear);
	}

	/** Crank a stalled engine back to life (BLUEPRINT §27 "R"). */
	restartEngine(): void {
		this.engine.restart();
		this.state.engineStalled = false;
		this.state.engineRPM = this.engine.rpm;
		this.state.engineOmegaRadS = this.engine.omegaRadS;
	}

	/** One fixed simulation step. Rapier is stepped by the caller afterwards. */
	update(dtS: number): void {
		this.rig.clearAccumulators();
		this.syncPose();

		const forwardHoriz = this.forwardHorizontal();
		const speedAlong = dot(this.state.linearVelocityWorldMps, forwardHoriz);
		this.state.forwardSpeedMps = speedAlong;

		// Powertrain: engine ← clutch/gearbox load ← rear wheel (locked to ground
		// speed until M10). The drivetrain also returns the rear-contact drive
		// force (positive) or engine-braking force (negative).
		this.drivetrain.update(dtS);
		const drive = this.drivetrain.solve(this.engine.omegaRadS, speedAlong, this.state.clutch);
		const throttleForEngine = this.drivetrain.gearbox.torqueCutActive ? 0 : this.state.throttle;
		this.engine.update(dtS, throttleForEngine, drive.engineLoadTorqueNm);

		this.state.engineOmegaRadS = this.engine.omegaRadS;
		this.state.engineRPM = this.engine.rpm;
		this.state.engineTorqueNm =
			this.engine.lastCombustionTorqueNm - this.engine.lastFrictionTorqueNm;
		this.state.gear = this.drivetrain.gearbox.gear;
		this.state.engineStalled = this.engine.stalled;
		this.state.rearWheelOmegaRadS = drive.rearWheelOmegaRadS;
		this.state.frontWheelOmegaRadS = speedAlong / this.geometry.frontWheelRadiusM;
		this.state.driveForceN = drive.driveForceN;

		this.frontCompressionM = this.updateWheel('front', this.front, dtS);
		this.rearCompressionM = this.updateWheel('rear', this.rear, dtS);

		this.applyLongitudinalForces(forwardHoriz, speedAlong, drive.driveForceN);
		this.applyTemporaryStabiliser();
	}

	private forwardHorizontal(): Vec3 {
		const forwardWorld = this.rig.localDirToWorld(FORWARD_LOCAL);
		return normalize({ x: forwardWorld.x, y: 0, z: forwardWorld.z });
	}

	/**
	 * Net longitudinal force along the (horizontal) heading, applied at the CG:
	 *
	 *   F_net = F_drive − F_brake − F_drag − F_rolling − F_grade
	 *          (MOTORCYCLE-PHYSICS.md §13)
	 *
	 * `driveForceN` comes from the drivetrain (positive under power, negative on
	 * the overrun = engine braking). Speed emerges from Rapier integrating this
	 * force — nothing assigns velocity. Contact-patch application (squat / dive)
	 * and grip limiting are deferred to M11 / M10.
	 */
	private applyLongitudinalForces(
		forwardHoriz: Vec3,
		speedAlong: number,
		driveForceN: number
	): void {
		const grade = gradientForces(this.massKg, this.environment.gradeFraction);
		this.state.roadGradientRad = grade.angleRad;

		const moving = Math.abs(speedAlong) > SPEED_DEADBAND_MPS;
		const travelSign = speedAlong >= 0 ? 1 : -1;
		const normalLoadN = this.state.frontNormalLoadN + this.state.rearNormalLoadN;

		const dragN = moving ? dragForceN(Math.abs(speedAlong), this.aero) : 0;
		const rollingN = moving
			? rollingResistanceForceN(normalLoadN, this.environment.surface.rollingResistance)
			: 0;
		const braking = brakeForcesN(
			this.state.frontBrake,
			this.state.rearBrake,
			this.brakeConfig,
			this.geometry
		);
		const brakeN = moving ? braking.totalN : 0;

		const netForwardN = driveForceN - travelSign * (dragN + rollingN + brakeN) - grade.alongSlopeN;

		this.rig.addForceAtPointWorld(scale(forwardHoriz, netForwardN), this.state.positionWorldM);
	}

	private updateWheel(which: 'front' | 'rear', wheel: WheelGeometry, dtS: number): number {
		// Cast the suspension ray straight down in *world* space and push along the
		// contact normal. On flat ground this is world-up; on banked roads it will
		// follow the surface (MOTORCYCLE-PHYSICS.md §52). Casting along the tilted
		// body axis instead leaks a horizontal component of the normal load
		// whenever the chassis is pitched.
		const strutTopWorld = this.rig.localPointToWorld(wheel.strutTopLocalM);
		const hit = this.rig.raycastWorld(
			strutTopWorld,
			DOWN_WORLD,
			this.zeroCompressionReachM + RAY_SLACK_M
		);
		if (which === 'front') this.debug.frontStrutTopWorldM = strutTopWorld;
		else this.debug.rearStrutTopWorldM = strutTopWorld;

		const prevCompression = which === 'front' ? this.frontCompressionM : this.rearCompressionM;
		let compressionM = 0;
		let grounded = false;
		let contactWorld = strutTopWorld;
		let normalWorld = UP_WORLD;

		if (hit) {
			compressionM = clampCompressionM(
				this.zeroCompressionReachM - hit.distanceM,
				wheel.suspension
			);
			grounded = compressionM > 0;
			contactWorld = hit.pointWorldM;
			normalWorld = hit.normalWorld;
		}

		const compressionVelMps = (compressionM - prevCompression) / dtS;
		const forceN = grounded
			? suspensionForceN({ compressionM, compressionVelMps }, wheel.suspension)
			: 0;

		if (forceN > 0) {
			this.rig.addForceAtPointWorld(scale(normalWorld, forceN), contactWorld);
		}

		if (which === 'front') {
			this.state.frontSuspensionCompressionM = compressionM;
			this.state.frontContactGround = grounded;
			this.state.frontNormalLoadN = forceN;
			this.debug.frontContactWorldM = contactWorld;
		} else {
			this.state.rearSuspensionCompressionM = compressionM;
			this.state.rearContactGround = grounded;
			this.state.rearNormalLoadN = forceN;
			this.debug.rearContactWorldM = contactWorld;
		}
		return compressionM;
	}

	private applyTemporaryStabiliser(): void {
		const forwardWorld = this.rig.localDirToWorld(FORWARD_LOCAL);
		const angularVelocityWorld = this.state.angularVelocityWorldRadS;
		const rollRateAboutForward = dot(angularVelocityWorld, forwardWorld);

		const rollTorque =
			-TEMP_ROLL_STIFFNESS_NM_PER_RAD * this.state.rollRad -
			TEMP_ROLL_DAMPING_NM_S_PER_RAD * rollRateAboutForward;

		this.rig.addTorqueWorld(scale(forwardWorld, rollTorque));
		this.rig.addTorqueWorld(scale(angularVelocityWorld, -TEMP_ANGULAR_DAMPING_NM_S));
	}

	private syncPose(): void {
		const pose = this.rig.getPose();
		this.state.positionWorldM = pose.positionWorldM;
		this.state.linearVelocityWorldMps = pose.linearVelocityWorldMps;
		this.state.angularVelocityWorldRadS = pose.angularVelocityWorldRadS;
		this.state.orientationWorld = pose.orientationWorld;
		const ypr = toYawPitchRoll(pose.orientationWorld);
		this.state.yawRad = ypr.yaw;
		this.state.pitchRad = ypr.pitch;
		this.state.rollRad = ypr.roll;
	}
}
