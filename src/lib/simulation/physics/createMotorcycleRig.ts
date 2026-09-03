import type { MotorcycleConfig } from '../motorcycle/config';
import { Motorcycle } from '../motorcycle/Motorcycle';
import type { RiderProfile } from '../rider/RiderProfile';
import { DEFAULT_RIDER } from '../rider/profiles/default-rider';
import { RapierChassisRig } from './RapierChassisRig';
import { RapierWorld } from './RapierWorld';

/**
 * Wire a {@link Motorcycle} onto a Rapier chassis body inside a
 * {@link RapierWorld}. Used by the renderer and by headless scenario tests so
 * both drive an identical rig.
 */
export interface MotorcycleRig {
	world: RapierWorld;
	motorcycle: Motorcycle;
	chassisHandle: number;
}

export interface CreateMotorcycleRigOptions {
	/** Reuse an existing world (e.g. one that already has terrain). Otherwise a fresh one is made. */
	world?: RapierWorld;
	/** Add a flat static ground at y = 0. Default true. */
	withGround?: boolean;
	/** Virtual rider profile. Default: the simulation rider. */
	rider?: RiderProfile;
}

// Rough bike-sized cuboid for future terrain/crash collision. Sensor-only in M3.
const CHASSIS_HALF_EXTENTS_M = { x: 0.35, y: 0.5, z: 1.05 };

export async function createMotorcycleRig(
	config: MotorcycleConfig,
	options: CreateMotorcycleRigOptions = {}
): Promise<MotorcycleRig> {
	const world = options.world ?? (await RapierWorld.create());
	if (options.withGround ?? true) world.addStaticGround();

	const inertia = config.physical.inertia;
	const chassisHandle = world.addChassis({
		massKg: config.physical.mass.totalKg,
		// Body frame: x = pitch axis, y = yaw axis, z = roll axis (MOTORCYCLE-PHYSICS.md §5.2).
		principalInertiaKgM2: {
			x: inertia.pitchKgM2,
			y: inertia.yawKgM2,
			z: inertia.rollKgM2
		},
		positionM: { x: 0, y: Motorcycle.spawnHeightM(config), z: 0 },
		halfExtentsM: CHASSIS_HALF_EXTENTS_M
	});

	const rig = new RapierChassisRig(world, chassisHandle);
	const motorcycle = new Motorcycle(rig, config, options.rider ?? DEFAULT_RIDER);
	return { world, motorcycle, chassisHandle };
}
