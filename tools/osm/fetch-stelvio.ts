/**
 * One-off developer fetch of the raw OpenStreetMap data for the Stelvio
 * prototype. Not part of the app or the build — run it once to (re)populate
 * `tools/data/stelvio.osm.json`, which the extractor (extract-road.ts) consumes.
 *
 *   pnpm world:fetch
 *
 * OSM data © OpenStreetMap contributors, ODbL.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Extraction area (S, W, N, E). Covers the pass summit and the classic
 * north-east hairpin climb from Trafoi (~10.485 E) up to the Passo.
 */
export const STELVIO_BBOX = { south: 46.5, west: 10.42, north: 46.545, east: 10.505 } as const;

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OUT = resolve(import.meta.dirname, '../data/stelvio.osm.json');

const QUERY = `
[out:json][timeout:120];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|road|service)$"]
    (${STELVIO_BBOX.south},${STELVIO_BBOX.west},${STELVIO_BBOX.north},${STELVIO_BBOX.east});
);
(._;>;);
out body;
`;

async function main(): Promise<void> {
	process.stdout.write(`Fetching Stelvio OSM data from Overpass…\n`);
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
	JSON.parse(text); // fail fast on a truncated / error response
	mkdirSync(dirname(OUT), { recursive: true });
	writeFileSync(OUT, text);
	process.stdout.write(`Wrote ${OUT} (${(text.length / 1024).toFixed(0)} kB)\n`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
