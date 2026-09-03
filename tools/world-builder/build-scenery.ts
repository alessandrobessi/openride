/**
 * Bake the Stelvio scenery package (milestones M25–M27) from the road + terrain
 * outputs. Runs before `world:manifest` in `pnpm world:build`.
 *
 *   pnpm world:scenery
 *
 * M25 — road furniture: guardrail posts + rails and delineator posts along both
 * edges, from the semantic centerline (src/lib/world/scenery/furniturePlacement).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	placeFurniture,
	type CenterlinePoint
} from '../../src/lib/world/scenery/furniturePlacement';

const WORLD_DIR = resolve(import.meta.dirname, '../../static/worlds/stelvio');
const ROADS_DIR = resolve(WORLD_DIR, 'roads');
const SCENERY_DIR = resolve(WORLD_DIR, 'scenery');

interface RoadPackage {
	centerline: CenterlinePoint[];
	tags?: { widthM?: number };
}

const round = (v: number, dp = 3): number => Math.round(v * 10 ** dp) / 10 ** dp;

function main(): void {
	const roadPath = resolve(ROADS_DIR, 'ss38.json');
	if (!existsSync(roadPath)) throw new Error(`missing pipeline output: ${roadPath}`);
	const road = JSON.parse(readFileSync(roadPath, 'utf8')) as RoadPackage;
	const roadWidthM = road.tags?.widthM ?? 6;

	mkdirSync(SCENERY_DIR, { recursive: true });

	// --- M25: road furniture ---
	const furniture = placeFurniture(road.centerline, { roadWidthM });
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

	// --- index ---
	const xs = road.centerline.map((p) => p.x);
	const zs = road.centerline.map((p) => p.z);
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
		}
	};
	writeFileSync(resolve(SCENERY_DIR, 'index.json'), JSON.stringify(index, null, '\t') + '\n');

	const guardrails = posts.filter((p) => p.kind === 'guardrail').length;
	const delineators = posts.length - guardrails;
	process.stdout.write(
		`Scenery: ${guardrails} guardrail posts, ${delineators} delineators, ` +
			`${index.furniture.railCount} rail points over ${rails.length} rails\n` +
			`Wrote ${SCENERY_DIR}/furniture.json, index.json\n`
	);
}

try {
	main();
} catch (err) {
	console.error(err);
	process.exit(1);
}
