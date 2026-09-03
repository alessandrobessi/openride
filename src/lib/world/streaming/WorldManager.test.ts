import { describe, expect, it, vi } from 'vitest';
import { WorldManager, type ChunkSink } from './WorldManager';
import type { TerrainChunkMeta, TerrainIndex } from '../terrain/TerrainChunk';

const GRID = 8;
const SIZE = 512;

/** A valid chunk binary: [u32 gridSize][f32 heights * gridSize²], all heights `y`. */
function chunkBinary(y = 0): ArrayBuffer {
	const buf = new ArrayBuffer(4 + GRID * GRID * 4);
	new Uint32Array(buf, 0, 1)[0] = GRID;
	new Float32Array(buf, 4, GRID * GRID).fill(y);
	return buf;
}

/** An `n × n` grid of chunks with their SW corner at the world origin. */
function makeIndex(n: number): TerrainIndex {
	const chunks: TerrainChunkMeta[] = [];
	for (let r = 0; r < n; r++) {
		for (let c = 0; c < n; c++) {
			chunks.push({
				id: `x${c * SIZE}_z${r * SIZE}`,
				originX: c * SIZE,
				originZ: r * SIZE,
				sizeM: SIZE,
				gridSize: GRID,
				file: `x${c * SIZE}_z${r * SIZE}.bin`,
				minY: 0,
				maxY: 0
			});
		}
	}
	return {
		worldId: 'test',
		chunkSizeM: SIZE,
		gridSize: GRID,
		dropM: 0,
		bounds: { minX: 0, minZ: 0, maxX: n * SIZE, maxZ: n * SIZE },
		chunks
	};
}

function recordingSink() {
	const activated: string[] = [];
	const deactivated: string[] = [];
	const sink: ChunkSink = {
		activate: (m) => activated.push(m.id),
		deactivate: (m) => deactivated.push(m.id)
	};
	return { sink, activated, deactivated };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('WorldManager streaming', () => {
	it('activates only chunks within the near radius', async () => {
		const { sink, activated } = recordingSink();
		const fetchChunk = vi.fn(async () => chunkBinary());
		const mgr = new WorldManager(makeIndex(5), sink, {
			fetchChunk,
			nearRadiusM: 300,
			farRadiusM: 600
		});

		mgr.update(500, 500); // near the far corner of chunk (0,0)
		await flush();

		// Within 300 m of that point: chunk (0,0) and the three chunks whose
		// footprint edges sit ~12 m away; chunk (2,0) at 524 m is excluded.
		expect(activated.sort()).toEqual(['x0_z0', 'x0_z512', 'x512_z0', 'x512_z512']);
		expect(fetchChunk).toHaveBeenCalledTimes(4);
	});

	it('loads new chunks and unloads ones left behind as the rider moves', async () => {
		const { sink, activated, deactivated } = recordingSink();
		const mgr = new WorldManager(makeIndex(6), sink, {
			fetchChunk: async () => chunkBinary(),
			nearRadiusM: 200,
			farRadiusM: 500
		});

		mgr.update(256, 256); // centre of chunk (0,0)
		await flush();
		expect(mgr.statsAt(256, 256).activeChunks).toBe(1);
		expect(activated).toEqual(['x0_z0']);

		mgr.update(256 + 4 * SIZE, 256); // jump four chunks east
		await flush();

		expect(activated).toContain('x2048_z0');
		expect(deactivated).toEqual(['x0_z0']); // the corner chunk is now far behind
		expect(mgr.statsAt(256 + 4 * SIZE, 256).currentChunkId).toBe('x2048_z0');
	});

	it('keeps hysteresis: a chunk between near and far stays as it was', async () => {
		const { sink, activated, deactivated } = recordingSink();
		const mgr = new WorldManager(makeIndex(4), sink, {
			fetchChunk: async () => chunkBinary(),
			nearRadiusM: 100,
			farRadiusM: 700
		});

		mgr.update(256, 256);
		await flush();
		expect(activated).toEqual(['x0_z0']);

		// 300 m into chunk (1,0): 44 m from chunk (0,0)'s edge — outside near (100),
		// inside far (700), so (0,0) is neither dropped nor re-fetched.
		mgr.update(556, 256);
		await flush();
		expect(deactivated).toEqual([]);
		expect(activated.filter((id) => id === 'x0_z0')).toHaveLength(1);
	});

	it('re-enters a dropped chunk from cache without re-fetching', async () => {
		const { sink } = recordingSink();
		const fetchChunk = vi.fn(async () => chunkBinary());
		const mgr = new WorldManager(makeIndex(6), sink, {
			fetchChunk,
			nearRadiusM: 150,
			farRadiusM: 400
		});

		mgr.update(256, 256);
		await flush();
		mgr.update(256 + 3 * SIZE, 256); // drop (0,0) into cache
		await flush();
		const callsAfterLeaving = fetchChunk.mock.calls.length;

		mgr.update(256, 256); // come back
		await flush();

		expect(fetchChunk.mock.calls.length).toBe(callsAfterLeaving); // served from cache
		expect(mgr.statsAt(256, 256).activeChunks).toBeGreaterThan(0);
	});

	it('bounds the LRU cache to cacheSize', async () => {
		const { sink } = recordingSink();
		const mgr = new WorldManager(makeIndex(8), sink, {
			fetchChunk: async () => chunkBinary(),
			nearRadiusM: 100,
			farRadiusM: 200,
			cacheSize: 3
		});

		// Walk a long way east: each step drops the previous chunk into the cache.
		for (let i = 0; i < 8; i++) {
			mgr.update(256 + i * SIZE, 256);
			await flush();
		}
		expect(mgr.statsAt(256 + 7 * SIZE, 256).cachedChunks).toBeLessThanOrEqual(3);
	});

	it('preloadAll activates every chunk through the normal path', async () => {
		const { sink, activated } = recordingSink();
		const index = makeIndex(4);
		const mgr = new WorldManager(index, sink, { fetchChunk: async () => chunkBinary() });

		await mgr.preloadAll();

		expect(activated.sort()).toEqual(index.chunks.map((c) => c.id).sort());
		expect(mgr.statsAt(0, 0).activeChunks).toBe(16);
	});

	it('dispose deactivates everything and stops further work', async () => {
		const { sink, deactivated } = recordingSink();
		const mgr = new WorldManager(makeIndex(3), sink, { fetchChunk: async () => chunkBinary() });
		await mgr.preloadAll();

		mgr.dispose();
		expect(deactivated.length).toBe(9);

		mgr.update(0, 0);
		await flush();
		expect(mgr.statsAt(0, 0).activeChunks).toBe(0);
	});
});
