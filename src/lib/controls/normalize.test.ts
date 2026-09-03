import { describe, expect, it } from 'vitest';
import {
	clamp01,
	clampSigned,
	deadzone01,
	deadzoneSigned,
	expo,
	radialDeadzone
} from './normalize';

describe('control input conditioning', () => {
	it('clamps and rejects non-finite values', () => {
		expect(clamp01(1.4)).toBe(1);
		expect(clamp01(-0.2)).toBe(0);
		expect(clamp01(Number.NaN)).toBe(0);
		expect(clampSigned(-3)).toBe(-1);
		expect(clampSigned(Number.POSITIVE_INFINITY)).toBe(0);
	});

	it('deadzone01 zeroes the bottom and rescales the rest', () => {
		expect(deadzone01(0.03, 0.05)).toBe(0);
		expect(deadzone01(0.05, 0.05)).toBe(0);
		expect(deadzone01(1, 0.05)).toBeCloseTo(1, 6);
		expect(deadzone01(0.525, 0.05)).toBeCloseTo(0.5, 6);
	});

	it('deadzoneSigned is symmetric and keeps full range', () => {
		expect(deadzoneSigned(0.1, 0.15)).toBe(0);
		expect(deadzoneSigned(-0.1, 0.15)).toBe(0);
		expect(deadzoneSigned(1, 0.15)).toBeCloseTo(1, 6);
		expect(deadzoneSigned(-1, 0.15)).toBeCloseTo(-1, 6);
	});

	it('radialDeadzone kills small vectors and preserves direction', () => {
		expect(radialDeadzone(0.05, 0.05, 0.15)).toEqual([0, 0]);
		const [x, y] = radialDeadzone(0.6, 0.8, 0.2); // magnitude 1.0
		expect(Math.hypot(x, y)).toBeCloseTo(1, 6);
		expect(x / y).toBeCloseTo(0.75, 6); // 0.6 / 0.8
	});

	it('expo softens the centre without changing sign or endpoints', () => {
		expect(expo(0.5, 1)).toBeCloseTo(0.5, 6);
		expect(expo(0.5, 2)).toBeCloseTo(0.25, 6);
		expect(expo(-0.5, 2)).toBeCloseTo(-0.25, 6);
		expect(expo(1, 3)).toBeCloseTo(1, 6);
		expect(expo(0, 2)).toBe(0);
	});
});
