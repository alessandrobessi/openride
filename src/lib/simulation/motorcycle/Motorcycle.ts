import { dot, scale, toYawPitchRoll, vec3, type Vec3 } from '../core/math';
import { clampCompressionM, suspensionForceN } from '../suspension/suspension';
import { frontAxleFromCgM, type AxleSuspensionConfig, type MotorcycleConfig } from './config';
import type { ChassisRig } from './ChassisRig';
import { createMotorcycleState, type MotorcycleState } from './MotorcycleState';

/**
 * The motorcycle simulation orchestrator (MOTORCYCLE-PHYSICS.md §80,
 * OPENRIDE-BLUEPRINT.md §5). Pure: it depends only on the {@link ChassisRig}
 * interface and the config, never on Rapier or Three.js, so it runs in headless
 * tests.
 *
 * **M3 scope**: the two-wheel rig only — chassis body, front/rear raycast
 * contacts, spring–damper suspension holding the bike at ride height, and a
 * clearly temporary balance stabiliser. Engine, drivetrain, tyre forces, real
 * rider control and weight transfer arrive in later milestones.
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

	/** One fixed simulation step. Rapier is stepped by the caller afterwards. */
	update(dtS: number): void {
		this.rig.clearAccumulators();
		this.syncPose();

		this.frontCompressionM = this.updateWheel('front', this.front, dtS);
		this.rearCompressionM = this.updateWheel('rear', this.rear, dtS);

		this.applyTemporaryStabiliser();
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
