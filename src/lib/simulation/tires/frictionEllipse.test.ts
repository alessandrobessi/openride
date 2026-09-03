import { describe, expect, it } from 'vitest';
import { clampToFrictionEllipse } from './frictionEllipse';

const Fz = 2000;
const mu = 1.0;

describe('clampToFrictionEllipse', () => {
	it('passes demand through unchanged when inside the ellipse', () => {
		const r = clampToFrictionEllipse(500, 500, mu, mu, Fz);
		expect(r.saturated).toBe(false);
		expect(r.fxN).toBe(500);
		expect(r.fyN).toBe(500);
		expect(r.utilization).toBeCloseTo(Math.hypot(0.25, 0.25), 6);
	});

	it('scales both components onto the boundary when the demand exceeds grip', () => {
		const r = clampToFrictionEllipse(3000, 4000, mu, mu, Fz); // way outside
		expect(r.saturated).toBe(true);
		expect(Math.hypot(r.fxN / (mu * Fz), r.fyN / (mu * Fz))).toBeCloseTo(1, 6);
		// direction preserved
		expect(r.fyN / r.fxN).toBeCloseTo(4000 / 3000, 6);
	});

	it('shares one budget: more longitudinal demand leaves less lateral', () => {
		const lightBraking = clampToFrictionEllipse(200, 5000, mu, mu, Fz);
		const hardBraking = clampToFrictionEllipse(1900, 5000, mu, mu, Fz);
		expect(Math.abs(hardBraking.fyN)).toBeLessThan(Math.abs(lightBraking.fyN));
	});

	it('reports utilisation ≥ 1 when saturated (§84)', () => {
		expect(clampToFrictionEllipse(4000, 0, mu, mu, Fz).utilization).toBeGreaterThan(1);
	});
});
