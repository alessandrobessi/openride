import { describe, expect, it } from 'vitest';
import { equilibriumLeanRad, leanFromLateralAccelRad, radiusFromYawRateM } from './leanModel';

describe('leanModel', () => {
	it('equilibrium lean grows with speed and shrinks with radius (φ = atan(v²/rg))', () => {
		expect(equilibriumLeanRad(20, 50)).toBeGreaterThan(equilibriumLeanRad(10, 50));
		expect(equilibriumLeanRad(15, 30)).toBeGreaterThan(equilibriumLeanRad(15, 80));
	});

	it('a 1 g corner leans 45°', () => {
		expect(leanFromLateralAccelRad(9.80665)).toBeCloseTo(Math.PI / 4, 6);
		// v²/r = g  → e.g. v = 20, r = 20²/g
		expect(equilibriumLeanRad(20, (20 * 20) / 9.80665)).toBeCloseTo(Math.PI / 4, 6);
	});

	it('radius from yaw rate: r = v / ψ̇', () => {
		expect(radiusFromYawRateM(20, 0.5)).toBeCloseTo(40, 6);
		expect(radiusFromYawRateM(20, 0)).toBe(Infinity);
	});
});
