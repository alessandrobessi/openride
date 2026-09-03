import type { MotorcycleConfig } from '../motorcycle/config';
import { Motorcycle } from '../motorcycle/Motorcycle';
import type { RiderProfile } from '../rider/RiderProfile';
import { DEFAULT_RIDER } from '../rider/profiles/default-rider';
import type { AssistConfig } from '../assists/AssistConfig';
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
	/** Half-size of the default ground plane, metres. Default 1000 — raise it for
	 *  high-speed / long-duration runs that would otherwise drive off the edge. */
	groundHalfSizeM?: number;
	/** Virtual rider profile. Default: the simulation rider. */
	rider?: RiderProfile;
	/** Assist configuration. Default: all safety assists on. */
	assists?: AssistConfig;
	/** Spawn pose. Default: local origin, facing +z. `y` defaults to ride-height. */
	spawn?: { x: number; y?: number; z: number; headingRad?: number };
}

// Rough bike-sized cuboid for future terrain/crash collision. Sensor-only in M3.
const CHASSIS_HALF_EXTENTS_M = { x: 0.35, y: 0.5, z: 1.05 };

export async function createMotorcycleRig(
	config: MotorcycleConfig,
	options: CreateMotorcycleRigOptions = {}
): Promise<MotorcycleRig> {
	const world = options.world ?? (await RapierWorld.create());
	if (options.withGround ?? true) world.addStaticGround(options.groundHalfSizeM ?? 1000);

	const inertia = config.physical.inertia;
	const chassisHandle = world.addChassis({
		massKg: config.physical.mass.totalKg,
		// Body frame: x = pitch axis, y = yaw axis, z = roll axis (MOTORCYCLE-PHYSICS.md §5.2).
		principalInertiaKgM2: {
			x: inertia.pitchKgM2,
			y: inertia.yawKgM2,
			z: inertia.rollKgM2
		},
		positionM: {
			x: options.spawn?.x ?? 0,
			y: options.spawn?.y ?? Motorcycle.spawnHeightM(config),
			z: options.spawn?.z ?? 0
		},
		headingRad: options.spawn?.headingRad ?? 0,
		halfExtentsM: CHASSIS_HALF_EXTENTS_M
	});

	const rig = new RapierChassisRig(world, chassisHandle);
	const motorcycle = new Motorcycle(rig, config, options.rider ?? DEFAULT_RIDER, options.assists);
	return { world, motorcycle, chassisHandle };
}
