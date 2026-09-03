import { describe, expect, it } from 'vitest';
import { SteeringController } from './SteeringController';
import { DEFAULT_RIDER } from './profiles/default-rider';
import { ADVENTURE_1200 } from '../motorcycle/configs/adventure-1200';

const geo = ADVENTURE_1200.physical.geometry;
const make = () => new SteeringController(DEFAULT_RIDER, geo.wheelbaseM, geo.maxLeanAngleRad);
// A large dt lets the slew-limited lean target reach its commanded value at once.
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

	it('derives more lean at higher speed for the same turn intention (M8)', () => {
		const slow = Math.abs(make().command(0.6, 8, SETTLE_DT).targetLeanRad);
		const fast = Math.abs(make().command(0.6, 20, SETTLE_DT).targetLeanRad);
		expect(fast).toBeGreaterThan(slow);
	});

	it('derives more lean as the turn tightens at a fixed speed', () => {
		const gentle = Math.abs(make().command(0.3, 15, SETTLE_DT).targetLeanRad);
		const hard = Math.abs(make().command(0.9, 15, SETTLE_DT).targetLeanRad);
		expect(hard).toBeGreaterThan(gentle);
	});

	it('caps lean at the hard limit and lateral accel at the rider limit', () => {
		const c = make().command(1, 40, SETTLE_DT);
		expect(c.targetLeanRad).toBeLessThanOrEqual(geo.maxLeanAngleRad + 1e-9);
		const ay = 40 * c.targetYawRateRadS;
		expect(Math.abs(ay)).toBeLessThanOrEqual(DEFAULT_RIDER.maxTargetLateralAccelerationMps2 + 1e-6);
	});

	it('slew-limits the target lean so a step input ramps in', () => {
		const afterOneStep = Math.abs(make().command(1, 20, 1 / 120).targetLeanRad);
		expect(afterOneStep).toBeGreaterThan(0);
		expect(afterOneStep).toBeLessThan(0.02); // ~0.9 rad/s · (1/120) s
	});

	it('reverses lean and yaw with the sign of the input', () => {
		const left = make().command(-0.6, 15, SETTLE_DT);
		const right = make().command(0.6, 15, SETTLE_DT);
		expect(Math.sign(left.targetLeanRad)).toBe(-Math.sign(right.targetLeanRad));
		expect(Math.sign(left.targetYawRateRadS)).toBe(-Math.sign(right.targetYawRateRadS));
	});
});
