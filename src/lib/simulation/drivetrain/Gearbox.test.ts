import { describe, expect, it } from 'vitest';
import { Gearbox } from './Gearbox';
import { ADVENTURE_1200 } from '../motorcycle/configs/adventure-1200';

const config = ADVENTURE_1200.powertrain.gearbox;

describe('Gearbox', () => {
	it('starts in neutral with zero total ratio', () => {
		const g = new Gearbox(config);
		expect(g.gear).toBe(0);
		expect(g.isNeutral).toBe(true);
		expect(g.totalRatio()).toBe(0);
	});

	it('computes R = R_primary · G_i · R_final', () => {
		const g = new Gearbox(config);
		g.selectGear(1);
		expect(g.totalRatio()).toBeCloseTo(1.65 * 2.44 * 2.82, 5); // ≈ 11.357
		g.selectGear(6);
		expect(g.totalRatio()).toBeCloseTo(1.65 * 0.85 * 2.82, 5); // ≈ 3.956
	});

	it('reduction decreases monotonically from 1st to 6th', () => {
		const g = new Gearbox(config);
		let previous = Infinity;
		for (let gear = 1; gear <= 6; gear++) {
			g.selectGear(gear);
			expect(g.totalRatio()).toBeLessThan(previous);
			previous = g.totalRatio();
		}
	});

	it('clamps gear selection to [0, 6]', () => {
		const g = new Gearbox(config);
		g.selectGear(99);
		expect(g.gear).toBe(6);
		g.selectGear(-5);
		expect(g.gear).toBe(0);
	});

	it('runs a shift torque-cut for shiftCutTimeS after a change', () => {
		const g = new Gearbox(config);
		g.shiftUp();
		expect(g.torqueCutActive).toBe(true);
		g.update(config.shiftCutTimeS / 2);
		expect(g.torqueCutActive).toBe(true);
		g.update(config.shiftCutTimeS);
		expect(g.torqueCutActive).toBe(false);
	});

	it('does not trigger a cut when the selected gear is unchanged', () => {
		const g = new Gearbox(config);
		g.selectGear(3);
		g.update(1);
		g.selectGear(3);
		expect(g.torqueCutActive).toBe(false);
	});
});
