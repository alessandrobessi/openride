/**
 * Assemble the Stelvio world manifest (milestone M18) from the sub-package
 * outputs of the offline pipeline. The runtime loads the world only through
 * this file (src/lib/world/WorldManifest.ts).
 *
 *   pnpm world:manifest        (runs last in `pnpm world:build`)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { WORLD_MANIFEST_VERSION } from '../../src/lib/world/WorldManifest';

const WORLD_DIR = resolve(import.meta.dirname, '../../static/worlds/stelvio');
const ROADS_DIR = resolve(WORLD_DIR, 'roads');
const TERRAIN_DIR = resolve(WORLD_DIR, 'terrain');
const SCENERY_DIR = resolve(WORLD_DIR, 'scenery');

interface RoadPackage {
	id: string;
	name: string;
	origin: { latDeg: number; lonDeg: number; altM: number };
	lengthM: number;
	hairpinCount: number;
	elevation?: { minM: number; maxM: number; totalClimbM: number };
}
interface RoadMeshIndex {
	spawn: { x: number; y: number; z: number; headingRad: number };
}

function readJson<T>(path: string): T {
	if (!existsSync(path)) throw new Error(`missing pipeline output: ${path}`);
	return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function main(): void {
	const road = readJson<RoadPackage>(resolve(ROADS_DIR, 'ss38.json'));
	const mesh = readJson<RoadMeshIndex>(resolve(ROADS_DIR, 'ss38.mesh.json'));
	if (!existsSync(resolve(TERRAIN_DIR, 'index.json'))) {
		throw new Error(`missing pipeline output: ${resolve(TERRAIN_DIR, 'index.json')}`);
	}

	const hasScenery = existsSync(resolve(SCENERY_DIR, 'index.json'));

	const manifest = {
		version: WORLD_MANIFEST_VERSION,
		id: 'stelvio',
		name: road.name,
		origin: road.origin,
		spawn: mesh.spawn,
		assets: {
			roads: 'roads',
			terrain: 'terrain',
			...(hasScenery ? { scenery: 'scenery' } : {})
		},
		metadata: {
			region: 'Alps — Stelvio Pass (SS38), Italy',
			roadLengthM: road.lengthM,
			hairpinCount: road.hairpinCount,
			elevationMinM: road.elevation?.minM,
			elevationMaxM: road.elevation?.maxM,
			elevationClimbM: road.elevation?.totalClimbM,
			builtAt: new Date().toISOString()
		}
	};

	const out = resolve(WORLD_DIR, 'manifest.json');
	writeFileSync(out, JSON.stringify(manifest, null, '\t') + '\n');
	process.stdout.write(
		`Manifest: ${manifest.name} — origin ${manifest.origin.latDeg},${manifest.origin.lonDeg}, ` +
			`spawn (${manifest.spawn.x}, ${manifest.spawn.y}, ${manifest.spawn.z})\n` +
			`Wrote ${out}\n`
	);
}

try {
	main();
} catch (err) {
	console.error(err);
	process.exit(1);
}
