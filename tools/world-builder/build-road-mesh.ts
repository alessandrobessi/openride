/**
 * Generate a rideable road-surface ribbon from the elevated SS38 centreline
 * (OPENRIDE-BLUEPRINT.md §9, milestone M16).
 *
 * Emits a visual surface mesh (positions / normals / UVs) and a separate,
 * slightly wider collision mesh (positions only) as tightly-packed binaries,
 * plus a JSON index. Layout: src/lib/world/roads/RoadMesh.ts.
 *
 *   pnpm world:mesh
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface Pt {
	x: number;
	y: number;
	z: number;
}
interface Road {
	tags: { widthM?: number; lanes?: number; highway?: string };
	centerline: Array<{ x: number; z: number; y?: number }>;
}

const ROADS_DIR = resolve(import.meta.dirname, '../../static/worlds/stelvio/roads');
const ROAD_PATH = resolve(ROADS_DIR, 'ss38.json');

/** Conservative carriageway width when OSM doesn't say (AGENTS.md §18, BLUEPRINT §9). */
function roadWidthM(road: Road): number {
	if (road.tags.widthM && road.tags.widthM > 2) return clamp(road.tags.widthM, 4, 9);
	if (road.tags.lanes && road.tags.lanes > 0) return clamp(road.tags.lanes * 3, 4, 9);
	return 6; // a narrow two-lane alpine pass road
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function normalize(x: number, z: number): [number, number] {
	const l = Math.hypot(x, z) || 1;
	return [x / l, z / l];
}

interface Ribbon {
	positions: number[]; // xyz per vertex, left then right per station
	normals: number[];
	uvs: number[];
	indices: number[];
}

/** Build a triangle-strip ribbon of half-width `hw` along the centreline. */
function buildRibbon(cl: Pt[], hw: number, withAttribs: boolean): Ribbon {
	const r: Ribbon = { positions: [], normals: [], uvs: [], indices: [] };
	let dist = 0;
	for (let i = 0; i < cl.length; i++) {
		const prev = cl[Math.max(0, i - 1)];
		const next = cl[Math.min(cl.length - 1, i + 1)];
		const [tx, tz] = normalize(next.x - prev.x, next.z - prev.z);
		// horizontal left normal = rotate tangent +90° about up
		const nx = -tz;
		const nz = tx;
		const p = cl[i];
		r.positions.push(p.x + nx * hw, p.y, p.z + nz * hw); // left
		r.positions.push(p.x - nx * hw, p.y, p.z - nz * hw); // right
		if (i > 0) dist += Math.hypot(p.x - cl[i - 1].x, p.z - cl[i - 1].z);
		if (withAttribs) {
			r.normals.push(0, 1, 0, 0, 1, 0);
			r.uvs.push(0, dist / (hw * 2), 1, dist / (hw * 2));
		}
		if (i > 0) {
			// Wind CCW seen from above (+y) so the surface faces up — otherwise
			// THREE's default FrontSide culls the whole road and you see straight
			// through to the terrain. (Rapier's trimesh collider is winding-agnostic.)
			const a = (i - 1) * 2;
			r.indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
		}
	}
	return r;
}

function packSurface(r: Ribbon): Buffer {
	const v = r.positions.length / 3;
	const buf = Buffer.alloc(8 + v * (3 + 3 + 2) * 4 + r.indices.length * 4);
	let o = 0;
	buf.writeUInt32LE(v, 0);
	buf.writeUInt32LE(r.indices.length, 4);
	o = 8;
	for (const f of r.positions) {
		buf.writeFloatLE(f, o);
		o += 4;
	}
	for (const f of r.normals) {
		buf.writeFloatLE(f, o);
		o += 4;
	}
	for (const f of r.uvs) {
		buf.writeFloatLE(f, o);
		o += 4;
	}
	for (const i of r.indices) {
		buf.writeUInt32LE(i, o);
		o += 4;
	}
	return buf;
}

function packCollision(r: Ribbon): Buffer {
	const v = r.positions.length / 3;
	const buf = Buffer.alloc(8 + v * 3 * 4 + r.indices.length * 4);
	buf.writeUInt32LE(v, 0);
	buf.writeUInt32LE(r.indices.length, 4);
	let o = 8;
	for (const f of r.positions) {
		buf.writeFloatLE(f, o);
		o += 4;
	}
	for (const i of r.indices) {
		buf.writeUInt32LE(i, o);
		o += 4;
	}
	return buf;
}

function main(): void {
	const road = JSON.parse(readFileSync(ROAD_PATH, 'utf8')) as Road;
	const cl: Pt[] = road.centerline.map((p) => ({ x: p.x, y: p.y ?? 0, z: p.z }));
	if (cl.length < 2)
		throw new Error('centreline has no elevated points — run pnpm world:elevation');

	const widthM = roadWidthM(road);
	const surface = buildRibbon(cl, widthM / 2, true);
	const collision = buildRibbon(cl, widthM / 2 + 3.5, false); // a flush drivable shoulder past the paint (physics only)

	// Spawn a couple of metres in from the ribbon start so both wheels are on it.
	let spawnIdx = 0;
	let arc = 0;
	while (spawnIdx < cl.length - 2 && arc < 2.5) {
		arc += Math.hypot(cl[spawnIdx + 1].x - cl[spawnIdx].x, cl[spawnIdx + 1].z - cl[spawnIdx].z);
		spawnIdx++;
	}
	const sp = cl[spawnIdx];
	const [dx0, dz0] = normalize(cl[spawnIdx + 1].x - sp.x, cl[spawnIdx + 1].z - sp.z);
	const index = {
		roadId: 'stelvio-ss38',
		widthM: Math.round(widthM * 100) / 100,
		surface: {
			file: 'ss38.surface.bin',
			vertexCount: surface.positions.length / 3,
			indexCount: surface.indices.length
		},
		collision: {
			file: 'ss38.collision.bin',
			vertexCount: collision.positions.length / 3,
			indexCount: collision.indices.length
		},
		spawn: {
			// CG at road surface + ride height (≈ cgHeight); the bike settles onto
			// its suspension from here.
			x: Math.round(sp.x * 1000) / 1000,
			y: Math.round((sp.y + 0.75) * 1000) / 1000,
			z: Math.round(sp.z * 1000) / 1000,
			headingRad: Math.round(Math.atan2(dx0, dz0) * 1e5) / 1e5
		}
	};

	mkdirSync(ROADS_DIR, { recursive: true });
	writeFileSync(resolve(ROADS_DIR, 'ss38.surface.bin'), packSurface(surface));
	writeFileSync(resolve(ROADS_DIR, 'ss38.collision.bin'), packCollision(collision));
	writeFileSync(resolve(ROADS_DIR, 'ss38.mesh.json'), JSON.stringify(index, null, '\t') + '\n');

	process.stdout.write(
		`Road mesh: width ${index.widthM} m, ` +
			`surface ${index.surface.vertexCount} verts / ${index.surface.indexCount / 3} tris, ` +
			`collision ${index.collision.indexCount / 3} tris\n` +
			`spawn ${JSON.stringify(index.spawn)}\n` +
			`Wrote ${ROADS_DIR}/ss38.{surface,collision}.bin, ss38.mesh.json\n`
	);
}

main();
