/**
 * Bake the Stelvio scenery package (milestones M25–M27) from the road + terrain
 * + DEM outputs. Runs before `world:manifest` in `pnpm world:build`.
 *
 *   pnpm world:scenery
 *
 * M25 — road furniture: guardrail posts + rails and delineator posts.
 * M26 — vegetation: conifers by altitude / slope, off the road, packed to .bin.
 * M27 — buildings: OSM footprints near the road (if `world:fetch-buildings` ran).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LocalFrame } from '../../src/lib/world/geo/enu';
import { DemSampler } from '../elevation/dem-sampler';
import {
	placeFurniture,
	type CenterlinePoint
} from '../../src/lib/world/scenery/furniturePlacement';
import { placeVegetation } from '../../src/lib/world/scenery/vegetationPlacement';
import { extractBuildings, type RawBuilding } from '../../src/lib/world/scenery/buildingExtraction';

const WORLD_DIR = resolve(import.meta.dirname, '../../static/worlds/stelvio');
const ROADS_DIR = resolve(WORLD_DIR, 'roads');
const SCENERY_DIR = resolve(WORLD_DIR, 'scenery');
const DEM_DIR = resolve(import.meta.dirname, '../data/dem');
const BUILDINGS_OSM = resolve(import.meta.dirname, '../data/stelvio-buildings.osm.json');

/** Keep OSM buildings whose centroid is within this of the road. */
const BUILDING_ROAD_MAX_M = 150;

/** Stelvio treeline, local y (elevation − origin altitude ≈ 1604 m). */
const TREELINE_LOCAL_Y = 560;
/** Margin around the road bounds to scatter vegetation into. */
const VEG_MARGIN_M = 260;

interface RoadPackage {
	origin: { latDeg: number; lonDeg: number; altM: number };
	centerline: CenterlinePoint[];
	tags?: { widthM?: number };
}

const round = (v: number, dp = 3): number => Math.round(v * 10 ** dp) / 10 ** dp;

/** Distance from (x, z) to the centreline polyline (with a per-segment AABB reject). */
function roadDistance(x: number, z: number, cl: CenterlinePoint[], cap: number): number {
	let best = cap;
	for (let i = 0; i < cl.length - 1; i++) {
		const a = cl[i];
		const b = cl[i + 1];
		if (
			x < Math.min(a.x, b.x) - cap ||
			x > Math.max(a.x, b.x) + cap ||
			z < Math.min(a.z, b.z) - cap ||
			z > Math.max(a.z, b.z) + cap
		) {
			continue;
		}
		const dx = b.x - a.x;
		const dz = b.z - a.z;
		const len2 = dx * dx + dz * dz || 1e-9;
		let t = ((x - a.x) * dx + (z - a.z) * dz) / len2;
		t = t < 0 ? 0 : t > 1 ? 1 : t;
		const d = Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz));
		if (d < best) best = d;
	}
	return best;
}

