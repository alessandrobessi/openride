import { describe, expect, it } from 'vitest';
import { BalanceController } from './BalanceController';
import { DEFAULT_RIDER } from './profiles/default-rider';

const GRAV_FF = 330 * 9.80665 * 0.67; // m·g·h for the Adventure 1200
const bc = new BalanceController(DEFAULT_RIDER.balance, GRAV_FF);

describe('BalanceController', () => {
	it('assist is full at parking speed and eases to the floor at riding speed', () => {
		expect(bc.assistFactor(0)).toBe(1);
		expect(bc.assistFactor(2)).toBe(1);
		expect(bc.assistFactor(15)).toBeCloseTo(DEFAULT_RIDER.balance.minAssistFactor, 5);
		expect(bc.assistFactor(2)).toBeGreaterThan(bc.assistFactor(11));
	});

	it('cancels the inverted-pendulum gravity moment when level and still', () => {
		// Level, no rate, target 0: only the (zero) feed-forward + (zero) PD.
		expect(bc.torqueNm(0, 0, 0, 0)).toBeCloseTo(0, 6);
	});

	it('pushes back toward upright when tipped, and the restoring torque exceeds gravity', () => {
		const roll = 0.1;
		const t = bc.torqueNm(roll, 0, 0, 0);
		expect(t).toBeLessThan(0); // negative torque to reduce +roll
		const gravityMoment = GRAV_FF * Math.sin(roll);
		expect(Math.abs(t)).toBeGreaterThan(gravityMoment); // net stabilising
	});

	it('holds a commanded lean with a sustained torque opposing gravity (no cornering force yet)', () => {
		const target = 0.35;
		const t = bc.torqueNm(target, 0, target, 5);
		// Assist-scaled; opposes gravity's leaning moment at the target.
		const expected = -bc.assistFactor(5) * GRAV_FF * Math.sin(target);
		expect(t).toBeCloseTo(expected, 6);
		expect(t).toBeLessThan(0);
	});

	it('damps roll rate', () => {
		const still = bc.torqueNm(0, 0, 0, 5);
		const rolling = bc.torqueNm(0, 0.5, 0, 5);
		expect(rolling).toBeLessThan(still); // opposes +roll rate
	});
});
