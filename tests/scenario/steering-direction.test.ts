import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createMotorcycleRig } from '$lib/simulation/physics/createMotorcycleRig';
import { SimulationLoop } from '$lib/simulation/core/SimulationLoop';
import { ADVENTURE_1200 } from '$lib/simulation/motorcycle/configs/adventure-1200';
import { ASSISTS_OFF } from '$lib/simulation/assists/AssistConfig';
import { analogFromHeldKeys } from '$lib/controls/keyboard/KeyboardControls';
import { DEFAULT_GAMEPAD_CONFIG, mapGamepad } from '$lib/controls/gamepad/GamepadControls';
import { createFirstPersonCamera } from '$lib/rendering/camera/createFirstPersonCamera';

const FRAME_S = 1 / 60;
const NEUTRAL = { throttle: 0, clutch: 1, frontBrake: 0, rearBrake: 0, steeringInput: 0 };

/**
 * The definitive steering-direction check: drive the real control-layer output
 * through the simulation *and the first-person camera*, then ask which side of
 * the rider a landmark that started dead ahead ends up on. Turn left → the world
 * (and that landmark) swings to your right, and vice versa. This can't be fooled
 * by world-frame sign conventions the way a bare `velocity.x` check can.
 */
async function landmarkSideAfterSteering(steeringInput: number): Promise<number> {
	const rig = await createMotorcycleRig(ADVENTURE_1200, {
		assists: ASSISTS_OFF,
		groundHalfSizeM: 40000
	});
	const loop = new SimulationLoop({ fixedDtS: 1 / 120 });
	const run = (seconds: number, input: number) => {
		for (let t = 0; t < seconds; t += FRAME_S) {
			loop.advance(FRAME_S, (dt) => {
				rig.motorcycle.setControls({ ...NEUTRAL, throttle: 0.25, steeringInput: input });
				rig.motorcycle.update(dt);
				rig.world.step(dt);
			});
		}
	};

	run(1, 0);
	rig.world.setLinearVelocity(rig.chassisHandle, { x: 0, y: 0, z: 20 });
	rig.motorcycle.resyncWheelsToGround();
	rig.motorcycle.selectGear(4);
	run(0.5, 0);

	const cam = createFirstPersonCamera();
	const t0 = rig.world.getTransform(rig.chassisHandle);
	const p0 = new THREE.Vector3(t0.position.x, t0.position.y, t0.position.z);
	const q0 = new THREE.Quaternion(t0.rotation.x, t0.rotation.y, t0.rotation.z, t0.rotation.w);
	cam.reset(p0, q0);
	const forward0 = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.camera.quaternion);
	const landmark = p0.clone().addScaledVector(forward0, 100);

	run(3, steeringInput);

	const t1 = rig.world.getTransform(rig.chassisHandle);
	const p1 = new THREE.Vector3(t1.position.x, t1.position.y, t1.position.z);
	const q1 = new THREE.Quaternion(t1.rotation.x, t1.rotation.y, t1.rotation.z, t1.rotation.w);
	cam.update(p1, q1, FRAME_S);
	const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.camera.quaternion);
	rig.world.dispose();

	// > 0 : the landmark is now to the rider's right  (rider turned left)
	// < 0 : the landmark is now to the rider's left   (rider turned right)
	return landmark.clone().sub(p1).normalize().dot(camRight);
}

describe('steering direction — the rider turns the way they steer', () => {
	it('the left keys steer left (a landmark dead ahead swings to the rider’s right)', async () => {
		const left = analogFromHeldKeys(new Set(['a']));
		expect(left.steeringInput).toBe(1);
		expect(await landmarkSideAfterSteering(left.steeringInput * 0.6)).toBeGreaterThan(0.05);
	});

	it('the right keys steer right (a landmark dead ahead swings to the rider’s left)', async () => {
		const right = analogFromHeldKeys(new Set(['d']));
		expect(right.steeringInput).toBe(-1);
		expect(await landmarkSideAfterSteering(right.steeringInput * 0.6)).toBeLessThan(-0.05);
	});

	it('the gamepad stick agrees: pushed right steers right', async () => {
		const stickRight = mapGamepad({ axes: [0.9, 0, 0, 0], buttons: [] }, DEFAULT_GAMEPAD_CONFIG)
			.controls.steeringInput;
		expect(stickRight).toBeLessThan(0); // same sign as the right keys
		expect(await landmarkSideAfterSteering(stickRight)).toBeLessThan(-0.05);
	});
});
