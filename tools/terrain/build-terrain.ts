/**
 * Generate DEM-based terrain chunks around the Stelvio road
 * (OPENRIDE-BLUEPRINT.md §9, milestone M17).
 *
 * Covers the road's local bounding box plus a margin with square chunks; each
 * chunk is a height grid sampled from the DEM (tools/data/dem/) in the world's
 * local frame. Near the road centerline the grid is carved down to a road bench
 * so the ribbon is never buried in a hairpin cut and never floats over fill.
 * Emits one binary per chunk (layout: TerrainChunk.ts) plus a JSON index.
 *
 *   pnpm world:terrain
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LocalFrame } from '../../src/lib/world/geo/enu';
import { DemSampler } from '../elevation/dem-sampler';

const ROADS_DIR = resolve(import.meta.dirname, '../../static/worlds/stelvio/roads');
const TERRAIN_DIR = resolve(import.meta.dirname, '../../static/worlds/stelvio/terrain');
const DEM_DIR = resolve(import.meta.dirname, '../data/dem');

const CHUNK_M = 512;
const GRID = 65; // vertices per side → 64 cells, 8 m spacing
const MARGIN_M = 400;
/** Sit the terrain this far below the road bench so the ribbon is never buried. */
const DROP_M = 1.0;
/** Within this distance of the centerline the terrain is the flat road bench. */
const CARVE_INNER_M = 10;
/** Beyond this the terrain is the untouched DEM; between, it blends. */
const CARVE_OUTER_M = 50;

interface Road {
	origin: { latDeg: number; lonDeg: number; altM: number };
	centerline: Array<{ x: number; z: number; y?: number }>;
}

/** Nearest distance from (x, z) to the centerline polyline plus the road y there. */
function nearestRoad(
	x: number,
	z: number,
	cl: Array<{ x: number; z: number; y?: number }>
): { dist: number; roadY: number } {
	let best = Infinity;
	let bestY = 0;
	for (let i = 0; i < cl.length - 1; i++) {
		const a = cl[i];
		const b = cl[i + 1];
		// Cheap AABB reject (expanded by the carve radius).
		if (
			x < Math.min(a.x, b.x) - CARVE_OUTER_M ||
			x > Math.max(a.x, b.x) + CARVE_OUTER_M ||
			z < Math.min(a.z, b.z) - CARVE_OUTER_M ||
			z > Math.max(a.z, b.z) + CARVE_OUTER_M
		) {
			continue;
		}
		const dx = b.x - a.x;
		const dz = b.z - a.z;
		const len2 = dx * dx + dz * dz || 1e-9;
		let t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
		t = t < 0 ? 0 : t > 1 ? 1 : t;
		const px = a.x + t * dx;
		const pz = a.z + t * dz;
		const d = Math.hypot(x - px, z - pz);
		if (d < best) {
			best = d;
			bestY = (a.y ?? 0) + t * ((b.y ?? 0) - (a.y ?? 0));
		}
	}
	return { dist: best, roadY: bestY };
}

function smoothstep(edge0: number, edge1: number, v: number): number {
	const t = Math.min(1, Math.max(0, (v - edge0) / (edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

async function main(): Promise<void> {
	const road = JSON.parse(readFileSync(resolve(ROADS_DIR, 'ss38.json'), 'utf8')) as Road;
	const frame = new LocalFrame(road.origin);
	const dem = await DemSampler.load(DEM_DIR);
	const cl = road.centerline;

	const xs = cl.map((p) => p.x);
	const zs = cl.map((p) => p.z);
	const minX = Math.floor((Math.min(...xs) - MARGIN_M) / CHUNK_M) * CHUNK_M;
	const minZ = Math.floor((Math.min(...zs) - MARGIN_M) / CHUNK_M) * CHUNK_M;
	const maxX = Math.ceil((Math.max(...xs) + MARGIN_M) / CHUNK_M) * CHUNK_M;
	const maxZ = Math.ceil((Math.max(...zs) + MARGIN_M) / CHUNK_M) * CHUNK_M;

	mkdirSync(TERRAIN_DIR, { recursive: true });
	const chunks = [];
	const step = CHUNK_M / (GRID - 1);

	for (let cz = minZ; cz < maxZ; cz += CHUNK_M) {
		for (let cx = minX; cx < maxX; cx += CHUNK_M) {
			const heights = new Float32Array(GRID * GRID);
			let cMin = Infinity;
			let cMax = -Infinity;
			for (let r = 0; r < GRID; r++) {
				for (let c = 0; c < GRID; c++) {
					const localX = cx + c * step;
					const localZ = cz + r * step;
					const g = frame.toGeo({ x: localX, y: 0, z: localZ });
					const elev = dem.elevationAt(g.lonDeg, g.latDeg);
					if (!Number.isFinite(elev)) throw new Error(`chunk ${cx},${cz} outside DEM`);
					const demY = frame.toLocal({ latDeg: g.latDeg, lonDeg: g.lonDeg, altM: elev }).y - DROP_M;

					// Carve toward the road bench near the centerline. Inside the inner
					// radius the terrain *is* the bench (road y − DROP_M); outward it
					// blends back to the DEM without ever dropping below it.
					const { dist, roadY } = nearestRoad(localX, localZ, cl);
					let y = demY;
					if (dist < CARVE_OUTER_M) {
						const bench = roadY - DROP_M;
						const w = 1 - smoothstep(CARVE_INNER_M, CARVE_OUTER_M, dist);
						y = bench * w + demY * (1 - w);
						if (dist >= CARVE_INNER_M && y < demY) y = demY; // never below natural in the skirt
					}

					heights[r * GRID + c] = y;
					cMin = Math.min(cMin, y);
					cMax = Math.max(cMax, y);
				}
			}

			const id = `x${cx}_z${cz}`;
			const buf = Buffer.alloc(4 + heights.length * 4);
			buf.writeUInt32LE(GRID, 0);
			for (let i = 0; i < heights.length; i++) buf.writeFloatLE(heights[i], 4 + i * 4);
			writeFileSync(resolve(TERRAIN_DIR, `${id}.bin`), buf);

			chunks.push({
				id,
				originX: cx,
				originZ: cz,
				sizeM: CHUNK_M,
				gridSize: GRID,
				file: `${id}.bin`,
				minY: Math.round(cMin * 100) / 100,
				maxY: Math.round(cMax * 100) / 100
			});
		}
	}

	const index = {
		worldId: 'stelvio',
		chunkSizeM: CHUNK_M,
		gridSize: GRID,
		dropM: DROP_M,
		carveInnerM: CARVE_INNER_M,
		carveOuterM: CARVE_OUTER_M,
		bounds: { minX, minZ, maxX, maxZ },
		chunks
	};
	writeFileSync(resolve(TERRAIN_DIR, 'index.json'), JSON.stringify(index, null, '\t') + '\n');

	process.stdout.write(
		`Terrain: ${chunks.length} chunks of ${CHUNK_M} m (${GRID}×${GRID}, ${step.toFixed(1)} m grid), ` +
			`area ${((maxX - minX) / 1000).toFixed(1)}×${((maxZ - minZ) / 1000).toFixed(1)} km\n` +
			`Carved to the road bench within ${CARVE_INNER_M}–${CARVE_OUTER_M} m of the centerline.\n` +
			`Wrote ${TERRAIN_DIR}/*.bin, index.json\n`
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
