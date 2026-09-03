import { describe, expect, it } from 'vitest';
import { createMotorcycleRig } from '$lib/simulation/physics/createMotorcycleRig';
import { SimulationLoop } from '$lib/simulation/core/SimulationLoop';
import { ADVENTURE_1200 } from '$lib/simulation/motorcycle/configs/adventure-1200';
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

async function makeRig(gradeFraction = 0) {
	const rig = await createMotorcycleRig(ADVENTURE_1200);
	rig.motorcycle.setEnvironment({ gradeFraction, surface: DRY_ASPHALT });
	const loop = new SimulationLoop({ fixedDtS: 1 / 120 });
	const step = (seconds: number, drive: (m: Motorcycle, tSinceCall: number) => void) => {
		let t = 0;
		for (; t < seconds; t += RENDER_FRAME_S) {
			const tNow = t;
			loop.advance(RENDER_FRAME_S, (dt) => {
				drive(rig.motorcycle, tNow);
				rig.motorcycle.update(dt);
				rig.world.step(dt);
			});
		}
	};
	// settle the suspension in neutral
	step(1.2, (m) => m.setControls(NEUTRAL));

	/** Realistic getaway: blip the revs in neutral, select 1st, feather the clutch in. */
	const launch = () => {
		step(0.8, (m) => m.setControls({ ...NEUTRAL, throttle: 0.6 }));
		rig.motorcycle.selectGear(1);
		step(1.4, (m, t) => m.setControls({ ...NEUTRAL, throttle: 0.7, clutch: Math.min(1, t / 1.1) }));
	};

	return { rig, step, launch };
}

describe('M6 clutch + gearbox (headless)', () => {
	it('neutral is a free rev: throttle spins the engine, the bike does not move', async () => {
		const { rig, step } = await makeRig();
		step(2, (m) => m.setControls({ ...NEUTRAL, throttle: 1 }));
		expect(rig.motorcycle.state.engineRPM).toBeGreaterThan(7000);
		expect(Math.abs(rig.motorcycle.state.forwardSpeedMps)).toBeLessThan(0.2);
		rig.world.dispose();
	});

	it('a clutch launch pulls away from rest without stalling', async () => {
		const { rig, step } = await makeRig();
		rig.motorcycle.selectGear(1);
		// Feather: throttle up, clutch 0 → 1 over ~1.5 s.
		step(3, (m, t) => {
			m.setControls({ ...NEUTRAL, throttle: 0.55, clutch: Math.min(1, t / 1.5) });
		});
		expect(rig.motorcycle.state.engineStalled).toBe(false);
		expect(rig.motorcycle.state.forwardSpeedMps).toBeGreaterThan(4);
		expect(rig.motorcycle.state.engineRPM).toBeGreaterThan(
			ADVENTURE_1200.powertrain.engine.idleRPM
		);
		rig.world.dispose();
	});

	it('shifting up through the gearbox keeps accelerating past 100 km/h', async () => {
		const { rig, step, launch } = await makeRig();
		launch();
		// Full throttle, upshift whenever revs get high.
		step(16, (m) => {
			if (m.state.engineRPM > 7200 && m.state.gear < 6) m.shiftUp();
			m.setControls({ ...NEUTRAL, throttle: 1, clutch: 1 });
		});
		expect(rig.motorcycle.state.gear).toBeGreaterThanOrEqual(3);
		expect(rig.motorcycle.state.forwardSpeedMps * 3.6).toBeGreaterThan(100);
		rig.world.dispose();
	});

	it('engine braking through the driveline decelerates more than a neutral coast-down', async () => {
		// In gear, throttle closed.
		const inGear = await makeRig();
		inGear.rig.world.setLinearVelocity(inGear.rig.chassisHandle, { x: 0, y: 0, z: 30 });
		inGear.rig.motorcycle.selectGear(3);
		inGear.step(1.5, (m) => m.setControls({ ...NEUTRAL, throttle: 0, clutch: 1 }));
		const inGearV = inGear.rig.motorcycle.state.forwardSpeedMps;
		inGear.rig.world.dispose();

		const neutral = await makeRig();
		neutral.rig.world.setLinearVelocity(neutral.rig.chassisHandle, { x: 0, y: 0, z: 30 });
		neutral.rig.motorcycle.selectGear(0);
		neutral.step(1.5, (m) => m.setControls(NEUTRAL));
		const neutralV = neutral.rig.motorcycle.state.forwardSpeedMps;
		neutral.rig.world.dispose();

		expect(inGearV).toBeLessThan(neutralV - 1);
	});

	it('first gear delivers a strong tractive force under power', async () => {
		const { rig, step, launch } = await makeRig();
		launch();
		let sampled = 0;
		step(3, (m) => {
			m.setControls({ ...NEUTRAL, throttle: 1, clutch: 1 });
			if (m.state.gear === 1 && m.state.engineRPM > 4500 && m.state.engineRPM < 7200) {
				sampled = Math.max(sampled, m.state.driveForceN);
			}
		});
		// The massless ideal (§8) is ≈ 125·11.357·0.94/0.315 ≈ 4235 N. Ours is
		// well below that during hard acceleration because engine rotational
		// inertia reflected through the 11.36:1 first-gear reduction absorbs a
		// large share of the crank torque — real, and not yet grip-limited (M10).
		expect(sampled).toBeGreaterThan(1800);
		expect(sampled).toBeLessThan(4235);
		rig.world.dispose();
	});
});
