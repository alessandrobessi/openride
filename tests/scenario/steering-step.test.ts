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
	// The step is +0.5 turn intention = a left turn: the bike leans left
	// (negative roll about the forward axis in this frame) and yaws left
	// (positive yaw rate).
	it('turn-in begins with an opposite (counter) steering angle, then settles into the turn', async () => {
		const s = await steeringStep();
		const turnIn = s.filter((x) => x.t >= 0.5 && x.t < 1.1);

		// Countersteer: through turn-in the handlebars sit the *other* way to the
		// (left, positive-geometric) turn — a real, sustained negative steer angle
		// — and it stays a small angle throughout (the reduced-order lateral model
		// keeps a standing lean error, so it doesn't fully relax; PHYSICS §31).
		const minSteerDuringTurnIn = Math.min(...turnIn.map((x) => x.steerAngle));
		expect(minSteerDuringTurnIn).toBeLessThan(-0.005);
		expect(Math.max(...s.map((x) => Math.abs(x.steerAngle)))).toBeLessThan(0.06);
	});

	it('roll builds in the commanded (left, negative) direction and the roll rate settles', async () => {
		const s = await steeringStep();
		const end = s[s.length - 1];
		expect(end.roll).toBeLessThan(-0.1); // leaned left
		expect(Math.abs(end.rollRate)).toBeLessThan(0.15); // settled

		const peakRollRate = Math.max(...s.map((x) => Math.abs(x.rollRate)));
		expect(peakRollRate).toBeGreaterThan(0.3); // there was a real transient
	});

	it('yaw develops after the roll (turning follows lean, not a direct yaw)', async () => {
		const s = await steeringStep();
		const rollEnd = s[s.length - 1].roll;
		const yawEnd = s[s.length - 1].yawRate;
		const tRollHalf = s.find((x) => x.roll < 0.5 * rollEnd)?.t ?? Infinity;
		const tYawHalf = s.find((x) => x.yawRate > 0.5 * yawEnd)?.t ?? Infinity;
		expect(yawEnd).toBeGreaterThan(0.04); // yaws left
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
