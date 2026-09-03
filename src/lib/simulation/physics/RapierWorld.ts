import RAPIER from '@dimforge/rapier3d-compat';
import { add, cross, rotateByQuat, sub, type Vec3 } from '../core/math';
import { GRAVITY_MPS2 } from '../core/constants';

export { GRAVITY_MPS2 };

/**
 * The single point of contact with the Rapier rigid-body engine (AGENTS.md §17,
 * plan "Headless-first simulation core").
 *
 * Rapier owns rigid-body integration (gravity, chassis pose) and collision.
 * OpenRide's pure `simulation/*` modules compute suspension / tyre / aero /
 * rider forces and feed them here via {@link addForceAtPointWorld} /
 * {@link addTorqueWorld} before each fixed step.
 *
 * Loads the WASM engine once via `RAPIER.init()`; works in the browser and in
 * headless Node tests (the `-compat` build inlines the module).
 */

export interface Transform {
	position: { x: number; y: number; z: number };
	rotation: { x: number; y: number; z: number; w: number };
}

export interface BoxBodyOptions {
	halfExtentsM: Vec3;
	positionM: Vec3;
	density?: number;
}

export interface ChassisBodyOptions {
	massKg: number;
	/** Principal moments of inertia in the body frame: x = pitch, y = yaw, z = roll. */
	principalInertiaKgM2: Vec3;
	positionM: Vec3;
	/** Cuboid collider half-extents (crash geometry only in M3; a sensor). */
	halfExtentsM: Vec3;
	/** Initial heading about +y, radians (atan2(dx, dz)). Default 0 (facing +z). */
	headingRad?: number;
}

export interface RaycastHit {
	distanceM: number;
	pointWorldM: Vec3;
	normalWorld: Vec3;
}

let initPromise: Promise<void> | undefined;

/** Idempotent Rapier WASM initialisation. */
export async function initPhysics(): Promise<void> {
	if (!initPromise) initPromise = RAPIER.init();
	await initPromise;
}

export class RapierWorld {
	private readonly world: RAPIER.World;

	private constructor() {
		this.world = new RAPIER.World({ x: 0, y: -GRAVITY_MPS2, z: 0 });
	}

	/** Create a world. Call {@link initPhysics} first (or let this do it). */
	static async create(): Promise<RapierWorld> {
		await initPhysics();
		return new RapierWorld();
	}

	/**
	 * A static horizontal ground whose top surface sits at `y = topY` (default 0).
	 * Implemented as a thick cuboid collider with no rigid body (static).
	 */
	addStaticGround(halfSizeM = 1000, thicknessM = 1, topY = 0): void {
		const half = thicknessM / 2;
		const desc = RAPIER.ColliderDesc.cuboid(halfSizeM, half, halfSizeM).setTranslation(
			0,
			topY - half,
			0
		);
		this.world.createCollider(desc);
	}

