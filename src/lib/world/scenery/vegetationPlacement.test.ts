import { describe, expect, it } from 'vitest';
import { placeVegetation, type VegetationSamplers } from './vegetationPlacement';

const bounds = { minX: -200, minZ: -200, maxX: 200, maxZ: 200 };

/** Terrain that rises 1 m per 10 m of +z; a straight road along x = 0. */
const samplers: VegetationSamplers = {
	heightAt: (_x, z) => z * 0.1 + 100,
	roadDistAt: (x) => Math.abs(x)
};

const opts = { treelineLocalY: 130, seed: 7 };

describe('placeVegetation', () => {
	it('is deterministic for a given seed', () => {
		const a = placeVegetation(bounds, samplers, opts);
		const b = placeVegetation(bounds, samplers, opts);
		expect(b).toEqual(a);
		expect(a.length).toBeGreaterThan(50);
	});

	it('never places trees above the treeline', () => {
		const trees = placeVegetation(bounds, samplers, opts);
		for (const t of trees) expect(t.y).toBeLessThan(opts.treelineLocalY);
	});

	it('keeps clear of the road corridor', () => {
		const trees = placeVegetation(bounds, samplers, { ...opts, roadClearM: 12 });
		for (const t of trees) expect(Math.abs(t.x)).toBeGreaterThanOrEqual(12);
	});

	it('thins out with altitude', () => {
		const trees = placeVegetation(bounds, samplers, opts);
		const low = trees.filter((t) => t.y < 110).length;
		const high = trees.filter((t) => t.y > 125 && t.y < opts.treelineLocalY).length;
		expect(low).toBeGreaterThan(high);
	});

	it('sits every tree on the terrain surface', () => {
		const trees = placeVegetation(bounds, samplers, opts);
		for (const t of trees) {
			expect(t.y).toBeCloseTo(samplers.heightAt(t.x, t.z), 6);
			expect(Number.isFinite(t.scale)).toBe(true);
			expect(t.scale).toBeGreaterThan(0);
		}
	});

	it('rejects steep ground', () => {
		const cliff: VegetationSamplers = {
			heightAt: (_x, z) => z * 3, // slope 3 ≫ maxSlope
			roadDistAt: () => 999
		};
		expect(placeVegetation(bounds, cliff, { treelineLocalY: 10000, seed: 1 })).toHaveLength(0);
	});
});
