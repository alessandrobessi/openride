/**
 * A square terrain chunk: a DEM-sampled height grid in the world's local ENU
 * frame (milestone M17). Rendered as a displaced grid mesh and collided as a
 * Rapier heightfield.
 *
 * Binary layout — little-endian, tightly packed:
 *
 *   [u32 gridSize]                          // vertices per side (cells + 1)
 *   [f32 heights * gridSize * gridSize]     // row-major, row index = +z, col index = +x
 *
 * The chunk's south-west corner and its metre size come from the index.
 */
export interface TerrainChunkMeta {
	id: string;
	/** South-west (min x, min z) corner in local metres. */
	originX: number;
	originZ: number;
	/** Chunk edge length in metres. */
	sizeM: number;
	/** Vertices per side (`cells + 1`). */
	gridSize: number;
	file: string;
	/** Height range in the chunk, metres (local y). */
	minY: number;
	maxY: number;
}

export interface TerrainIndex {
	worldId: string;
	chunkSizeM: number;
	gridSize: number;
	/** Terrain is lowered by this much so the road ribbon always sits proud of it. */
	dropM: number;
	bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
	chunks: TerrainChunkMeta[];
}

export interface TerrainChunkHeights {
	gridSize: number;
	/** row-major heights, length gridSize². */
	heights: Float32Array;
}

export function parseTerrainChunk(buf: ArrayBuffer): TerrainChunkHeights {
	const gridSize = new Uint32Array(buf, 0, 1)[0];
	const heights = new Float32Array(buf, 4, gridSize * gridSize);
	return { gridSize, heights };
}
