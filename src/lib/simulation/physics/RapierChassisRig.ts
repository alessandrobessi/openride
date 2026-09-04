import type { Vec3 } from '../core/math';
import type { ChassisPose, ChassisRig, RigContactHit } from '../motorcycle/ChassisRig';
import type { RapierWorld } from './RapierWorld';

/**
 * Rapier-backed {@link ChassisRig}. Adapts a chassis rigid body in a
 * {@link RapierWorld} to the interface the pure `Motorcycle` orchestrator
 * consumes, so the simulation code itself never imports Rapier.
 */
export class RapierChassisRig implements ChassisRig {
	constructor(
		private readonly world: RapierWorld,
		private readonly handle: number
	) {}

	get bodyHandle(): number {
		return this.handle;
	}

	getPose(): ChassisPose {
		const t = this.world.getTransform(this.handle);
		return {
			positionWorldM: { ...t.position },
			orientationWorld: { ...t.rotation },
			linearVelocityWorldMps: this.world.linearVelocity(this.handle),
			angularVelocityWorldRadS: this.world.angularVelocity(this.handle)
		};
	}

	localPointToWorld(localM: Vec3): Vec3 {
		return this.world.localPointToWorld(this.handle, localM);
	}

	localDirToWorld(localDir: Vec3): Vec3 {
		return this.world.localDirToWorld(this.handle, localDir);
	}

	pointVelocityWorld(pointWorldM: Vec3): Vec3 {
		return this.world.pointVelocity(this.handle, pointWorldM);
	}

	raycastWorld(originWorldM: Vec3, dirWorld: Vec3, maxDistanceM: number): RigContactHit | null {
		const hit = this.world.raycast(originWorldM, dirWorld, maxDistanceM, this.handle);
		if (!hit) return null;
		return {
			distanceM: hit.distanceM,
			pointWorldM: hit.pointWorldM,
			normalWorld: hit.normalWorld
		};
	}

	addForceAtPointWorld(forceN: Vec3, pointWorldM: Vec3): void {
		this.world.addForceAtPointWorld(this.handle, forceN, pointWorldM);
	}

	addTorqueWorld(torqueNm: Vec3): void {
		this.world.addTorqueWorld(this.handle, torqueNm);
	}

	respawn(positionWorldM: Vec3, headingRad: number): void {
		this.world.setBodyPose(this.handle, positionWorldM, headingRad);
	}

	clearAccumulators(): void {
		this.world.resetAccumulators(this.handle);
	}
}
