import { describe, expect, it } from 'vitest';
import { skyStateForHour } from './skyState';

describe('skyStateForHour', () => {
	it('puts the sun highest and brightest at noon', () => {
		const noon = skyStateForHour(12);
		const morning = skyStateForHour(9);
		const evening = skyStateForHour(16);
		expect(noon.sunElevationRad).toBeGreaterThan(morning.sunElevationRad);
		expect(noon.sunElevationRad).toBeGreaterThan(evening.sunElevationRad);
		expect(noon.dayFactor).toBeCloseTo(1, 2);
		expect(noon.lightIntensity).toBeGreaterThan(morning.lightIntensity);
	});

	it('drops the sun below the horizon and dims the light at night', () => {
		const midnight = skyStateForHour(0);
		expect(midnight.sunElevationRad).toBeLessThan(0);
		expect(midnight.dayFactor).toBe(0);
		expect(midnight.lightIntensity).toBeLessThan(0.2);
		expect(midnight.lightIntensity).toBeGreaterThan(0); // moonlight floor
	});

	it('has the sun near the horizon at sunrise and sunset', () => {
		for (const h of [6, 18]) {
			const s = skyStateForHour(h);
			expect(Math.abs(s.sunElevationRad)).toBeLessThan(0.02);
		}
	});

	it('sweeps the azimuth east → south → west across the day', () => {
		const deg = (r: number) => (r * 180) / Math.PI;
		expect(deg(skyStateForHour(6).sunAzimuthRad)).toBeCloseTo(90, 0);
		expect(deg(skyStateForHour(12).sunAzimuthRad)).toBeCloseTo(180, 0);
		expect(deg(skyStateForHour(18).sunAzimuthRad)).toBeCloseTo(270, 0);
	});

	it('makes denser, darker haze at night than at midday', () => {
		expect(skyStateForHour(1).fogDensity).toBeGreaterThan(skyStateForHour(12).fogDensity);
	});

	it('is finite and wraps for any hour', () => {
		for (const h of [-5, 0, 3.5, 12, 23.99, 30, 48]) {
			const s = skyStateForHour(h);
			for (const v of Object.values(s)) expect(Number.isFinite(v)).toBe(true);
			expect(s.dayFactor).toBeGreaterThanOrEqual(0);
			expect(s.dayFactor).toBeLessThanOrEqual(1);
		}
	});
});
