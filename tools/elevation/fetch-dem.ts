/**
 * One-off developer fetch of DEM tiles for the Stelvio prototype
 * (milestone M15). Not part of the app or the build.
 *
 *   pnpm world:fetch-dem
 *
 * Terrain tiles © Mapzen / AWS Open Data (SRTM, GMTED, …).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { STELVIO_BBOX } from '../bbox';
import { DEM_TILE_URL, tilesCoveringBbox } from './tiles';

/** Zoom 13 ≈ 20 m/px at this latitude — plenty for a road/terrain reconstruction. */
const ZOOM = 13;
const OUT_DIR = resolve(import.meta.dirname, '../data/dem');

async function main(): Promise<void> {
	mkdirSync(OUT_DIR, { recursive: true });
	const tiles = tilesCoveringBbox(STELVIO_BBOX, ZOOM);
	process.stdout.write(`Fetching ${tiles.length} DEM tiles at z${ZOOM}…\n`);
	for (const t of tiles) {
		const path = resolve(OUT_DIR, `${t.z}_${t.x}_${t.y}.tif`);
		if (existsSync(path)) {
			process.stdout.write(`  ${t.z}/${t.x}/${t.y}  cached\n`);
			continue;
		}
		const res = await fetch(DEM_TILE_URL(t.z, t.x, t.y));
		if (!res.ok) throw new Error(`tile ${t.z}/${t.x}/${t.y}: HTTP ${res.status}`);
		writeFileSync(path, Buffer.from(await res.arrayBuffer()));
		process.stdout.write(`  ${t.z}/${t.x}/${t.y}  ${res.headers.get('content-length') ?? '?'} B\n`);
	}
	process.stdout.write(`Wrote ${OUT_DIR}\n`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