async function main(): Promise<void> {
	const roadPath = resolve(ROADS_DIR, 'ss38.json');
	if (!existsSync(roadPath)) throw new Error(`missing pipeline output: ${roadPath}`);
	const road = JSON.parse(readFileSync(roadPath, 'utf8')) as RoadPackage;
	const roadWidthM = road.tags?.widthM ?? 6;
	const cl = road.centerline;

	mkdirSync(SCENERY_DIR, { recursive: true });

	// --- M25: road furniture ---
	const furniture = placeFurniture(cl, { roadWidthM });
	const posts = furniture.posts.map((p) => ({
		x: round(p.x),
		y: round(p.y),
		z: round(p.z),
		ry: round(p.ry, 4),
		h: round(p.h),
		kind: p.kind
	}));
	const rails = furniture.rails.map((rail) =>
		rail.map((p) => ({ x: round(p.x), y: round(p.y), z: round(p.z) }))
	);
	writeFileSync(resolve(SCENERY_DIR, 'furniture.json'), JSON.stringify({ posts, rails }) + '\n');

	// --- M26: vegetation ---
	const frame = new LocalFrame(road.origin);
	const dem = await DemSampler.load(DEM_DIR);
	const heightAt = (x: number, z: number): number => {
		const g = frame.toGeo({ x, y: 0, z });
		const elev = dem.elevationAt(g.lonDeg, g.latDeg);
		if (!Number.isFinite(elev)) return Number.NaN;
		return frame.toLocal({ latDeg: g.latDeg, lonDeg: g.lonDeg, altM: elev }).y;
	};

	const xs = cl.map((p) => p.x);
	const zs = cl.map((p) => p.z);
	const vegBounds = {
		minX: Math.min(...xs) - VEG_MARGIN_M,
		minZ: Math.min(...zs) - VEG_MARGIN_M,
		maxX: Math.max(...xs) + VEG_MARGIN_M,
		maxZ: Math.max(...zs) + VEG_MARGIN_M
	};
	const trees = placeVegetation(
		vegBounds,
		{ heightAt, roadDistAt: (x, z) => roadDistance(x, z, cl, 40) },
		{ treelineLocalY: TREELINE_LOCAL_Y, seed: 20260903 }
	);
	const vegBuf = Buffer.alloc(4 + trees.length * 5 * 4);
	vegBuf.writeUInt32LE(trees.length, 0);
	trees.forEach((t, i) => {
		const o = 4 + i * 20;
		vegBuf.writeFloatLE(t.x, o);
		vegBuf.writeFloatLE(t.y, o + 4);
		vegBuf.writeFloatLE(t.z, o + 8);
		vegBuf.writeFloatLE(t.scale, o + 12);
		vegBuf.writeFloatLE(t.ry, o + 16);
	});
	writeFileSync(resolve(SCENERY_DIR, 'vegetation.bin'), vegBuf);

	// --- M27: buildings (only if the OSM footprints were fetched) ---
	let buildingCount = 0;
	if (existsSync(BUILDINGS_OSM)) {
		const osm = JSON.parse(readFileSync(BUILDINGS_OSM, 'utf8')) as {
			elements: Array<{
				type: string;
				id: number;
				lat?: number;
				lon?: number;
				nodes?: number[];
				tags?: Record<string, string>;
			}>;
		};
		const nodeLL = new Map<number, { lat: number; lon: number }>();
		for (const e of osm.elements) {
			if (e.type === 'node' && e.lat !== undefined && e.lon !== undefined) {
				nodeLL.set(e.id, { lat: e.lat, lon: e.lon });
			}
		}
		const raw: RawBuilding[] = [];
		for (const e of osm.elements) {
			if (e.type !== 'way' || !e.nodes || !e.tags?.building) continue;
			const ring = e.nodes
				.map((id) => nodeLL.get(id))
				.filter((n): n is { lat: number; lon: number } => n !== undefined)
				.map((n) => {
					const l = frame.toLocal({ latDeg: n.lat, lonDeg: n.lon, altM: 0 });
					return { x: l.x, z: l.z };
				});
			if (ring.length >= 3) raw.push({ ring, tags: e.tags });
		}
		const buildings = extractBuildings(
			raw,
			(x, z) => roadDistance(x, z, cl, BUILDING_ROAD_MAX_M + 5),
			heightAt,
			{ maxRoadDistM: BUILDING_ROAD_MAX_M }
		).map((b) => ({
			footprint: b.footprint.map((p) => ({ x: round(p.x), z: round(p.z) })),
			baseY: round(b.baseY, 2),
			heightM: round(b.heightM, 2),
			...(b.name ? { name: b.name } : {})
		}));
		buildingCount = buildings.length;
		writeFileSync(resolve(SCENERY_DIR, 'buildings.json'), JSON.stringify({ buildings }) + '\n');
	}

	// --- index ---
	const index = {
		worldId: 'stelvio',
		bounds: {
			minX: Math.min(...xs) - 40,
			minZ: Math.min(...zs) - 40,
			maxX: Math.max(...xs) + 40,
			maxZ: Math.max(...zs) + 40
		},
		furniture: {
			file: 'furniture.json',
			postCount: posts.length,
			railCount: rails.reduce((n, r) => n + r.length, 0)
		},
		vegetation: { file: 'vegetation.bin', instanceCount: trees.length },
		...(buildingCount > 0 ? { buildings: { file: 'buildings.json', count: buildingCount } } : {})
	};
	writeFileSync(resolve(SCENERY_DIR, 'index.json'), JSON.stringify(index, null, '\t') + '\n');

	const guardrails = posts.filter((p) => p.kind === 'guardrail').length;
	process.stdout.write(
		`Scenery: ${guardrails} guardrail posts, ${posts.length - guardrails} delineators, ` +
			`${index.furniture.railCount} rail points; ${trees.length} trees ` +
			`(${(vegBuf.length / 1024).toFixed(0)} kB); ${buildingCount} buildings\n` +
			`Wrote ${SCENERY_DIR}/*\n`
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
