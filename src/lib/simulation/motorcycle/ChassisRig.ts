import type { Quat, Vec3 } from '../core/math';

/**
 * The rigid-body substrate the motorcycle simulation rides on, expressed as an
 * interface so the pure `Motorcycle` orchestrator never imports Rapier
 * (plan "Headless-first simulation core"). The concrete implementation is
 * `simulation/physics/RapierChassisRig.ts`; tests can supply a fake.
 *
 * The rig owns integration of the chassis rigid body (one body: bike + rider as
 * a combined mass in M3). OpenRide computes suspension/tyre/aero/rider forces
 * and feeds them back through `addForceAtPointWorld` / `addTorqueWorld` before
 * each `SimulationLoop` step advances the world.
 */
export interface RigContactHit {
	/** Distance from the ray origin to the contact, metres. */
	distanceM: number;
	pointWorldM: Vec3;
	normalWorld: Vec3;
}

export interface ChassisPose {
	positionWorldM: Vec3;
	orientationWorld: Quat;
	linearVelocityWorldMps: Vec3;
	angularVelocityWorldRadS: Vec3;
}

export interface ChassisRig {
	getPose(): ChassisPose;

	/** Transform a point from body-local metres to world metres. */
	localPointToWorld(localM: Vec3): Vec3;
	/** Rotate a body-local direction into world space (no translation). */
	localDirToWorld(localDir: Vec3): Vec3;
	/** World-space velocity of the material point currently at `pointWorldM`. */
	pointVelocityWorld(pointWorldM: Vec3): Vec3;

	/**
	 * Cast a ray in world space against everything except the chassis itself.
	 * Returns the nearest hit within `maxDistanceM`, or null.
	 */
	raycastWorld(originWorldM: Vec3, dirWorld: Vec3, maxDistanceM: number): RigContactHit | null;

	addForceAtPointWorld(forceN: Vec3, pointWorldM: Vec3): void;
	addTorqueWorld(torqueNm: Vec3): void;

	/**
	 * Hard-place the chassis upright at `positionWorldM` facing `headingRad`, with
	 * all motion and pending forces zeroed. Used to recover the bike after it has
	 * left the world — there is no barrier / crash geometry in v0.1.
	 */
	respawn(positionWorldM: Vec3, headingRad: number): void;

	/**
	 * Clamp each component of the chassis angular velocity to ±`maxRadS`. A safety
	 * net: a bad contact against the road/terrain trimesh edge can otherwise spin
	 * the body to non-physical rates (a motorcycle chassis simply can't).
	 */
	limitAngularSpeed(maxRadS: number): void;

	/**
	 * Zero the accumulated force/torque on the chassis. Called at the start of
	 * each step so every step recomputes its whole force budget from scratch
	 * (AGENTS.md §81 — one owner per force, no leftover accumulation).
	 */
	clearAccumulators(): void;
}
