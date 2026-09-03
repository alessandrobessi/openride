import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTerrainChunk, type TerrainIndex } from '$lib/world/terrain/TerrainChunk';
import { assertRoadPackage } from '$lib/world/roads/RoadPackage';
import { RapierWorld } from '$lib/simulation/physics/RapierWorld';

const tdir = resolve('static/worlds/stelvio/terrain');
const index = JSON.parse(readFileSync(resolve(tdir, 'index.json'), 'utf8')) as TerrainIndex;
const road: unknown = JSON.parse(
	readFileSync(resolve('static/worlds/stelvio/roads/ss38.json'), 'utf8')
);
assertRoadPackage(road);

const readChunk = (file: string) => {
	const b = readFileSync(resolve(tdir, file));
	return parseTerrainChunk(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};

/** Bilinear height from a chunk's row-major grid at a local (x, z). */
function sampleChunk(
	meta: (typeof index.chunks)[number],
	heights: Float32Array,
	x: number,
	z: number
): number {
	const g = index.gridSize;
	const step = meta.sizeM / (g - 1);
	const fx = (x - meta.originX) / step;
	const fz = (z - meta.originZ) / step;
	const x0 = Math.max(0, Math.min(g - 2, Math.floor(fx)));
	const z0 = Math.max(0, Math.min(g - 2, Math.floor(fz)));
	const tx = fx - x0;
	const tz = fz - z0;
	const at = (c: number, r: number) => heights[r * g + c];
	const top = at(x0, z0) * (1 - tx) + at(x0 + 1, z0) * tx;
	const bot = at(x0, z0 + 1) * (1 - tx) + at(x0 + 1, z0 + 1) * tx;
	return top * (1 - tz) + bot * tz;
}

function chunkFor(x: number, z: number) {
	return index.chunks.find(
		(c) => x >= c.originX && x < c.originX + c.sizeM && z >= c.originZ && z < c.originZ + c.sizeM
	);
}

describe('M17 Stelvio terrain colliders (headless)', () => {
	it('the heightfield collider height matches the source grid at sampled points', async () => {
		const meta = chunkFor(road.centerline[10].x, road.centerline[10].z)!;
		const { heights } = readChunk(meta.file);

		const world = await RapierWorld.create();
		world.addHeightfieldChunk(
			index.gridSize,
			heights,
			meta.sizeM,
			meta.originX + meta.sizeM / 2,
			meta.originZ + meta.sizeM / 2
		);
		// Rapier populates its ray-query acceleration structure on the first step;
		// a static-only world still needs one tick before raycasts resolve.
		world.step(1 / 120);

		for (const [dx, dz] of [
			[0.3, 0.3],
			[0.5, 0.5],
			[0.7, 0.25],
			[0.25, 0.75]
		]) {
			const x = meta.originX + dx * meta.sizeM;
			const z = meta.originZ + dz * meta.sizeM;
			const expected = sampleChunk(meta, heights, x, z);
			const hit = world.raycast({ x, y: expected + 200, z }, { x: 0, y: -1, z: 0 }, 500);
			expect(hit, `ray at ${x.toFixed(0)},${z.toFixed(0)} missed`).not.toBeNull();
			const hitY = expected + 200 - hit!.distanceM;
			expect(Math.abs(hitY - expected)).toBeLessThan(1.5);
		}
		world.dispose();
	});

	it('the road ribbon sits at or above the terrain (no burying, no big gap)', () => {
		let above = 0;
		let maxGapAbove = 0;
		let maxDip = 0;
		for (const p of road.centerline) {
			const meta = chunkFor(p.x, p.z);
			if (!meta) continue;
			const { heights } = readChunk(meta.file);
			const terrainY = sampleChunk(meta, heights, p.x, p.z);
			const clearance = (p.y ?? 0) - terrainY;
			if (clearance >= -0.2) above++;
			maxGapAbove = Math.max(maxGapAbove, clearance);
			maxDip = Math.max(maxDip, -clearance);
		}
		// Almost every road point is on top of the terrain...
		expect(above / road.centerline.length).toBeGreaterThan(0.9);
		// ...and it never floats absurdly high above it, nor sinks deep.
		expect(maxGapAbove).toBeLessThan(20);
		expect(maxDip).toBeLessThan(6);
	});
});
