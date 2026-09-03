/**
 * One-off developer fetch of OSM building footprints for the Stelvio bbox
 * (milestone M27). Not part of the app or the build.
 *
 *   pnpm world:fetch-buildings
 *
 * OSM data © OpenStreetMap contributors, ODbL.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { STELVIO_BBOX } from '../bbox';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OUT = resolve(import.meta.dirname, '../data/stelvio-buildings.osm.json');

const { south, west, north, east } = STELVIO_BBOX;
const QUERY = `
[out:json][timeout:120];
(
  way["building"](${south},${west},${north},${east});
);
(._;>;);
out body;
`;

async function main(): Promise<void> {
	process.stdout.write('Fetching Stelvio OSM buildings from Overpass…\n');
	const res = await fetch(OVERPASS_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'User-Agent': 'openride-world-builder (https://github.com/alessandrobessi/openride)'
		},
		body: new URLSearchParams({ data: QUERY })
	});
	if (!res.ok) throw new Error(`Overpass returned ${res.status} ${res.statusText}`);
	const text = await res.text();
	const parsed = JSON.parse(text) as { elements?: unknown[] };
	mkdirSync(dirname(OUT), { recursive: true });
	writeFileSync(OUT, text);
	process.stdout.write(
		`Wrote ${OUT} (${(text.length / 1024).toFixed(0)} kB, ${parsed.elements?.length ?? 0} elements)\n`
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
