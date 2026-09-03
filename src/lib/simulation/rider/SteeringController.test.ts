import { describe, expect, it } from 'vitest';
import { SteeringController } from './SteeringController';
import { DEFAULT_RIDER } from './profiles/default-rider';
import { ADVENTURE_1200 } from '../motorcycle/configs/adventure-1200';

const geo = ADVENTURE_1200.physical.geometry;
const make = () => new SteeringController(DEFAULT_RIDER, geo.wheelbaseM, geo.maxLeanAngleRad);
// A large dt lets the slew-limited target reach its commanded value in one call.
const SETTLE_DT = 100;

describe('SteeringController', () => {
	it('commands no lean or yaw with no turn intention', () => {
		const c = make().command(0, 20, SETTLE_DT);
		expect(c.targetLeanRad).toBe(0);
		expect(c.targetYawRateRadS).toBeCloseTo(0, 6);
	});

	it('does not ask for lean at a standstill', () => {
		expect(make().command(1, 0, SETTLE_DT).targetLeanRad).toBeCloseTo(0, 3);
	});

	it('leans into the turn, more at higher lateral-accel demand', () => {
		const half = make().command(0.5, 20, SETTLE_DT).targetLeanRad;
		const full = make().command(1, 20, SETTLE_DT).targetLeanRad;
		expect(full).toBeGreaterThan(half);
		expect(full).toBeGreaterThan(0);
		expect(full).toBeLessThanOrEqual(geo.maxLeanAngleRad + 1e-9);
	});

	it('slew-limits the target lean so a step input ramps in', () => {
		const sc = make();
		const afterOneStep = sc.command(1, 20, 1 / 120).targetLeanRad;
		expect(afterOneStep).toBeGreaterThan(0);
		expect(afterOneStep).toBeLessThan(0.02); // ~0.9 rad/s · (1/120) s
	});

	it('reverses lean and yaw with the sign of the input', () => {
		const left = make().command(-0.6, 15, SETTLE_DT);
		const right = make().command(0.6, 15, SETTLE_DT);
		expect(Math.sign(left.targetLeanRad)).toBe(-Math.sign(right.targetLeanRad));
		expect(Math.sign(left.targetYawRateRadS)).toBe(-Math.sign(right.targetYawRateRadS));
	});

	it('yaw rate for a fixed lean falls off as speed rises (ψ̇ = g·tanφ / v)', () => {
		const slow = make().command(1, 8, SETTLE_DT).targetYawRateRadS;
		const fast = make().command(1, 25, SETTLE_DT).targetYawRateRadS;
		expect(Math.abs(fast)).toBeLessThan(Math.abs(slow));
	});
});
