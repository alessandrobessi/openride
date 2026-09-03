import * as THREE from 'three';
import type { Transform } from '$lib/simulation/physics/RapierWorld';

/**
 * Render-time interpolation between the previous and current fixed-step
 * simulation transforms (MOTORCYCLE-PHYSICS.md §64). Position is linearly
 * interpolated; orientation uses quaternion slerp. `alpha` comes from
 * {@link SimulationLoop.advance}.
 *
 * Rendering reads simulation state — it never writes back (AGENTS.md §5).
 */
export function applyInterpolatedTransform(
	object: THREE.Object3D,
	previous: Transform,
	current: Transform,
	alpha: number
): void {
	object.position.set(
		THREE.MathUtils.lerp(previous.position.x, current.position.x, alpha),
		THREE.MathUtils.lerp(previous.position.y, current.position.y, alpha),
		THREE.MathUtils.lerp(previous.position.z, current.position.z, alpha)
	);

	_prevQuat.set(previous.rotation.x, previous.rotation.y, previous.rotation.z, previous.rotation.w);
	_currQuat.set(current.rotation.x, current.rotation.y, current.rotation.z, current.rotation.w);
	object.quaternion.copy(_prevQuat).slerp(_currQuat, alpha);
}

// Module-scoped scratch quaternions — no per-frame allocation (AGENTS.md §23).
const _prevQuat = new THREE.Quaternion();
const _currQuat = new THREE.Quaternion();
