import { describe, expect, it } from 'vitest';
import { createMotorcycleRig } from '$lib/simulation/physics/createMotorcycleRig';
import { SimulationLoop } from '$lib/simulation/core/SimulationLoop';
import { ADVENTURE_1200 } from '$lib/simulation/motorcycle/configs/adventure-1200';
import { ASSISTS_OFF } from '$lib/simulation/assists/AssistConfig';
import { equilibriumLeanRad, radiusFromYawRateM } from '$lib/simulation/rider/leanModel';
import type { MotorcycleControls } from '$lib/simulation/motorcycle/Motorcycle';

const RENDER_FRAME_S = 1 / 60;
const NEUTRAL: MotorcycleControls = {
	throttle: 0,
	clutch: 1,
	frontBrake: 0,
	rearBrake: 0,
	steeringInput: 0
};

/** Hold a speed and a steering input until the corner is steady; sample the last second. */
async function steadyCorner(opts: {
	speedMps: number;
	gear: number;
	steeringInput: number;
	throttle: number;
}) {
	const rig = await createMotorcycleRig(ADVENTURE_1200, { assists: ASSISTS_OFF });
	const loop = new SimulationLoop({ fixedDtS: 1 / 120 });
	for (let t = 0; t < 1.2; t += RENDER_FRAME_S) {
		loop.advance(RENDER_FRAME_S, (dt) => {
			rig.motorcycle.setControls(NEUTRAL);
			rig.motorcycle.update(dt);
			rig.world.step(dt);
		});
	}
	rig.world.setLinearVelocity(rig.chassisHandle, { x: 0, y: 0, z: opts.speedMps });
	rig.motorcycle.resyncWheelsToGround();
	rig.motorcycle.selectGear(opts.gear);

	const controls = { ...NEUTRAL, throttle: opts.throttle, steeringInput: opts.steeringInput };
	const samples: Array<{ roll: number; yawRate: number; speed: number }> = [];
	for (let t = 0; t < 10; t += RENDER_FRAME_S) {
		loop.advance(RENDER_FRAME_S, (dt) => {
			rig.motorcycle.setControls(controls);
			rig.motorcycle.update(dt);
			rig.world.step(dt);
		});
		if (t > 8) {
			const s = rig.motorcycle.state;
			samples.push({ roll: s.rollRad, yawRate: s.yawRateRadS, speed: s.forwardSpeedMps });
		}
	}
	rig.world.dispose();
	const avg = (f: (x: (typeof samples)[number]) => number) =>
		samples.reduce((a, x) => a + f(x), 0) / samples.length;
	return {
		roll: Math.abs(avg((x) => x.roll)),
		yawRate: Math.abs(avg((x) => x.yawRate)),
		speed: Math.abs(avg((x) => x.speed))
	};
}

describe('M8 dynamic lean (headless)', () => {
	it('steady lean in a constant-radius corner converges toward atan(v²/rg) (§74)', async () => {
		for (const speedMps of [8, 15, 22]) {
			const c = await steadyCorner({ speedMps, gear: 3, steeringInput: 0.5, throttle: 0.25 });
			const radiusM = radiusFromYawRateM(c.speed, c.yawRate);
			const expected = equilibriumLeanRad(c.speed, radiusM);
			// "need not match perfectly, but should converge plausibly" (§74).
			expect(Math.abs(c.roll - expected)).toBeLessThan(0.18);
			expect(c.roll).toBeGreaterThan(0.05);
		}
	});

	it('lean grows with speed for the same steering input', async () => {
		const slow = await steadyCorner({ speedMps: 8, gear: 2, steeringInput: 0.5, throttle: 0.2 });
		const fast = await steadyCorner({ speedMps: 22, gear: 4, steeringInput: 0.5, throttle: 0.3 });
		expect(fast.roll).toBeGreaterThan(slow.roll + 0.05);
	});

	it('lean grows as the corner tightens at a fixed speed', async () => {
		const gentle = await steadyCorner({
			speedMps: 16,
			gear: 3,
			steeringInput: 0.3,
			throttle: 0.25
		});
		const hard = await steadyCorner({ speedMps: 16, gear: 3, steeringInput: 0.9, throttle: 0.25 });
		expect(hard.roll).toBeGreaterThan(gentle.roll + 0.05);
		// Tighter corner ⇒ smaller radius.
		expect(radiusFromYawRateM(hard.speed, hard.yawRate)).toBeLessThan(
			radiusFromYawRateM(gentle.speed, gentle.yawRate)
		);
	});
});
