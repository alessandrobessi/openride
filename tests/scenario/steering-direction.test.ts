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
async function steerAndObserve(
	steeringInput: number
): Promise<{ landmarkSide: number; leanSide: number }> {
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
	// The bike's own up-vector: +x world is the rider's left, so up.x > 0 = lean left.
	const bikeUpX = new THREE.Vector3(0, 1, 0).applyQuaternion(q1).x;
	rig.world.dispose();

	return {
		// > 0 : landmark now to the rider's right  (turned left);  < 0 : turned right
		landmarkSide: landmark.clone().sub(p1).normalize().dot(camRight),
		// > 0 : leaned left;  < 0 : leaned right
		leanSide: bikeUpX
	};
}

describe('steering direction — the rider turns and leans the way they steer', () => {
	it('the left keys turn left and lean left', async () => {
		const left = analogFromHeldKeys(new Set(['a']));
		expect(left.steeringInput).toBe(1);
		const r = await steerAndObserve(left.steeringInput * 0.6);
		expect(r.landmarkSide).toBeGreaterThan(0.05); // landmark swung right → turned left
		expect(r.leanSide).toBeGreaterThan(0.1); // leaned left (into the turn)
	});

	it('the right keys turn right and lean right', async () => {
		const right = analogFromHeldKeys(new Set(['d']));
		expect(right.steeringInput).toBe(-1);
		const r = await steerAndObserve(right.steeringInput * 0.6);
		expect(r.landmarkSide).toBeLessThan(-0.05); // turned right
		expect(r.leanSide).toBeLessThan(-0.1); // leaned right
	});

	it('the gamepad stick agrees: pushed right turns and leans right', async () => {
		const stickRight = mapGamepad({ axes: [0.9, 0, 0, 0], buttons: [] }, DEFAULT_GAMEPAD_CONFIG)
			.controls.steeringInput;
		expect(stickRight).toBeLessThan(0); // same sign as the right keys
		const r = await steerAndObserve(stickRight);
		expect(r.landmarkSide).toBeLessThan(-0.05);
		expect(r.leanSide).toBeLessThan(-0.1);
	});
});
