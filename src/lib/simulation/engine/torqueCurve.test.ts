import { describe, expect, it } from 'vitest';
import { interpolateTorqueNm, omegaFromRpm, rpmFromOmega } from './torqueCurve';
import { ADVENTURE_1200 } from '../motorcycle/configs/adventure-1200';

const curve = ADVENTURE_1200.powertrain.torqueCurve;

describe('interpolateTorqueNm', () => {
	it('returns sampled values exactly at sample RPMs', () => {
		expect(interpolateTorqueNm(curve, 6000)).toBe(125); // peak torque
		expect(interpolateTorqueNm(curve, 1000)).toBe(75);
		expect(interpolateTorqueNm(curve, 8500)).toBe(92);
	});

	it('interpolates linearly between samples', () => {
		// midpoint of 5500 (124) and 6000 (125)
		expect(interpolateTorqueNm(curve, 5750)).toBeCloseTo(124.5, 6);
	});

	it('holds the endpoints outside the sampled range', () => {
		expect(interpolateTorqueNm(curve, 400)).toBe(75);
		expect(interpolateTorqueNm(curve, 12000)).toBe(92);
	});

	it('peaks in the mid-range, not at the redline', () => {
		expect(interpolateTorqueNm(curve, 6000)).toBeGreaterThan(interpolateTorqueNm(curve, 8500));
		expect(interpolateTorqueNm(curve, 6000)).toBeGreaterThan(interpolateTorqueNm(curve, 2000));
	});
});

describe('rpm / omega conversions round-trip', () => {
	it('round-trips', () => {
		expect(rpmFromOmega(omegaFromRpm(4200))).toBeCloseTo(4200, 6);
	});
});
