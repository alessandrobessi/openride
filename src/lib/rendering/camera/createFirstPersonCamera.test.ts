import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createFirstPersonCamera } from './createFirstPersonCamera';

const quatFromYPR = (yaw: number, pitch: number, roll: number): THREE.Quaternion =>
	new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));

const dirOf = (q: THREE.Quaternion, local: THREE.Vector3) => local.clone().applyQuaternion(q);
const camForward = (cam: ReturnType<typeof createFirstPersonCamera>) =>
	dirOf(cam.camera.quaternion, new THREE.Vector3(0, 0, -1));
const camRight = (cam: ReturnType<typeof createFirstPersonCamera>) =>
	dirOf(cam.camera.quaternion, new THREE.Vector3(1, 0, 0));
/** Chassis "forward" is +z in the body frame. */
const bodyForward = (q: THREE.Quaternion) => dirOf(q, new THREE.Vector3(0, 0, 1));
const bodyRight = (q: THREE.Quaternion) => dirOf(q, new THREE.Vector3(1, 0, 0));

/** Run `update` for `seconds` at 60 Hz with a fixed chassis pose. */
function settle(
	cam: ReturnType<typeof createFirstPersonCamera>,
	pos: THREE.Vector3,
	quat: THREE.Quaternion,
	seconds: number
) {
	const dt = 1 / 60;
	for (let t = 0; t < seconds; t += dt) cam.update(pos, quat, dt);
}

describe('first-person head-stabilised camera', () => {
	it('reset places the eye at the rider head point above the CG', () => {
		const cam = createFirstPersonCamera();
		cam.reset(new THREE.Vector3(10, 5, -3), new THREE.Quaternion());
		expect(cam.camera.position.x).toBeCloseTo(10, 5);
		expect(cam.camera.position.y).toBeCloseTo(5.72, 5); // HEAD_OFFSET.y
		expect(cam.camera.position.z).toBeCloseTo(-3.08, 5); // HEAD_OFFSET.z = -0.08
	});

	it('looks where the bike points, whatever the heading', () => {
		const flatten = (v: THREE.Vector3) => new THREE.Vector3(v.x, 0, v.z).normalize();
		for (const yawDeg of [0, 40, 135, -110, 180]) {
			const cam = createFirstPersonCamera();
			const q = quatFromYPR(THREE.MathUtils.degToRad(yawDeg), 0, 0);
			cam.reset(new THREE.Vector3(), new THREE.Quaternion());
			settle(cam, new THREE.Vector3(), q, 2);
			// Camera heading (horizontal look direction) converges onto the bike's.
			expect(flatten(camForward(cam)).angleTo(flatten(bodyForward(q)))).toBeLessThan(0.02);
		}
	});

	it('carries only a fraction of the chassis roll, and never more than the bike', () => {
		const cam = createFirstPersonCamera();
		const q = quatFromYPR(0, 0, THREE.MathUtils.degToRad(40));
		cam.reset(new THREE.Vector3(), new THREE.Quaternion()); // start upright
		settle(cam, new THREE.Vector3(), q, 2);

		// The right vector dips into a lean; the camera dips less, the same way.
		const camDip = camRight(cam).y;
		const bikeDip = bodyRight(q).y;
		expect(Math.sign(camDip)).toBe(Math.sign(bikeDip));
		expect(Math.abs(camDip)).toBeLessThan(Math.abs(bikeDip));
		expect(camDip / bikeDip).toBeCloseTo(0.35, 1); // ~ROLL_FOLLOW
	});

	it('carries a partial, damped share of the pitch change (gradient cue, not full)', () => {
		const cam = createFirstPersonCamera();
		cam.reset(new THREE.Vector3(), new THREE.Quaternion());
		settle(cam, new THREE.Vector3(), new THREE.Quaternion(), 2);
		const level = camForward(cam).y; // baseline look tilt (includes the fixed bias)

		const q = quatFromYPR(0, THREE.MathUtils.degToRad(12), 0);
		settle(cam, new THREE.Vector3(), q, 2);
		const climbing = camForward(cam).y;

		const camDelta = climbing - level;
		const bikeDelta = bodyForward(q).y - bodyForward(new THREE.Quaternion()).y;
		expect(Math.sign(camDelta)).toBe(Math.sign(bikeDelta));
		expect(Math.abs(camDelta)).toBeLessThan(Math.abs(bikeDelta));
		expect(camDelta / bikeDelta).toBeCloseTo(0.55, 1); // ~PITCH_FOLLOW
	});

	it('does not snap on a single oversized (post-stall) frame', () => {
		const cam = createFirstPersonCamera();
		cam.reset(new THREE.Vector3(), new THREE.Quaternion());
		const start = camForward(cam).clone();
		cam.update(new THREE.Vector3(100, 0, 0), quatFromYPR(2.5, 0, 0), 5); // 5 s delta
		expect(cam.camera.position.x).toBeGreaterThan(0);
		expect(cam.camera.position.x).toBeLessThan(95); // clamped to MAX_DT
		const moved = camForward(cam).angleTo(start);
		expect(moved).toBeGreaterThan(0.05); // it did react
		expect(moved).toBeLessThan(1.2); // ...but eased in, nowhere near the 2.5 rad target
	});

	it('first update with no prior reset initialises instead of easing from zero', () => {
		const cam = createFirstPersonCamera();
		cam.update(new THREE.Vector3(0, 0, 20), new THREE.Quaternion(), 1 / 60);
		expect(cam.camera.position.z).toBeCloseTo(19.92, 5); // at the head point (offset -0.08) immediately
	});
});
