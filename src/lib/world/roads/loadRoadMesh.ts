import {
	parseCollisionMesh,
	parseSurfaceMesh,
	type CollisionMesh,
	type RoadMeshIndex,
	type SurfaceMesh
} from './RoadMesh';

export interface LoadedRoadMesh {
	index: RoadMeshIndex;
	surface: SurfaceMesh;
	collision: CollisionMesh;
}

/**
 * Fetch a road mesh package: the JSON index and its two binaries. `baseUrl` is
 * the directory the files live in (already run through the base-path helper).
 */
export async function fetchRoadMesh(baseUrl: string): Promise<LoadedRoadMesh> {
	const dir = baseUrl.replace(/\/$/, '');
	const indexRes = await fetch(`${dir}/ss38.mesh.json`);
	if (!indexRes.ok) throw new Error(`road mesh index: HTTP ${indexRes.status}`);
	const index = (await indexRes.json()) as RoadMeshIndex;

	const [surfBuf, collBuf] = await Promise.all([
		fetch(`${dir}/${index.surface.file}`).then((r) => r.arrayBuffer()),
		fetch(`${dir}/${index.collision.file}`).then((r) => r.arrayBuffer())
	]);

	return {
		index,
		surface: parseSurfaceMesh(surfBuf),
		collision: parseCollisionMesh(collBuf)
	};
}