	/** Add a dynamic box. Returns its rigid-body handle. */
	addDynamicBox(options: BoxBodyOptions): number {
		const { halfExtentsM: h, positionM: p, density = 1000 } = options;
		const body = this.world.createRigidBody(
			RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z)
		);
		this.world.createCollider(RAPIER.ColliderDesc.cuboid(h.x, h.y, h.z).setDensity(density), body);
		return body.handle;
	}

	/**
	 * Add the motorcycle chassis: one dynamic body carrying the combined
	 * bike + rider mass and reduced-order inertia (ADVENTURE-1200.md §5). The
	 * cuboid collider is a sensor in M3 — the wheels are raycasts and the
	 * suspension holds the bike up, so the chassis body must not itself rest on
	 * the ground. Real terrain/crash collision comes later.
	 */
	addChassis(options: ChassisBodyOptions): number {
		const { massKg, principalInertiaKgM2: I, positionM: p, halfExtentsM: h } = options;
		const halfHeading = (options.headingRad ?? 0) / 2;
		const body = this.world.createRigidBody(
			RAPIER.RigidBodyDesc.dynamic()
				.setTranslation(p.x, p.y, p.z)
				.setRotation({ x: 0, y: Math.sin(halfHeading), z: 0, w: Math.cos(halfHeading) })
				.setAdditionalMassProperties(
					massKg,
					{ x: 0, y: 0, z: 0 },
					{ x: I.x, y: I.y, z: I.z },
					{ x: 0, y: 0, z: 0, w: 1 }
				)
		);
		this.world.createCollider(
			RAPIER.ColliderDesc.cuboid(h.x, h.y, h.z).setDensity(0).setSensor(true),
			body
		);
		return body.handle;
	}

	/** World-space transform of a rigid body. */
	getTransform(handle: number): Transform {
		const body = this.world.getRigidBody(handle);
		const t = body.translation();
		const r = body.rotation();
		return {
			position: { x: t.x, y: t.y, z: t.z },
			rotation: { x: r.x, y: r.y, z: r.z, w: r.w }
		};
	}

	linearVelocity(handle: number): Vec3 {
		const v = this.world.getRigidBody(handle).linvel();
		return { x: v.x, y: v.y, z: v.z };
	}

	/** Set a body's linear velocity directly (test setup / respawn only). */
	setLinearVelocity(handle: number, velocityMps: Vec3): void {
		this.world.getRigidBody(handle).setLinvel(velocityMps, true);
	}

	/** Set a body's angular velocity directly (test setup / disturbance injection only). */
	setAngularVelocity(handle: number, angularVelocityRadS: Vec3): void {
		this.world.getRigidBody(handle).setAngvel(angularVelocityRadS, true);
	}

	angularVelocity(handle: number): Vec3 {
		const w = this.world.getRigidBody(handle).angvel();
		return { x: w.x, y: w.y, z: w.z };
	}

	/** Velocity of the material point currently at `pointWorldM` (rigid-body kinematics). */
	pointVelocity(handle: number, pointWorldM: Vec3): Vec3 {
		const body = this.world.getRigidBody(handle);
		const com = body.translation(); // centre of mass offset is zero (see addChassis)
		const linvel = body.linvel();
		const angvel = body.angvel();
		return add(
			{ x: linvel.x, y: linvel.y, z: linvel.z },
			cross(
				{ x: angvel.x, y: angvel.y, z: angvel.z },
				sub(pointWorldM, { x: com.x, y: com.y, z: com.z })
			)
		);
	}

	localPointToWorld(handle: number, localM: Vec3): Vec3 {
		const body = this.world.getRigidBody(handle);
		const t = body.translation();
		const rotated = rotateByQuat(localM, body.rotation());
		return { x: t.x + rotated.x, y: t.y + rotated.y, z: t.z + rotated.z };
	}

	localDirToWorld(handle: number, localDir: Vec3): Vec3 {
		return rotateByQuat(localDir, this.world.getRigidBody(handle).rotation());
	}

	addForceAtPointWorld(handle: number, forceN: Vec3, pointWorldM: Vec3): void {
		this.world.getRigidBody(handle).addForceAtPoint(forceN, pointWorldM, true);
	}

	addTorqueWorld(handle: number, torqueNm: Vec3): void {
		this.world.getRigidBody(handle).addTorque(torqueNm, true);
	}

	/** Zero any user force/torque accumulated on a body since the last step. */
	resetAccumulators(handle: number): void {
		const body = this.world.getRigidBody(handle);
		body.resetForces(false);
		body.resetTorques(false);
	}

	/**
	 * Cast a ray in world space. Returns the nearest hit within `maxDistanceM`,
	 * or null. `excludeHandle` skips one rigid body (the chassis casting the ray).
	 */
	raycast(
		originWorldM: Vec3,
		dirWorld: Vec3,
		maxDistanceM: number,
		excludeHandle?: number
	): RaycastHit | null {
		const exclude =
			excludeHandle === undefined ? undefined : this.world.getRigidBody(excludeHandle);
		const ray = new RAPIER.Ray(originWorldM, dirWorld);
		const hit = this.world.castRayAndGetNormal(
			ray,
			maxDistanceM,
			true,
			undefined,
			undefined,
			undefined,
			exclude
		);
		if (!hit) return null;
		const toi = hit.timeOfImpact;
		return {
			distanceM: toi,
			pointWorldM: {
				x: originWorldM.x + dirWorld.x * toi,
				y: originWorldM.y + dirWorld.y * toi,
				z: originWorldM.z + dirWorld.z * toi
			},
			normalWorld: { x: hit.normal.x, y: hit.normal.y, z: hit.normal.z }
		};
	}

	/**
	 * Add a static triangle-mesh collider (e.g. the road surface). `positions` is
	 * flat xyz, `indices` triples into it.
	 */
	addTrimeshCollider(positions: Float32Array, indices: Uint32Array): void {
		this.world.createCollider(RAPIER.ColliderDesc.trimesh(positions, indices));
	}

	/** Advance the physics world by one fixed step of `dtS` seconds. */
	step(dtS: number): void {
		this.world.timestep = dtS;
		this.world.step();
	}

	dispose(): void {
		this.world.free();
	}
}
