import { describe, expect, it } from 'vitest';
import { createMotorcycleRig } from '$lib/simulation/physics/createMotorcycleRig';
import { SimulationLoop } from '$lib/simulation/core/SimulationLoop';
import { ADVENTURE_1200 } from '$lib/simulation/motorcycle/configs/adventure-1200';
import { staticAxleLoadsN } from '$lib/simulation/motorcycle/axleLoads';
import type { Motorcycle, MotorcycleControls } from '$lib/simulation/motorcycle/Motorcycle';

const RENDER_FRAME_S = 1 / 60;
const NEUTRAL: MotorcycleControls = {
	throttle: 0,
	clutch: 1,
	frontBrake: 0,
	rearBrake: 0,
	steeringInput: 0
};
const M = ADVENTURE_1200.physical.mass.totalKg;
const GEO = ADVENTURE_1200.physical.geometry;
const WEIGHT_N = M * 9.80665;

async function run(opts: {
	initialSpeedMps: number;
	gear: number;
	durationS: number;
	control: (m: Motorcycle, t: number) => Partial<MotorcycleControls>;
}) {
	const rig = await createMotorcycleRig(ADVENTURE_1200);
	const loop = new SimulationLoop({ fixedDtS: 1 / 120 });
	for (let t = 0; t < 1.5; t += RENDER_FRAME_S) {
		loop.advance(RENDER_FRAME_S, (dt) => {
			rig.motorcycle.setControls(NEUTRAL);
			rig.motorcycle.update(dt);
			rig.world.step(dt);
		});
	}
	rig.world.setLinearVelocity(rig.chassisHandle, { x: 0, y: 0, z: opts.initialSpeedMps });
	rig.motorcycle.resyncWheelsToGround();
	rig.motorcycle.selectGear(opts.gear);

	const samples: Array<{ ax: number; fzf: number; fzr: number; roll: number; slipR: number }> = [];
	for (let t = 0; t < opts.durationS; t += RENDER_FRAME_S) {
		const tNow = t;
		loop.advance(RENDER_FRAME_S, (dt) => {
			rig.motorcycle.setControls({ ...NEUTRAL, ...opts.control(rig.motorcycle, tNow) });
			rig.motorcycle.update(dt);
			rig.world.step(dt);
		});
		const s = rig.motorcycle.state;
		samples.push({
			ax: s.longitudinalAccelMps2,
			fzf: s.frontNormalLoadN,
			fzr: s.rearNormalLoadN,
			roll: s.rollRad,
			slipR: s.rearSlipRatio
		});
	}
	rig.world.dispose();
	return samples;
}

describe('M11 longitudinal weight transfer (headless, §77)', () => {
	it('hard braking loads the front tyre and unloads the rear', async () => {
		const s = await run({
			initialSpeedMps: 28,
			gear: 0,
			durationS: 2,
			control: () => ({ frontBrake: 0.9, rearBrake: 0.4 })
		});
		const stat = staticAxleLoadsN(M, GEO);
		// average over the steady braking window (skip the first 0.4 s transient)
		const window = s.slice(24);
		const meanFzf = window.reduce((a, x) => a + x.fzf, 0) / window.length;
		const meanFzr = window.reduce((a, x) => a + x.fzr, 0) / window.length;

		expect(meanFzf).toBeGreaterThan(stat.frontN * 1.4); // front clearly loaded
		expect(meanFzr).toBeLessThan(stat.rearN * 0.4); // rear clearly unloaded
		expect(Math.max(...window.map((x) => Math.abs(x.roll)))).toBeLessThan(0.1); // stayed upright
	});

	it('acceleration loads the rear tyre and unloads the front', async () => {
		const s = await run({
			initialSpeedMps: 2,
			gear: 2,
			durationS: 3,
			control: () => ({ throttle: 1, clutch: 1 })
		});
		const stat = staticAxleLoadsN(M, GEO);
		const last = s[s.length - 1];
		expect(last.fzr).toBeGreaterThan(stat.rearN * 1.3);
		expect(last.fzf).toBeLessThan(stat.frontN);
	});

	it('the supported load tracks ≈ mg while both wheels are down', async () => {
		const s = await run({
			initialSpeedMps: 20,
			gear: 0,
			durationS: 1.5,
			control: () => ({ frontBrake: 0.25, rearBrake: 0.25 }) // gentle — rear stays loaded
		});
		for (const x of s.slice(24)) {
			expect(x.fzf + x.fzr).toBeGreaterThan(WEIGHT_N * 0.8);
			expect(x.fzf + x.fzr).toBeLessThan(WEIGHT_N * 1.3);
		}
	});

	it('100→0 km/h: the rear tyre tends toward lock as it unloads', async () => {
		const s = await run({
			initialSpeedMps: 100 / 3.6,
			gear: 0,
			durationS: 3,
			control: () => ({ frontBrake: 0.8, rearBrake: 0.7 })
		});
		const braking = s.slice(12, 90);
		// Rear ends up carrying almost nothing and its slip goes deep negative.
		expect(Math.min(...braking.map((x) => x.fzr))).toBeLessThan(200);
		expect(Math.min(...braking.map((x) => x.slipR))).toBeLessThan(-0.5);
	});
});
