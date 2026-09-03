import * as THREE from 'three';

/**
 * First-person ride camera with head stabilisation (milestone M20,
 * AGENTS.md §22, OPENRIDE-BLUEPRINT.md §25).
 *
 * The camera sits at the rider's eye point and follows the chassis position
 * rigidly (with a light lag so suspension chatter is felt, not jarring), but it
 * does **not** copy the chassis orientation: it takes the full heading, only a
 * fraction of the roll and pitch, and low-passes all three. You feel the lean
 * and the gradient without the horizon whipping around.
 */
export interface FirstPersonCamera {
	camera: THREE.PerspectiveCamera;
	setViewportSize: (widthPx: number, heightPx: number) => void;
	/** Feed the interpolated chassis pose and the real frame delta (seconds). */
	update: (chassisPosWorld: THREE.Vector3, chassisQuatWorld: THREE.Quaternion, dtS: number) => void;
	/** Snap straight to the stabilised pose (view switch, respawn). */
	reset: (chassisPosWorld: THREE.Vector3, chassisQuatWorld: THREE.Quaternion) => void;
	dispose: () => void;
}

/** Rider eye point in the chassis body frame (origin = CG), metres. */
const HEAD_OFFSET = new THREE.Vector3(0, 0.72, -0.08);
/** A small constant downward tilt — riders look at the road ahead, not the sky. */
const PITCH_BIAS = -0.07;

/** Fraction of the chassis roll / pitch the head carries. */
const ROLL_FOLLOW = 0.35;
const PITCH_FOLLOW = 0.55;
/** Low-pass time constants (seconds): orientation is smoother than position. */
const ANGLE_TAU = 0.1;
const POS_TAU = 0.04;
/** A stalled / backgrounded frame must ease in, not snap the view. */
const MAX_DT = 1 / 30;

/**
 * The chassis body frame has +z forward; a Three camera looks down its own -z.
 * This half-turn about +y aligns the camera so it faces the way the bike points.
 */
const BODY_TO_CAMERA = new THREE.Quaternion(0, 1, 0, 0);

function shortestAngleDelta(from: number, to: number): number {
	let d = (to - from) % (Math.PI * 2);
	if (d > Math.PI) d -= Math.PI * 2;
	if (d < -Math.PI) d += Math.PI * 2;
	return d;
}

export function createFirstPersonCamera(): FirstPersonCamera {
	const camera = new THREE.PerspectiveCamera(74, 1, 0.05, 3000);

	const euler = new THREE.Euler(0, 0, 0, 'YXZ');
	const rigidQuat = new THREE.Quaternion();
	const headWorld = new THREE.Vector3();
	const smoothPos = new THREE.Vector3();
	let smoothYaw = 0;
	let smoothPitch = 0;
	let smoothRoll = 0;
	let ready = false;

	/**
	 * Camera heading + attenuated pitch/roll for a chassis orientation. The
	 * half-turn that makes the camera face forward also mirrors the body roll in
	 * the YXZ decomposition, so the roll term is negated back.
	 */
	const targetsFrom = (q: THREE.Quaternion): { yaw: number; pitch: number; roll: number } => {
		rigidQuat.copy(q).multiply(BODY_TO_CAMERA);
		euler.setFromQuaternion(rigidQuat, 'YXZ');
		return {
			yaw: euler.y,
			pitch: euler.x * PITCH_FOLLOW + PITCH_BIAS,
			roll: -euler.z * ROLL_FOLLOW
		};
	};

	const applyToCamera = (): void => {
		camera.position.copy(smoothPos);
		camera.quaternion.setFromEuler(euler.set(smoothPitch, smoothYaw, smoothRoll, 'YXZ'));
	};

	const reset = (pos: THREE.Vector3, quat: THREE.Quaternion): void => {
		const t = targetsFrom(quat);
		smoothYaw = t.yaw;
		smoothPitch = t.pitch;
		smoothRoll = t.roll;
		smoothPos.copy(HEAD_OFFSET).applyQuaternion(quat).add(pos);
		applyToCamera();
		ready = true;
	};

	const update = (pos: THREE.Vector3, quat: THREE.Quaternion, dtS: number): void => {
		if (!ready) {
			reset(pos, quat);
			return;
		}
		const dt = Math.min(Math.max(dtS, 0), MAX_DT);
		const t = targetsFrom(quat);
		const aAngle = 1 - Math.exp(-dt / ANGLE_TAU);
		const aPos = 1 - Math.exp(-dt / POS_TAU);

		smoothYaw += shortestAngleDelta(smoothYaw, t.yaw) * aAngle;
		smoothPitch += (t.pitch - smoothPitch) * aAngle;
		smoothRoll += (t.roll - smoothRoll) * aAngle;

		headWorld.copy(HEAD_OFFSET).applyQuaternion(quat).add(pos);
		smoothPos.lerp(headWorld, aPos);

		applyToCamera();
	};

	const setViewportSize = (widthPx: number, heightPx: number): void => {
		camera.aspect = widthPx / Math.max(heightPx, 1);
		camera.updateProjectionMatrix();
	};

	return {
		camera,
		setViewportSize,
		update,
		reset,
		dispose: () => {}
	};
}
