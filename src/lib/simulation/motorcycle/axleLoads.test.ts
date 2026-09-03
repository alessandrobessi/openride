import { describe, expect, it } from 'vitest';
import { staticAxleLoadsN, transferredAxleLoadsN } from './axleLoads';
import { ADVENTURE_1200 } from './configs/adventure-1200';

const m = ADVENTURE_1200.physical.mass.totalKg;
const geo = ADVENTURE_1200.physical.geometry;

describe('axleLoads', () => {
	it('static loads split by a/L and sum to mg (§26)', () => {
		const s = staticAxleLoadsN(m, geo);
		expect(s.frontN + s.rearN).toBeCloseTo(m * 9.80665, 3);
		// a/L = 0.82 / 1.52 ≈ 0.539 → front-biased
		expect(s.frontN / (s.frontN + s.rearN)).toBeCloseTo(0.539, 2);
	});

	it('braking loads the front and unloads the rear (§27, §14)', () => {
		const s = staticAxleLoadsN(m, geo);
		const t = transferredAxleLoadsN(m, -8, geo); // −8 m/s² ≈ hard braking
		expect(t.frontN).toBeGreaterThan(s.frontN);
		expect(t.rearN).toBeLessThan(s.rearN);
		// §14: ΔF ≈ m·a·h/L = 330·8·0.67/1.52 ≈ 1163 N
		expect(t.frontN - s.frontN).toBeCloseTo(1163, -1);
	});

	it('acceleration loads the rear and unloads the front', () => {
		const s = staticAxleLoadsN(m, geo);
		const t = transferredAxleLoadsN(m, 5, geo);
		expect(t.rearN).toBeGreaterThan(s.rearN);
		expect(t.frontN).toBeLessThan(s.frontN);
	});

	it('never returns a negative load and keeps the sum ≈ mg while both wheels bear load', () => {
		const t = transferredAxleLoadsN(m, -6, geo);
		expect(t.frontN).toBeGreaterThanOrEqual(0);
		expect(t.rearN).toBeGreaterThanOrEqual(0);
		expect(t.frontN + t.rearN).toBeCloseTo(m * 9.80665, 3);
	});
});
