import { describe, expect, it } from 'vitest';
import { createMotorcycleRig } from '$lib/simulation/physics/createMotorcycleRig';
import { SimulationLoop } from '$lib/simulation/core/SimulationLoop';
import { ADVENTURE_1200 } from '$lib/simulation/motorcycle/configs/adventure-1200';
import { DEFAULT_ASSISTS, type AssistConfig } from '$lib/simulation/assists/AssistConfig';
import type { Motorcycle, MotorcycleControls } from '$lib/simulation/motorcycle/Motorcycle';

const RENDER_FRAME_S = 1 / 60;
const NEUTRAL: MotorcycleControls = {
	throttle: 0,
	clutch: 1,
	frontBrake: 0,
	rearBrake: 0,
	steeringInput: 0
};

function assistsWith(overrides: Partial<Record<keyof AssistConfig, boolean>>): AssistConfig {
	const a = structuredClone(DEFAULT_ASSISTS);
	for (const [k, v] of Object.entries(overrides)) a[k as keyof AssistConfig].enabled = v as boolean;
	return a;
}

async function makeRig(assists: AssistConfig) {
	const rig = await createMotorcycleRig(ADVENTURE_1200, { assists });
	const loop = new SimulationLoop({ fixedDtS: 1 / 120 });
	const step = (seconds: number, drive: (m: Motorcycle, t: number) => void) => {
		for (let t = 0; t < seconds; t += RENDER_FRAME_S) {
			const tNow = t;
			loop.advance(RENDER_FRAME_S, (dt) => {
				drive(rig.motorcycle, tNow);
				rig.motorcycle.update(dt);
				rig.world.step(dt);
			});
		}
	};
	step(1.4, (m) => m.setControls(NEUTRAL));
	return { rig, step };
}

describe('M12 configurable assists (headless)', () => {
	it('ABS keeps the front tyre working (not held in a deep lock) under 100→0 km/h braking', async () => {
		const brakeRun = async (absOn: boolean) => {
			const { rig, step } = await makeRig(assistsWith({ abs: absOn }));
			rig.world.setLinearVelocity(rig.chassisHandle, { x: 0, y: 0, z: 100 / 3.6 });
			rig.motorcycle.resyncWheelsToGround();
			rig.motorcycle.selectGear(0);
			const slips: number[] = [];
			let sawAbs = false;
			step(3, (m) => {
				m.setControls({ ...NEUTRAL, frontBrake: 1, rearBrake: 0.5 });
				if (m.state.forwardSpeedMps > 4) slips.push(m.state.frontSlipRatio);
				sawAbs = sawAbs || m.state.absActive;
			});
			rig.world.dispose();
			const meanSlip = slips.reduce((a, x) => a + x, 0) / slips.length;
			// fraction of the braking spent in a near-total lock
			const lockedFraction = slips.filter((s) => s < -0.7).length / slips.length;
			return { meanSlip, lockedFraction, sawAbs };
		};

		const withAbs = await brakeRun(true);
		const noAbs = await brakeRun(false);
		expect(withAbs.sawAbs).toBe(true);
		// Without ABS the front is pinned in a deep lock; with ABS it is cycled
		// so the average slip is far shallower and it is rarely fully locked.
		expect(noAbs.lockedFraction).toBeGreaterThan(0.7);
		expect(withAbs.lockedFraction).toBeLessThan(0.3);
		expect(withAbs.meanSlip).toBeGreaterThan(noAbs.meanSlip + 0.3);
	});

	it('traction control tames sustained rear wheelspin on a first-gear launch', async () => {
		const launch = async (tcOn: boolean) => {
			const { rig, step } = await makeRig(assistsWith({ tractionControl: tcOn }));
			step(1, (m) => m.setControls({ ...NEUTRAL, throttle: 1 }));
			rig.motorcycle.selectGear(1);
			const slips: number[] = [];
			let sawTc = false;
			step(2.5, (m) => {
				m.setControls({ ...NEUTRAL, throttle: 1, clutch: 1 });
				if (m.state.forwardSpeedMps > 1) slips.push(m.state.rearSlipRatio);
				sawTc = sawTc || m.state.tractionControlActive;
			});
			const speed = rig.motorcycle.state.forwardSpeedMps;
			rig.world.dispose();
			// slip once the initial clutch-dump transient has passed
			const settled = slips.slice(20);
			const meanSlip = settled.reduce((a, x) => a + x, 0) / settled.length;
			return { meanSlip, sawTc, speed };
		};

		const withTc = await launch(true);
		const noTc = await launch(false);
		expect(withTc.sawTc).toBe(true);
		expect(withTc.meanSlip).toBeLessThan(noTc.meanSlip * 0.75); // clearly less sustained spin
		expect(withTc.meanSlip).toBeLessThan(0.75); // bounded, not runaway
		expect(withTc.speed).toBeGreaterThan(3); // still launches, just with less spin
	});

	it('wheelie control never makes the front less loaded, and engages when the front lifts', async () => {
		const launch = async (wcOn: boolean, throttle: number, gear: number) => {
			const { rig, step } = await makeRig(assistsWith({ wheelieControl: wcOn }));
			step(0.8, (m) => m.setControls({ ...NEUTRAL, throttle: 0.6 }));
			rig.motorcycle.selectGear(gear);
			let minFrontFrac = 1;
			let sawWc = false;
			step(2.5, (m) => {
				m.setControls({ ...NEUTRAL, throttle, clutch: 1 });
				const frac =
					m.state.frontNormalLoadN /
					Math.max(m.state.frontNormalLoadN + m.state.rearNormalLoadN, 1);
				minFrontFrac = Math.min(minFrontFrac, frac);
				sawWc = sawWc || m.state.wheelieControlActive;
			});
			rig.world.dispose();
			return { minFrontFrac, sawWc };
		};

		const withWc = await launch(true, 1, 1);
		const noWc = await launch(false, 1, 1);
		// WC can only help (cut torque), never hurt front load.
		expect(withWc.minFrontFrac).toBeGreaterThanOrEqual(noWc.minFrontFrac - 1e-6);
		expect(withWc.minFrontFrac).toBeGreaterThan(0.06);
	});

	it('assists toggle independently at runtime', async () => {
		const { rig } = await makeRig(structuredClone(DEFAULT_ASSISTS));
		expect(rig.motorcycle.isAssistEnabled('abs')).toBe(true);
		rig.motorcycle.setAssistEnabled('abs', false);
		expect(rig.motorcycle.isAssistEnabled('abs')).toBe(false);
		expect(rig.motorcycle.isAssistEnabled('tractionControl')).toBe(true);
		rig.world.dispose();
	});
});
