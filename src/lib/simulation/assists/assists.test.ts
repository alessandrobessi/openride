import { describe, expect, it } from 'vitest';
import { Abs } from './abs';
import { TractionControl } from './tractionControl';
import { WheelieControl } from './wheelieControl';
import { DEFAULT_ASSISTS } from './AssistConfig';

const DT = 1 / 120;

describe('Abs', () => {
	it('passes the brake through when slip is shallow', () => {
		const abs = new Abs(DEFAULT_ASSISTS.abs);
		expect(abs.modulate(1, -0.05, DT)).toBe(1);
		expect(abs.active).toBe(false);
	});

	it('bleeds off brake pressure while slip is past the activation threshold', () => {
		const abs = new Abs(DEFAULT_ASSISTS.abs);
		let eff = 1;
		for (let i = 0; i < 20; i++) eff = abs.modulate(1, -0.3, DT); // deep lock
		expect(eff).toBeLessThan(0.9);
		expect(abs.active).toBe(true);
	});

	it('restores brake pressure once slip recovers, gradually (no chatter)', () => {
		const abs = new Abs(DEFAULT_ASSISTS.abs);
		for (let i = 0; i < 20; i++) abs.modulate(1, -0.3, DT); // release
		const afterOneRecoveryStep = abs.modulate(1, -0.05, DT);
		expect(afterOneRecoveryStep).toBeGreaterThan(0);
		expect(afterOneRecoveryStep).toBeLessThan(1); // not an instant jump back
	});

	it('does nothing when disabled', () => {
		const abs = new Abs({ ...DEFAULT_ASSISTS.abs, enabled: false });
		for (let i = 0; i < 20; i++) expect(abs.modulate(1, -0.5, DT)).toBe(1);
	});
});

describe('TractionControl', () => {
	const tc = () => new TractionControl(DEFAULT_ASSISTS.tractionControl);

	it('leaves the throttle alone below the activation slip', () => {
		expect(tc().limit(1, 0.05)).toBe(1);
	});

	it('cuts the throttle in proportion to the slip excess', () => {
		const mild = tc().limit(1, 0.16);
		const hard = tc().limit(1, 0.4);
		expect(mild).toBeLessThan(1);
		expect(hard).toBeLessThan(mild);
		expect(hard).toBeGreaterThanOrEqual(0);
	});

	it('does nothing when disabled', () => {
		const off = new TractionControl({ ...DEFAULT_ASSISTS.tractionControl, enabled: false });
		expect(off.limit(1, 0.6)).toBe(1);
	});
});

describe('WheelieControl', () => {
	const wc = () => new WheelieControl(DEFAULT_ASSISTS.wheelieControl);

	it('passes full torque when the front is well loaded', () => {
		expect(wc().limit(400, 0.5)).toBe(400);
	});

	it('cuts torque toward zero as the front load fraction approaches the limit', () => {
		const near = wc().limit(400, 0.1);
		const atLimit = wc().limit(400, 0.08);
		expect(near).toBeLessThan(400);
		expect(atLimit).toBeLessThan(near);
		expect(atLimit).toBeCloseTo(0, 1);
	});

	it('does nothing when disabled', () => {
		const off = new WheelieControl({ ...DEFAULT_ASSISTS.wheelieControl, enabled: false });
		expect(off.limit(400, 0.02)).toBe(400);
	});
});
