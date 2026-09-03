import type { TerrainIndex } from './TerrainChunk';

/**
 * Fetch the terrain index. Chunk binaries are streamed on demand by the
 * {@link import('../streaming/WorldManager').WorldManager} (milestone M19), so
 * there is no eager "load everything" path here.
 */
export async function fetchTerrainIndex(baseUrl: string): Promise<TerrainIndex> {
	const dir = baseUrl.replace(/\/$/, '');
	const res = await fetch(`${dir}/index.json`);
	if (!res.ok) throw new Error(`terrain index: HTTP ${res.status}`);
	return (await res.json()) as TerrainIndex;
}
