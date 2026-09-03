import { describe, expect, it } from 'vitest';
import { slipAngleRad, slipRatio } from './slip';

describe('slipRatio', () => {
	it('is ~0 for a freely rolling wheel', () => {
		const r = 0.3;
		const v = 20;
		expect(slipRatio(v / r, r, v)).toBeCloseTo(0, 6);
	});

	it('is positive for wheelspin (ω·r > v)', () => {
		expect(slipRatio(80, 0.3, 20)).toBeGreaterThan(0); // 24 m/s surface vs 20 ground
	});

	it('approaches −1 for a locked wheel while moving', () => {
		expect(slipRatio(0, 0.3, 20)).toBeCloseTo(-1, 3);
	});

	it('stays finite at a standstill (floored denominator)', () => {
		expect(Number.isFinite(slipRatio(0, 0.3, 0))).toBe(true);
	});
});

describe('slipAngleRad', () => {
	it('is ~0 when travelling straight with no steer', () => {
		expect(slipAngleRad(0, 20, 0)).toBeCloseTo(0, 6);
	});

	it('grows with lateral (sideslip) velocity', () => {
		expect(slipAngleRad(2, 20, 0)).toBeGreaterThan(slipAngleRad(0.5, 20, 0));
	});

	it('subtracts the steer angle', () => {
		expect(slipAngleRad(0, 20, 0.1)).toBeCloseTo(-0.1, 6);
	});
});
