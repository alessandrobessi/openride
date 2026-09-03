import { parseTerrainChunk, type TerrainChunkHeights, type TerrainIndex } from './TerrainChunk';

export interface LoadedTerrain {
	index: TerrainIndex;
	chunks: Map<string, TerrainChunkHeights>;
}

/**
 * Fetch the whole terrain package (index + every chunk binary). The Stelvio
 * prototype region is small enough to preload; streaming is M19.
 */
export async function fetchTerrain(baseUrl: string): Promise<LoadedTerrain> {
	const dir = baseUrl.replace(/\/$/, '');
	const indexRes = await fetch(`${dir}/index.json`);
	if (!indexRes.ok) throw new Error(`terrain index: HTTP ${indexRes.status}`);
	const index = (await indexRes.json()) as TerrainIndex;

	const entries = await Promise.all(
		index.chunks.map(async (meta) => {
			const buf = await fetch(`${dir}/${meta.file}`).then((r) => r.arrayBuffer());
			return [meta.id, parseTerrainChunk(buf)] as const;
		})
	);
	return { index, chunks: new Map(entries) };
}
