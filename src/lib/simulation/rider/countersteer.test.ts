import { describe, expect, it } from 'vitest';
import { countersteer } from './countersteer';
import { DEFAULT_RIDER } from './profiles/default-rider';

const profile = DEFAULT_RIDER.steering;
const base = { leanRad: 0, leanRateRadS: 0, targetLeanRad: 0, speedMps: 25, profile };

describe('countersteer', () => {
	it('has (almost) no effect at parking speed', () => {
		const c = countersteer({ ...base, targetLeanRad: 0.4, speedMps: 1 });
		expect(c.speedWeight).toBeLessThan(0.05);
		expect(Math.abs(c.rollMomentNm)).toBeLessThan(5);
		expect(Math.abs(c.steerAngleRad)).toBeLessThan(0.01);
	});

	it('is fully active at riding speed', () => {
		expect(countersteer({ ...base, speedMps: 25 }).speedWeight).toBeCloseTo(1, 3);
	});

	it('turn-in roll moment has the sign of the lean error and fades as it closes', () => {
		const turningIn = countersteer({ ...base, leanRad: 0.05, targetLeanRad: 0.4 });
		const settled = countersteer({ ...base, leanRad: 0.4, targetLeanRad: 0.4 });
		expect(turningIn.rollMomentNm).toBeGreaterThan(0);
		expect(Math.abs(settled.rollMomentNm)).toBeLessThan(Math.abs(turningIn.rollMomentNm) * 0.1);
	});

	it('the handlebars sit opposite to the turn during turn-in', () => {
		const c = countersteer({ ...base, leanRad: 0, targetLeanRad: 0.4 });
		expect(c.steerAngleRad).toBeLessThan(0); // steering right to turn left-of-sign? opposite the +lean
	});

	it('the counter angle relaxes once the lean is established', () => {
		const c = countersteer({ ...base, leanRad: 0.4, leanRateRadS: 0, targetLeanRad: 0.4 });
		expect(Math.abs(c.steerAngleRad)).toBeLessThan(0.01);
	});
});
