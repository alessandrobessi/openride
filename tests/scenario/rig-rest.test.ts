import { describe, expect, it } from 'vitest';
import { createMotorcycleRig } from '$lib/simulation/physics/createMotorcycleRig';
import { SimulationLoop } from '$lib/simulation/core/SimulationLoop';
import { ADVENTURE_1200 } from '$lib/simulation/motorcycle/configs/adventure-1200';
import { GRAVITY_MPS2 } from '$lib/simulation/physics/RapierWorld';
import { frontAxleFromCgM } from '$lib/simulation/motorcycle/config';

const RENDER_FRAME_S = 1 / 60;

async function settle(durationS: number) {
	const rig = await createMotorcycleRig(ADVENTURE_1200);
	const loop = new SimulationLoop({ fixedDtS: 1 / 120 });
	for (let t = 0; t < durationS; t += RENDER_FRAME_S) {
		loop.advance(RENDER_FRAME_S, (dt) => {
			rig.motorcycle.update(dt);
			rig.world.step(dt);
		});
	}
	const state = rig.motorcycle.state;
	rig.world.dispose();
	return state;
}

describe('M3 rig at rest (headless)', () => {
	it('settles on both wheels without falling over', async () => {
		const s = await settle(4);
		expect(s.frontContactGround).toBe(true);
		expect(s.rearContactGround).toBe(true);
		expect(Math.abs(s.rollRad)).toBeLessThan(0.03);
		expect(Math.abs(s.pitchRad)).toBeLessThan(0.05);
		// Practically stationary once settled.
		expect(Math.hypot(...Object.values(s.linearVelocityWorldMps))).toBeLessThan(0.05);
	});

	it('supports the full weight across the two axles', async () => {
		const s = await settle(4);
		const weightN = ADVENTURE_1200.physical.mass.totalKg * GRAVITY_MPS2;
		const supportedN = s.frontNormalLoadN + s.rearNormalLoadN;
		expect(supportedN).toBeGreaterThan(weightN * 0.94);
		expect(supportedN).toBeLessThan(weightN * 1.06);
	});

	it('splits static axle load per a/L (front-biased, ~54%)', async () => {
		const s = await settle(4);
		const geo = ADVENTURE_1200.physical.geometry;
		const expectedFrontFraction = geo.cgFromRearAxleM / geo.wheelbaseM; // a / L ≈ 0.539
		const frontFraction = s.frontNormalLoadN / (s.frontNormalLoadN + s.rearNormalLoadN);
		expect(frontFraction).toBeCloseTo(expectedFrontFraction, 1); // within 0.05
		expect(frontAxleFromCgM(geo)).toBeCloseTo(0.7, 5);
	});

	it('rests at a plausible suspension sag (a few cm, within travel)', async () => {
		const s = await settle(4);
		const susp = ADVENTURE_1200.chassis.suspension;
		expect(s.frontSuspensionCompressionM).toBeGreaterThan(0.01);
		expect(s.frontSuspensionCompressionM).toBeLessThan(susp.front.travelM);
		expect(s.rearSuspensionCompressionM).toBeGreaterThan(0.005);
		expect(s.rearSuspensionCompressionM).toBeLessThan(susp.rear.travelM);
	});
});
