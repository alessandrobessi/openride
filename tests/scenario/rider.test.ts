import { describe, expect, it } from 'vitest';
import { createMotorcycleRig } from '$lib/simulation/physics/createMotorcycleRig';
import { SimulationLoop } from '$lib/simulation/core/SimulationLoop';
import { ADVENTURE_1200 } from '$lib/simulation/motorcycle/configs/adventure-1200';
import { ASSISTS_OFF } from '$lib/simulation/assists/AssistConfig';
import { DRY_ASPHALT } from '$lib/simulation/world/surface';
import type { Motorcycle, MotorcycleControls } from '$lib/simulation/motorcycle/Motorcycle';

const RENDER_FRAME_S = 1 / 60;
const NEUTRAL: MotorcycleControls = {
	throttle: 0,
	clutch: 1,
	frontBrake: 0,
	rearBrake: 0,
	steeringInput: 0
};

async function ride(opts: {
	initialSpeedMps: number;
	gear: number;
	durationS: number;
	control: (m: Motorcycle, t: number) => Partial<MotorcycleControls>;
}) {
	const rig = await createMotorcycleRig(ADVENTURE_1200, { assists: ASSISTS_OFF });
	rig.motorcycle.setEnvironment({ gradeFraction: 0, surface: DRY_ASPHALT });
	const loop = new SimulationLoop({ fixedDtS: 1 / 120 });

	// settle
	for (let t = 0; t < 1.2; t += RENDER_FRAME_S) {
		loop.advance(RENDER_FRAME_S, (dt) => {
			rig.motorcycle.setControls(NEUTRAL);
			rig.motorcycle.update(dt);
			rig.world.step(dt);
		});
	}
	rig.world.setLinearVelocity(rig.chassisHandle, { x: 0, y: 0, z: opts.initialSpeedMps });
	rig.motorcycle.resyncWheelsToGround();
	rig.motorcycle.selectGear(opts.gear);

	let maxRollRate = 0;
	let maxRoll = 0;
	const headingStart = rig.motorcycle.state.yawRad;
	for (let t = 0; t < opts.durationS; t += RENDER_FRAME_S) {
		const tNow = t;
		loop.advance(RENDER_FRAME_S, (dt) => {
			rig.motorcycle.setControls({ ...NEUTRAL, ...opts.control(rig.motorcycle, tNow) });
			rig.motorcycle.update(dt);
			rig.world.step(dt);
		});
		maxRollRate = Math.max(maxRollRate, Math.abs(rig.motorcycle.state.rollRateRadS));
		maxRoll = Math.max(maxRoll, Math.abs(rig.motorcycle.state.rollRad));
	}

	const s = rig.motorcycle.state;
	const result = {
		roll: s.rollRad,
		targetLean: s.targetLeanRad,
		yawRate: s.yawRateRadS,
		speed: s.forwardSpeedMps,
		headingDelta: s.yawRad - headingStart,
		maxRollRate,
		maxRoll
	};
	rig.world.dispose();
	return result;
}

describe('M7 virtual rider (headless)', () => {
	for (const kmh of [2, 5, 10]) {
		it(`stays upright riding straight at ${kmh} km/h without violent oscillation`, async () => {
			const r = await ride({
				initialSpeedMps: kmh / 3.6,
				gear: 1,
				durationS: 6,
				control: () => ({ throttle: 0.12 })
			});
			expect(r.maxRoll).toBeLessThan(0.12); // ~7°
			expect(r.maxRollRate).toBeLessThan(1.2); // no thrashing
			expect(Math.abs(r.roll)).toBeLessThan(0.06);
		});
	}

	it('recovers from a roll disturbance at speed', async () => {
		const rig = await createMotorcycleRig(ADVENTURE_1200, { assists: ASSISTS_OFF });
		const loop = new SimulationLoop({ fixedDtS: 1 / 120 });
		for (let t = 0; t < 1.2; t += RENDER_FRAME_S) {
			loop.advance(RENDER_FRAME_S, (dt) => {
				rig.motorcycle.setControls(NEUTRAL);
				rig.motorcycle.update(dt);
				rig.world.step(dt);
			});
		}
		rig.world.setLinearVelocity(rig.chassisHandle, { x: 0, y: 0, z: 12 });
		rig.motorcycle.resyncWheelsToGround();
		rig.motorcycle.selectGear(3);
		// kick: a roll-rate impulse about the forward axis
		rig.world.setAngularVelocity(rig.chassisHandle, { x: 0, y: 0, z: 1.5 });

		let maxRoll = 0;
		for (let t = 0; t < 4; t += RENDER_FRAME_S) {
			loop.advance(RENDER_FRAME_S, (dt) => {
				rig.motorcycle.setControls({ ...NEUTRAL, throttle: 0.2 });
				rig.motorcycle.update(dt);
				rig.world.step(dt);
			});
			maxRoll = Math.max(maxRoll, Math.abs(rig.motorcycle.state.rollRad));
		}
		const finalRoll = Math.abs(rig.motorcycle.state.rollRad);
		rig.world.dispose();
		expect(maxRoll).toBeLessThan(0.5); // didn't diverge
		expect(finalRoll).toBeLessThan(0.05); // came back upright
	});

	it('leans into a sustained turn and keeps turning at a held speed, without falling', async () => {
		const r = await ride({
			initialSpeedMps: 9,
			gear: 3,
			durationS: 8,
			control: () => ({ throttle: 0.25, steeringInput: 0.5 })
		});
		// Leans in the commanded direction (precise lean-vs-speed-vs-radius
		// equilibrium is M8; tyre forces are M10 — the cornering force here is a
		// provisional stand-in).
		expect(r.roll).toBeGreaterThan(0.1);
		expect(Math.sign(r.roll)).toBe(Math.sign(r.targetLean));
		expect(r.maxRoll).toBeLessThan(ADVENTURE_1200.physical.geometry.maxLeanAngleRad);
		// Still turning (yaw now follows the lean, so the rate is more modest),
		// and speed did not scrub away.
		expect(Math.sign(r.yawRate)).toBe(Math.sign(r.targetLean));
		expect(Math.abs(r.yawRate)).toBeGreaterThan(0.1);
		expect(r.speed).toBeGreaterThan(6);
	});

	it('reverses lean and turn direction with the sign of the steering input', async () => {
		const left = await ride({
			initialSpeedMps: 9,
			gear: 3,
			durationS: 5,
			control: () => ({ throttle: 0.25, steeringInput: -0.5 })
		});
		const right = await ride({
			initialSpeedMps: 9,
			gear: 3,
			durationS: 5,
			control: () => ({ throttle: 0.25, steeringInput: 0.5 })
		});
		expect(Math.sign(left.yawRate)).toBe(-Math.sign(right.yawRate));
		expect(Math.sign(left.roll)).toBe(-Math.sign(right.roll));
	});
});
