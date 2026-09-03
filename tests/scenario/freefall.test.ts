import { describe, expect, it } from 'vitest';
import { RapierWorld, GRAVITY_MPS2, type Transform } from '$lib/simulation/physics/RapierWorld';
import { SimulationLoop } from '$lib/simulation/core/SimulationLoop';

/**
 * Proves the headless scenario harness works: the real Rapier WASM engine loads
 * in Node, is driven by the fixed-step {@link SimulationLoop} exactly as the
 * browser render loop drives it (frame-sized deltas fanned out to fixed steps),
 * and produces physically sane, approximately timestep-independent results
 * (MOTORCYCLE-PHYSICS.md §66, AGENTS.md §25).
 */
const RENDER_FRAME_S = 1 / 60;

async function simulate(opts: {
	fixedDtS: number;
	durationS: number;
	withGround?: boolean;
	dropY: number;
}): Promise<Transform> {
	const world = await RapierWorld.create();
	if (opts.withGround) world.addStaticGround();
	const handle = world.addDynamicBox({
		halfExtentsM: { x: 0.5, y: 0.5, z: 0.5 },
		positionM: { x: 0, y: opts.dropY, z: 0 }
	});

	const loop = new SimulationLoop({ fixedDtS: opts.fixedDtS });
	for (let elapsed = 0; elapsed < opts.durationS; elapsed += RENDER_FRAME_S) {
		loop.advance(RENDER_FRAME_S, (dt) => world.step(dt));
	}

	const transform = world.getTransform(handle);
	world.dispose();
	return transform;
}

describe('freefall scenario (headless Rapier)', () => {
	it('follows ½·g·t² before impact', async () => {
		const t = 1.5;
		const startY = 50;
		const { position } = await simulate({ fixedDtS: 1 / 120, durationS: t, dropY: startY });
		const fallen = startY - position.y;
		const expected = 0.5 * GRAVITY_MPS2 * t * t;
		// Semi-implicit Euler overshoots the closed form by ~one step of velocity;
		// a few percent over the ~11 m fall is expected and acceptable.
		expect(fallen).toBeGreaterThan(expected * 0.95);
		expect(fallen).toBeLessThan(expected * 1.1);
	});

	it('agrees between 60 Hz and 120 Hz within tolerance', async () => {
		const t = 1.2;
		const startY = 50;
		const at60 =
			startY - (await simulate({ fixedDtS: 1 / 60, durationS: t, dropY: startY })).position.y;
		const at120 =
			startY - (await simulate({ fixedDtS: 1 / 120, durationS: t, dropY: startY })).position.y;
		expect(Math.abs(at60 - at120)).toBeLessThan(0.25); // metres, over an ~8.5 m fall
	});

	it('comes to rest on the ground rather than falling through it', async () => {
		const { position } = await simulate({
			fixedDtS: 1 / 120,
			durationS: 4,
			withGround: true,
			dropY: 5
		});
		expect(position.y).toBeGreaterThan(0.35); // half-extent 0.5, allow settle/penetration
		expect(position.y).toBeLessThan(0.65);
	});
});
