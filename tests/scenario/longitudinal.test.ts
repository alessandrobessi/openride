import { describe, expect, it } from 'vitest';
import { createMotorcycleRig } from '$lib/simulation/physics/createMotorcycleRig';
import { SimulationLoop } from '$lib/simulation/core/SimulationLoop';
import { ADVENTURE_1200 } from '$lib/simulation/motorcycle/configs/adventure-1200';
import { DRY_ASPHALT } from '$lib/simulation/world/surface';
import type { MotorcycleControls } from '$lib/simulation/motorcycle/Motorcycle';

const RENDER_FRAME_S = 1 / 60;
const NEUTRAL: MotorcycleControls = {
	throttle: 0,
	clutch: 1,
	frontBrake: 0,
	rearBrake: 0,
	steeringInput: 0
};

interface RunOptions {
	controls?: Partial<MotorcycleControls>;
	gradeFraction?: number;
	initialSpeedMps?: number;
	/** Gear to select before the measured window. Default 0 (neutral) to isolate resistance. */
	gear?: number;
	durationS: number;
	settleS?: number;
}

/** Run a longitudinal scenario and return a speed sample at start and end of the measured window. */
async function run(opts: RunOptions) {
	const rig = await createMotorcycleRig(ADVENTURE_1200);
	const loop = new SimulationLoop({ fixedDtS: 1 / 120 });
	const controls = { ...NEUTRAL, ...opts.controls };
	rig.motorcycle.setEnvironment({
		gradeFraction: opts.gradeFraction ?? 0,
		surface: DRY_ASPHALT
	});

	// Let the suspension settle first so normal loads are valid.
	for (let t = 0; t < (opts.settleS ?? 1.5); t += RENDER_FRAME_S) {
		loop.advance(RENDER_FRAME_S, (dt) => {
			rig.motorcycle.setControls(NEUTRAL);
			rig.motorcycle.update(dt);
			rig.world.step(dt);
		});
	}
	if (opts.initialSpeedMps) {
		rig.world.setLinearVelocity(rig.chassisHandle, { x: 0, y: 0, z: opts.initialSpeedMps });
		rig.motorcycle.resyncWheelsToGround();
	}
	rig.motorcycle.selectGear(opts.gear ?? 0);

	const speeds: Array<{ t: number; v: number }> = [];
	for (let t = 0; t < opts.durationS; t += RENDER_FRAME_S) {
		loop.advance(RENDER_FRAME_S, (dt) => {
			rig.motorcycle.setControls(controls);
			rig.motorcycle.update(dt);
			rig.world.step(dt);
		});
		speeds.push({ t, v: rig.motorcycle.state.forwardSpeedMps });
	}
	const state = rig.motorcycle.state;
	rig.world.dispose();
	return { speeds, state, finalV: speeds[speeds.length - 1].v };
}

describe('M4 longitudinal dynamics (headless)', () => {
	it('at rest with no throttle on flat ground, stays at rest (energy sanity)', async () => {
		const { finalV } = await run({ durationS: 3 });
		expect(Math.abs(finalV)).toBeLessThan(0.05);
	});

	it('coast-down deceleration matches drag + rolling resistance', async () => {
		const v0 = 30;
		const { speeds } = await run({ initialSpeedMps: v0, durationS: 1, settleS: 1.5 });
		const measuredDecel =
			(speeds[0].v - speeds[speeds.length - 1].v) / (speeds[speeds.length - 1].t - speeds[0].t);

		const aero = ADVENTURE_1200.physical.aero;
		const dragCoeff = 0.5 * aero.airDensityKgM3 * aero.dragCoefficient * aero.frontalAreaM2;
		const weightN = ADVENTURE_1200.physical.mass.totalKg * 9.80665;
		const expectedDecel =
			(dragCoeff * v0 * v0 + DRY_ASPHALT.rollingResistance * weightN) /
			ADVENTURE_1200.physical.mass.totalKg;

		expect(measuredDecel).toBeGreaterThan(expectedDecel * 0.8);
		expect(measuredDecel).toBeLessThan(expectedDecel * 1.2);
	});

	it('coast-down is faster from a higher speed (drag ∝ v²)', async () => {
		const fast = await run({ initialSpeedMps: 50, durationS: 1 });
		const slow = await run({ initialSpeedMps: 20, durationS: 1 });
		const decelFast = fast.speeds[0].v - fast.finalV;
		const decelSlow = slow.speeds[0].v - slow.finalV;
		expect(decelFast).toBeGreaterThan(decelSlow * 1.5);
	});

	it('rolls downhill from rest with no throttle, then settles at terminal speed', async () => {
		const { speeds, finalV } = await run({ gradeFraction: -0.1, durationS: 30 });
		expect(speeds[30].v).toBeGreaterThan(0.5); // accelerating early
		expect(finalV).toBeGreaterThan(5); // reached a real rolling speed
		expect(finalV).toBeLessThan(30); // bounded by drag + rr
	});

	it('front brake sheds speed at a grip-limited rate (front tyre only, M10)', async () => {
		const { speeds, finalV } = await run({
			initialSpeedMps: 30,
			controls: { frontBrake: 1 },
			durationS: 3
		});
		const decel = (speeds[0].v - finalV) / (speeds[speeds.length - 1].t - speeds[0].t);
		// Front-only braking is limited to ≈ µ·F_zf (static load — no weight
		// transfer yet): a few m/s², not the M4 grip-unlimited stop.
		expect(decel).toBeGreaterThan(4);
		expect(decel).toBeLessThan(8);
	});
});
