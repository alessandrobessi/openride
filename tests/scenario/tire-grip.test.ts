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
const G = 9.80665;

async function makeRig() {
	const rig = await createMotorcycleRig(ADVENTURE_1200, { assists: ASSISTS_OFF });
	rig.motorcycle.setEnvironment({ gradeFraction: 0, surface: DRY_ASPHALT });
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
	step(1.2, (m) => m.setControls(NEUTRAL));
	return { rig, step };
}

describe('M10 bounded tyre grip (headless)', () => {
	it('braking deceleration saturates near the friction limit, smoothly (§76)', async () => {
		const { rig, step } = await makeRig();
		rig.world.setLinearVelocity(rig.chassisHandle, { x: 0, y: 0, z: 28 });
		rig.motorcycle.resyncWheelsToGround();
		rig.motorcycle.selectGear(0);

		const decels: number[] = [];
		let prevV = 28;
		// Ramp both brakes 0 → 1 over 3 s and record deceleration.
		step(3, (m, t) => {
			m.setControls({ ...NEUTRAL, frontBrake: Math.min(1, t / 3), rearBrake: Math.min(1, t / 3) });
			const v = m.state.forwardSpeedMps;
			if (v > 2) decels.push((prevV - v) / RENDER_FRAME_S);
			prevV = v;
		});
		const peakDecel = Math.max(...decels);
		rig.world.dispose();

		// Bounded by roughly μ·g on dry asphalt (≈ 11.3 m/s²) and, in M10, well
		// below it because the front tyre only has its *static* load — weight
		// transfer (M11) is what unlocks the 8–10 m/s² doc target.
		expect(peakDecel).toBeLessThan(DRY_ASPHALT.muLongitudinal * G);
		expect(peakDecel).toBeGreaterThan(4.5);
	});

	it('locks the front wheel under maximum front brake', async () => {
		const { rig, step } = await makeRig();
		rig.world.setLinearVelocity(rig.chassisHandle, { x: 0, y: 0, z: 25 });
		rig.motorcycle.resyncWheelsToGround();
		rig.motorcycle.selectGear(0);

		let minWheelOmega = Infinity;
		let minSlip = 0;
		// Sample while the bike is still moving quickly (before it stops).
		step(0.8, (m) => {
			m.setControls({ ...NEUTRAL, frontBrake: 1 });
			if (m.state.forwardSpeedMps > 8) {
				minWheelOmega = Math.min(minWheelOmega, Math.abs(m.state.frontWheelOmegaRadS));
				minSlip = Math.min(minSlip, m.state.frontSlipRatio);
			}
		});
		rig.world.dispose();
		expect(minWheelOmega).toBeLessThan(2); // wheel stopped while the bike rolls on
		expect(minSlip).toBeLessThan(-0.6); // deep braking slip
	});

	it('wheelspin emerges from a hard first-gear clutch dump (§11)', async () => {
		const { rig, step } = await makeRig();
		// Rev up in neutral, drop into 1st with the clutch engaged and pinned throttle.
		step(1.0, (m) => m.setControls({ ...NEUTRAL, throttle: 1 }));
		rig.motorcycle.selectGear(1);
		let peakSlip = 0;
		let peakUtil = 0;
		let peakRpm = 0;
		step(2.0, (m) => {
			m.setControls({ ...NEUTRAL, throttle: 1, clutch: 1 });
			peakSlip = Math.max(peakSlip, m.state.rearSlipRatio);
			peakUtil = Math.max(peakUtil, m.state.rearGripUtilization);
			peakRpm = Math.max(peakRpm, m.state.engineRPM);
		});
		rig.world.dispose();
		expect(peakSlip).toBeGreaterThan(0.2); // rear spinning well past the ground speed
		expect(peakUtil).toBeGreaterThan(1); // demand exceeded available grip
		// Engine output was NOT capped to prevent it (§11) — it revved right up.
		expect(peakRpm).toBeGreaterThan(5000);
	});

	it('braking consumes grip that is then unavailable for cornering (friction ellipse, §30)', async () => {
		const corner = async (frontBrake: number) => {
			const { rig, step } = await makeRig();
			rig.world.setLinearVelocity(rig.chassisHandle, { x: 0, y: 0, z: 18 });
			rig.motorcycle.resyncWheelsToGround();
			rig.motorcycle.selectGear(3);
			step(4, (m) => m.setControls({ ...NEUTRAL, throttle: 0.2, steeringInput: 0.6 }));
			let util = 0;
			let minLateralHeadroom = Infinity;
			step(1.2, (m) => {
				m.setControls({ ...NEUTRAL, throttle: 0, frontBrake, steeringInput: 0.6 });
				util = Math.max(util, m.state.frontGripUtilization);
				// how much of the front budget is still free for cornering
				minLateralHeadroom = Math.min(minLateralHeadroom, 1 - Math.min(1, util));
			});
			rig.world.dispose();
			return { util, minLateralHeadroom };
		};

		const free = await corner(0);
		const braking = await corner(1);
		// Hard front braking drives the front tyre to its grip limit...
		expect(braking.util).toBeGreaterThan(free.util);
		expect(braking.util).toBeGreaterThan(0.95);
		// ...leaving essentially no front-tyre budget for cornering.
		expect(braking.minLateralHeadroom).toBeLessThan(free.minLateralHeadroom);
		expect(braking.minLateralHeadroom).toBeLessThan(0.05);
	});
});
