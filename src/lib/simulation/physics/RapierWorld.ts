import RAPIER from '@dimforge/rapier3d-compat';

/**
 * The single point of contact with the Rapier rigid-body engine (AGENTS.md §17,
 * plan "Headless-first simulation core").
 *
 * Rapier owns chassis/terrain rigid-body integration and collision. Motorcycle
 * force models (engine, drivetrain, tyres, rider) live in the pure
 * `simulation/*` modules and feed this adapter as applied forces/torques in
 * later milestones. For M2 the world just holds a static ground and a single
 * dynamic test body.
 *
 * Loads the WASM engine once via `RAPIER.init()`; works in the browser and in
 * headless Node tests (the `-compat` build inlines the module).
 */
export const GRAVITY_MPS2 = 9.80665;

export interface Transform {
	position: { x: number; y: number; z: number };
	rotation: { x: number; y: number; z: number; w: number };
}

export interface BoxBodyOptions {
	halfExtentsM: { x: number; y: number; z: number };
	positionM: { x: number; y: number; z: number };
	density?: number;
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

	/** Advance the physics world by one fixed step of `dtS` seconds. */
	step(dtS: number): void {
		this.world.timestep = dtS;
		this.world.step();
	}

	dispose(): void {
		this.world.free();
	}
}
