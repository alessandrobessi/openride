import { describe, expect, it } from 'vitest';
import { cross, dot, length, normalize, rotateByQuat, toYawPitchRoll, vec3 } from './math';

const HALF_PI = Math.PI / 2;

/** Quaternion for a rotation of `angle` rad about a unit axis. */
function axisAngle(ax: number, ay: number, az: number, angle: number) {
	const s = Math.sin(angle / 2);
	return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(angle / 2) };
}

describe('math', () => {
	it('dot / cross / length / normalize', () => {
		expect(dot(vec3(1, 2, 3), vec3(4, -5, 6))).toBe(12);
		expect(cross(vec3(1, 0, 0), vec3(0, 1, 0))).toEqual(vec3(0, 0, 1));
		expect(length(vec3(3, 4, 0))).toBe(5);
		const n = normalize(vec3(0, 0, 9));
		expect(n).toEqual(vec3(0, 0, 1));
	});

	it('rotateByQuat: 90° about +y maps +z forward to +x right', () => {
		const r = rotateByQuat(vec3(0, 0, 1), axisAngle(0, 1, 0, HALF_PI));
		expect(r.x).toBeCloseTo(1, 6);
		expect(r.y).toBeCloseTo(0, 6);
		expect(r.z).toBeCloseTo(0, 6);
	});

	it('rotateByQuat: identity leaves a vector unchanged', () => {
		expect(rotateByQuat(vec3(1, 2, 3), { x: 0, y: 0, z: 0, w: 1 })).toEqual(vec3(1, 2, 3));
	});

	it('toYawPitchRoll: pure roll about +z (forward)', () => {
		const { yaw, pitch, roll } = toYawPitchRoll(axisAngle(0, 0, 1, 0.3));
		expect(yaw).toBeCloseTo(0, 6);
		expect(pitch).toBeCloseTo(0, 6);
		expect(roll).toBeCloseTo(0.3, 6);
	});

	it('toYawPitchRoll: pure yaw about +y (up)', () => {
		const { yaw, pitch, roll } = toYawPitchRoll(axisAngle(0, 1, 0, -0.8));
		expect(yaw).toBeCloseTo(-0.8, 6);
		expect(pitch).toBeCloseTo(0, 6);
		expect(roll).toBeCloseTo(0, 6);
	});
});
