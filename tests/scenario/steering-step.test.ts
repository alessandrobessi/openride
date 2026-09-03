import { describe, expect, it } from 'vitest';
import { createMotorcycleRig } from '$lib/simulation/physics/createMotorcycleRig';
import { SimulationLoop } from '$lib/simulation/core/SimulationLoop';
import { ADVENTURE_1200 } from '$lib/simulation/motorcycle/configs/adventure-1200';
import { ASSISTS_OFF } from '$lib/simulation/assists/AssistConfig';
import type { MotorcycleControls } from '$lib/simulation/motorcycle/Motorcycle';

const RENDER_FRAME_S = 1 / 60;
const NEUTRAL: MotorcycleControls = {
	throttle: 0,
	clutch: 1,
	frontBrake: 0,
	rearBrake: 0,
	steeringInput: 0
};

interface Sample {
	t: number;
	steerAngle: number;
	roll: number;
	rollRate: number;
	yawRate: number;
}

/** §75 steering-step test: constant speed, step the steering intention 0 → +0.5. */
async function steeringStep() {
	const rig = await createMotorcycleRig(ADVENTURE_1200, { assists: ASSISTS_OFF });
	const loop = new SimulationLoop({ fixedDtS: 1 / 120 });
	for (let t = 0; t < 1.2; t += RENDER_FRAME_S) {
		loop.advance(RENDER_FRAME_S, (dt) => {
			rig.motorcycle.setControls(NEUTRAL);
			rig.motorcycle.update(dt);
			rig.world.step(dt);
		});
	}
	rig.world.setLinearVelocity(rig.chassisHandle, { x: 0, y: 0, z: 20 });
	rig.motorcycle.resyncWheelsToGround();
	rig.motorcycle.selectGear(4);

	// hold straight briefly, then step to +0.5
	const samples: Sample[] = [];
	for (let t = 0; t < 6; t += RENDER_FRAME_S) {
		const steeringInput = t < 0.5 ? 0 : 0.5;
		loop.advance(RENDER_FRAME_S, (dt) => {
			rig.motorcycle.setControls({ ...NEUTRAL, throttle: 0.28, steeringInput });
			rig.motorcycle.update(dt);
			rig.world.step(dt);
		});
		const s = rig.motorcycle.state;
		samples.push({
			t,
			steerAngle: s.steeringAngleRad,
			roll: s.rollRad,
			rollRate: s.rollRateRadS,
			yawRate: s.yawRateRadS
		});
	}
	rig.world.dispose();
	return samples;
}

describe('M9 countersteering — steering-step response (§75)', () => {
	it('turn-in begins with an opposite (counter) steering angle, then settles into the turn', async () => {
		const s = await steeringStep();
		const afterStep = s.filter((x) => x.t >= 0.5);
		const turnIn = afterStep.filter((x) => x.t < 1.1);

		// Countersteer: the handlebars go opposite (negative) to the +0.5 turn
		// right after the step.
		const minSteerDuringTurnIn = Math.min(...turnIn.map((x) => x.steerAngle));
		expect(minSteerDuringTurnIn).toBeLessThan(-0.005);

		// ...then the steering angle recovers from that counter blip as the turn
		// establishes, settling near the small in-turn geometric angle.
		const finalSteer = s[s.length - 1].steerAngle;
		expect(finalSteer).toBeGreaterThan(minSteerDuringTurnIn + 0.008);
		expect(Math.abs(finalSteer)).toBeLessThan(0.03);
	});

	it('roll builds in the commanded direction and the roll rate settles', async () => {
		const s = await steeringStep();
		const end = s[s.length - 1];
		expect(end.roll).toBeGreaterThan(0.1);
		expect(Math.abs(end.rollRate)).toBeLessThan(0.15); // settled

		const peakRollRate = Math.max(...s.map((x) => x.rollRate));
		expect(peakRollRate).toBeGreaterThan(0.3); // there was a real transient
	});

	it('yaw develops after the roll (turning follows lean, not a direct yaw)', async () => {
		const s = await steeringStep();
		const tRollHalf = s.find((x) => x.roll > 0.5 * s[s.length - 1].roll)?.t ?? Infinity;
		const yawEnd = s[s.length - 1].yawRate;
		const tYawHalf = s.find((x) => x.yawRate > 0.5 * yawEnd)?.t ?? Infinity;
		expect(yawEnd).toBeGreaterThan(0.05);
		expect(tYawHalf).toBeGreaterThanOrEqual(tRollHalf); // yaw lags roll
	});

	it('the response settles to a steady cornering state', async () => {
		const s = await steeringStep();
		const lastSecond = s.filter((x) => x.t >= 5);
		const rollSpread =
			Math.max(...lastSecond.map((x) => x.roll)) - Math.min(...lastSecond.map((x) => x.roll));
		expect(rollSpread).toBeLessThan(0.03);
	});
});
