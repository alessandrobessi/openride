/**
 * Minimal SI-friendly vector/quaternion helpers for the headless simulation
 * core. Pure and dependency-free (no Three.js) so it runs in Node tests
 * (AGENTS.md §30, plan "Headless-first simulation core").
 *
 * Convention (MOTORCYCLE-PHYSICS.md §5, AGENTS.md §8): world X = east,
 * Y = up, Z = north; motorcycle body +x = right, +y = up, +z = forward.
 * All quantities are metres / radians / seconds.
 */
export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

/** Unit quaternion (x, y, z, w). */
export interface Quat {
	x: number;
	y: number;
	z: number;
	w: number;
}

export const ZERO_VEC3: Readonly<Vec3> = Object.freeze({ x: 0, y: 0, z: 0 });
export const IDENTITY_QUAT: Readonly<Quat> = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

export function vec3(x = 0, y = 0, z = 0): Vec3 {
	return { x, y, z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
	return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
	return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a: Vec3, s: number): Vec3 {
	return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function dot(a: Vec3, b: Vec3): number {
	return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
	return {
		x: a.y * b.z - a.z * b.y,
		y: a.z * b.x - a.x * b.z,
		z: a.x * b.y - a.y * b.x
	};
}

export function length(a: Vec3): number {
	return Math.hypot(a.x, a.y, a.z);
}

export function normalize(a: Vec3): Vec3 {
	const len = length(a);
	return len > 1e-9 ? scale(a, 1 / len) : { x: 0, y: 0, z: 0 };
}

/** Rotate `v` by unit quaternion `q` (q · v · q⁻¹), no allocation of temporaries beyond the result. */
export function rotateByQuat(v: Vec3, q: Quat): Vec3 {
	// t = 2 · (q_xyz × v); v' = v + q_w · t + q_xyz × t
	const tx = 2 * (q.y * v.z - q.z * v.y);
	const ty = 2 * (q.z * v.x - q.x * v.z);
	const tz = 2 * (q.x * v.y - q.y * v.x);
	return {
		x: v.x + q.w * tx + (q.y * tz - q.z * ty),
		y: v.y + q.w * ty + (q.z * tx - q.x * tz),
		z: v.z + q.w * tz + (q.x * ty - q.y * tx)
	};
}

/** Intrinsic yaw–pitch–roll (Y, X, Z) extracted from a unit quaternion, in radians. */
export function toYawPitchRoll(q: Quat): { yaw: number; pitch: number; roll: number } {
	// Body frame: +y up (yaw), +x right (pitch), +z forward (roll).
	const sinPitch = 2 * (q.w * q.x - q.y * q.z);
	const pitch = Math.abs(sinPitch) >= 1 ? (Math.sign(sinPitch) * Math.PI) / 2 : Math.asin(sinPitch);
	const yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.x * q.x + q.y * q.y));
	const roll = Math.atan2(2 * (q.w * q.z + q.x * q.y), 1 - 2 * (q.x * q.x + q.z * q.z));
	return { yaw, pitch, roll };
}

export function clamp(value: number, min: number, max: number): number {
	return value < min ? min : value > max ? max : value;
}
