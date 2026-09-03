/**
 * Road mesh package: a rideable asphalt ribbon generated offline from the road
 * centreline (milestone M16). Visual and collision geometry are kept separate
 * (AGENTS.md §18); the semantic centreline stays in the road package.
 *
 * Binary layout — little-endian, tightly packed:
 *
 *   surface .bin   [u32 vertexCount][u32 indexCount]
 *                  [f32 position xyz * vertexCount]
 *                  [f32 normal xyz  * vertexCount]
 *                  [f32 uv     uv   * vertexCount]
 *                  [u32 index       * indexCount]
 *
 *   collision .bin [u32 vertexCount][u32 indexCount]
 *                  [f32 position xyz * vertexCount]
 *                  [u32 index       * indexCount]
 */
export interface RoadMeshIndex {
	roadId: string;
	widthM: number;
	surface: { file: string; vertexCount: number; indexCount: number };
	collision: { file: string; vertexCount: number; indexCount: number };
	/** Local ENU position + heading (radians, atan2(dx, dz)) at the start of the ribbon. */
	spawn: { x: number; y: number; z: number; headingRad: number };
}

export interface SurfaceMesh {
	positions: Float32Array;
	normals: Float32Array;
	uvs: Float32Array;
	indices: Uint32Array;
}

export interface CollisionMesh {
	positions: Float32Array;
	indices: Uint32Array;
}

export function parseSurfaceMesh(buf: ArrayBuffer): SurfaceMesh {
	const head = new Uint32Array(buf, 0, 2);
	const vCount = head[0];
	const iCount = head[1];
	let o = 8;
	const positions = new Float32Array(buf, o, vCount * 3);
	o += vCount * 3 * 4;
	const normals = new Float32Array(buf, o, vCount * 3);
	o += vCount * 3 * 4;
	const uvs = new Float32Array(buf, o, vCount * 2);
	o += vCount * 2 * 4;
	const indices = new Uint32Array(buf, o, iCount);
	return { positions, normals, uvs, indices };
}

export function parseCollisionMesh(buf: ArrayBuffer): CollisionMesh {
	const head = new Uint32Array(buf, 0, 2);
	const vCount = head[0];
	const iCount = head[1];
	const positions = new Float32Array(buf, 8, vCount * 3);
	const indices = new Uint32Array(buf, 8 + vCount * 3 * 4, iCount);
	return { positions, indices };
}
