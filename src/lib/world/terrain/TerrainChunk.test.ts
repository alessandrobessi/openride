import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTerrainChunk, type TerrainIndex } from './TerrainChunk';
import { assertRoadPackage } from '../roads/RoadPackage';

const dir = resolve('static/worlds/stelvio/terrain');
const index = JSON.parse(readFileSync(resolve(dir, 'index.json'), 'utf8')) as TerrainIndex;
const road: unknown = JSON.parse(
	readFileSync(resolve('static/worlds/stelvio/roads/ss38.json'), 'utf8')
);
assertRoadPackage(road);

const readAB = (name: string) => {
	const b = readFileSync(resolve(dir, name));
	return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

describe('Stelvio terrain package (M17)', () => {
	it('index describes a grid of chunks covering the road bounds', () => {
		expect(index.chunks.length).toBeGreaterThan(10);
		expect(index.gridSize).toBeGreaterThan(16);
		const xs = road.centerline.map((p) => p.x);
		const zs = road.centerline.map((p) => p.z);
		expect(index.bounds.minX).toBeLessThan(Math.min(...xs));
		expect(index.bounds.maxX).toBeGreaterThan(Math.max(...xs));
		expect(index.bounds.minZ).toBeLessThan(Math.min(...zs));
		expect(index.bounds.maxZ).toBeGreaterThan(Math.max(...zs));
	});

	it('every chunk binary matches its declared grid size and has finite, sane heights', () => {
		for (const meta of index.chunks) {
			const chunk = parseTerrainChunk(readAB(meta.file));
			expect(chunk.gridSize).toBe(index.gridSize);
			expect(chunk.heights.length).toBe(index.gridSize * index.gridSize);
			expect([...chunk.heights].every((h) => Number.isFinite(h))).toBe(true);
			expect(Math.min(...chunk.heights)).toBeCloseTo(meta.minY, 0);
			expect(Math.max(...chunk.heights)).toBeCloseTo(meta.maxY, 0);
			// Stelvio region altitude band (local y = elevation − origin altitude,
			// origin ≈ 1604 m, terrain up to ~2900 m).
			expect(meta.minY).toBeGreaterThan(-100);
			expect(meta.maxY).toBeLessThan(1400);
		}
	});

	it('chunks tile the bounds with no gaps (contiguous origins)', () => {
		const size = index.chunkSizeM;
		const originsX = new Set(index.chunks.map((c) => c.originX));
		const originsZ = new Set(index.chunks.map((c) => c.originZ));
		for (const c of index.chunks) {
			if (c.originX + size < index.bounds.maxX) expect(originsX.has(c.originX + size)).toBe(true);
			if (c.originZ + size < index.bounds.maxZ) expect(originsZ.has(c.originZ + size)).toBe(true);
		}
	});
});
