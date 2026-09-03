/**
 * Offline Stelvio road extraction (OPENRIDE-BLUEPRINT.md §9, milestone M14).
 *
 * Reads the raw Overpass dump (tools/data/stelvio.osm.json), stitches the SS38
 * pass-road ways into one ordered centreline, converts every node to the
 * world's local ENU frame, keeps the tags that survived the source, and writes
 * a normalised road package:
 *
 *   tools/data/stelvio-road.json
 *   static/worlds/stelvio/roads/ss38.json
 *
 *   pnpm world:extract
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { LocalFrame, STELVIO_ORIGIN } from '../../src/lib/world/geo/enu';
import type {
	NormalizedRoad,
	OverpassNode,
	OverpassResponse,
	OverpassWay,
	RoadPoint,
	RoadTags
} from './types';

const IN = resolve(import.meta.dirname, '../data/stelvio.osm.json');
const OUT_TOOLS = resolve(import.meta.dirname, '../data/stelvio-road.json');
const OUT_STATIC = resolve(import.meta.dirname, '../../static/worlds/stelvio/roads/ss38.json');

/** A way belongs to the Stelvio pass road. */
function isPassRoad(w: OverpassWay): boolean {
	const t = w.tags ?? {};
	const ref = t.ref ?? '';
	if (/dir/i.test(ref)) return false; // slip roads / separate ramps
	if (/\bSS38\b/.test(ref)) return true;
	const name = `${t.name ?? ''} ${t['name:de'] ?? ''}`;
	return /stelvio|stilfser/i.test(name);
}

function parseTags(ways: OverpassWay[]): RoadTags {
	const pick = (key: string): string | undefined =>
		ways.map((w) => w.tags?.[key]).find((v) => v != null && v !== '');
	const num = (v: string | undefined): number | undefined => {
		if (v == null) return undefined;
		const n = Number.parseFloat(v);
		return Number.isFinite(n) ? n : undefined;
	};
	return {
		highway: pick('highway'),
		surface: pick('surface'),
		lanes: num(pick('lanes')),
		widthM: num(pick('width')),
		maxspeedKmh: num(pick('maxspeed')),
		bridge: ways.some((w) => w.tags?.bridge && w.tags.bridge !== 'no'),
		tunnel: ways.some((w) => w.tags?.tunnel && w.tags.tunnel !== 'no'),
		name: pick('name'),
		ref: pick('ref'),
		oneway: ways.some((w) => w.tags?.oneway === 'yes')
	};
}

/** Metres between two OSM nodes in the local frame. */
function nodeGapM(a: OverpassNode, b: OverpassNode, frame: LocalFrame): number {
	const la = frame.toLocal({ latDeg: a.lat, lonDeg: a.lon, altM: 0 });
	const lb = frame.toLocal({ latDeg: b.lat, lonDeg: b.lon, altM: 0 });
	return Math.hypot(lb.x - la.x, lb.z - la.z);
}

/**
 * Greedy walk of the way graph from `start`, taking the longest unused connected
 * way. When it dead-ends, bridge to the nearest unused way endpoint within
 * `bridgeM` — OSM occasionally splits the road across a seam / tunnel without a
 * shared node.
 */
function walkFrom(
	start: number,
	ways: OverpassWay[],
	endpoints: Map<number, number[]>,
	nodes: Map<number, OverpassNode>,
	frame: LocalFrame,
	bridgeM = 400
): number[] {
	const wayById = new Map(ways.map((w) => [w.id, w]));
	const used = new Set<number>();
	const path: number[] = [];
	let current = start;

	const appendWay = (id: number) => {
		used.add(id);
		let seq = wayById.get(id)!.nodes;
		if (seq.at(-1) === current) seq = [...seq].reverse();
		path.push(...(path.length ? seq.slice(1) : seq));
		current = path.at(-1)!;
	};

	for (;;) {
		const connected = (endpoints.get(current) ?? [])
			.filter((id) => !used.has(id))
			.sort((a, b) => wayById.get(b)!.nodes.length - wayById.get(a)!.nodes.length)[0];
		if (connected != null) {
			appendWay(connected);
			continue;
		}
		// dead end — try to bridge a small gap to another unused way
		const here = nodes.get(current);
		if (!here) break;
		let bestId: number | undefined;
		let bestGap = bridgeM;
		for (const w of ways) {
			if (used.has(w.id)) continue;
			for (const end of [w.nodes[0], w.nodes.at(-1)!]) {
				const n = nodes.get(end);
				if (!n) continue;
				const g = nodeGapM(here, n, frame);
				if (g < bestGap) {
					bestGap = g;
					bestId = w.id;
				}
			}
		}
		if (bestId == null) break;
		appendWay(bestId);
	}
	return path;
}

function pathLengthM(
	nodeIds: number[],
	nodes: Map<number, OverpassNode>,
	frame: LocalFrame
): number {
	let m = 0;
	for (let i = 1; i < nodeIds.length; i++) {
		const a = nodes.get(nodeIds[i - 1]);
		const b = nodes.get(nodeIds[i]);
		if (!a || !b) continue;
		const la = frame.toLocal({ latDeg: a.lat, lonDeg: a.lon, altM: 0 });
		const lb = frame.toLocal({ latDeg: b.lat, lonDeg: b.lon, altM: 0 });
		m += Math.hypot(lb.x - la.x, lb.z - la.z);
	}
	return m;
}

/**
 * Stitch segment ways into one ordered list of node ids. OSM splits the road at
 * junctions, so we walk the endpoint graph greedily from every free end and
 * from a couple of fallback starts, and keep whichever walk covers the most
 * ground — that is the through route; short spurs lose.
 */
function stitch(
	ways: OverpassWay[],
	nodes: Map<number, OverpassNode>,
	frame: LocalFrame
): number[] {
	const endpoints = new Map<number, number[]>();
	for (const w of ways) {
		for (const end of [w.nodes[0], w.nodes.at(-1)!]) {
			(endpoints.get(end) ?? endpoints.set(end, []).get(end)!).push(w.id);
		}
	}

	const starts = new Set<number>([
		...[...endpoints.entries()].filter(([, ws]) => ws.length === 1).map(([n]) => n),
		ways[0].nodes[0],
		ways.at(-1)!.nodes.at(-1)!
	]);

	let best: number[] = [];
	let bestLen = 0;
	for (const s of starts) {
		if (!nodes.has(s)) continue;
		const p = walkFrom(s, ways, endpoints, nodes, frame);
		const len = pathLengthM(p, nodes, frame);
		if (len > bestLen) {
			best = p;
			bestLen = len;
		}
	}
	return best;
}

const heading = (a: RoadPoint, b: RoadPoint) => Math.atan2(b.x - a.x, b.z - a.z);

/** Even arc-length resample so turn detection is independent of OSM node density. */
function resample(points: RoadPoint[], spacingM: number): RoadPoint[] {
	if (points.length < 2) return points;
	const out: RoadPoint[] = [points[0]];
	let carry = 0;
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1];
		const b = points[i];
		const segLen = Math.hypot(b.x - a.x, b.z - a.z);
		let start = spacingM - carry;
		while (start <= segLen) {
			const t = start / segLen;
			out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
			start += spacingM;
		}
		carry = (carry + segLen) % spacingM;
	}
	return out;
}

/**
 * Count switchback hairpins: near-reversals of heading on a 10 m-resampled
 * centreline, collapsed so one hairpin counts once.
 */
function hairpinCount(points: RoadPoint[]): number {
	const rs = resample(points, 10);
	let count = 0;
	let cooldown = 0;
	for (let i = 2; i < rs.length - 2; i++) {
		if (cooldown > 0) {
			cooldown--;
			continue;
		}
		let d = Math.abs(heading(rs[i - 2], rs[i]) - heading(rs[i], rs[i + 2]));
		if (d > Math.PI) d = 2 * Math.PI - d;
		if (d > 2.3) {
			// > ~131°
			count++;
			cooldown = 3;
		}
	}
	return count;
}

function maxGapM(points: RoadPoint[]): number {
	let g = 0;
	for (let i = 1; i < points.length; i++) {
		g = Math.max(g, Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
	}
	return g;
}

/** Keep the longest run of the centreline with no gap larger than `maxGapM` (drops stitched spurs). */
function longestContiguousRun(points: RoadPoint[], maxGap: number): RoadPoint[] {
	let bestStart = 0;
	let bestLen = 1;
	let runStart = 0;
	for (let i = 1; i < points.length; i++) {
		const gap = Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
		if (gap > maxGap) {
			if (i - runStart > bestLen) {
				bestStart = runStart;
				bestLen = i - runStart;
			}
			runStart = i;
		}
	}
	if (points.length - runStart > bestLen) {
		bestStart = runStart;
		bestLen = points.length - runStart;
	}
	return points.slice(bestStart, bestStart + bestLen);
}

function polylineLengthM(points: RoadPoint[]): number {
	let m = 0;
	for (let i = 1; i < points.length; i++) {
		m += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
	}
	return m;
}

function main(): void {
	const raw = JSON.parse(readFileSync(IN, 'utf8')) as OverpassResponse;
	const nodes = new Map<number, OverpassNode>();
	const ways: OverpassWay[] = [];
	for (const el of raw.elements) {
		if (el.type === 'node') nodes.set((el as OverpassNode).id, el as OverpassNode);
		else if (el.type === 'way') ways.push(el as OverpassWay);
	}

	const passWays = ways.filter(isPassRoad);
	if (passWays.length === 0) throw new Error('No SS38 / Stelvio ways found in the OSM dump');
	process.stdout.write(`Selected ${passWays.length} pass-road ways from ${ways.length}\n`);

	const frame = new LocalFrame(STELVIO_ORIGIN);
	const nodeOrder = stitch(passWays, nodes, frame);

	const geo = nodeOrder.map((id) => nodes.get(id)!).filter(Boolean);
	const rawCenterline: RoadPoint[] = geo.map((n) => {
		const l = frame.toLocal({ latDeg: n.lat, lonDeg: n.lon, altM: STELVIO_ORIGIN.altM });
		return { x: Math.round(l.x * 1000) / 1000, z: Math.round(l.z * 1000) / 1000 };
	});
	// Drop stitched spurs: keep the longest run with no > 80 m gap.
	const centerline = longestContiguousRun(rawCenterline, 80);
	if (centerline.length < rawCenterline.length) {
		process.stdout.write(
			`Trimmed ${rawCenterline.length - centerline.length} spur point(s) at stitch gaps\n`
		);
	}

	// Bounds from the kept centreline, back-projected to geographic.
	const keptGeo = centerline.map((p) => frame.toGeo({ x: p.x, y: 0, z: p.z }));
	const lats = keptGeo.map((g) => g.latDeg);
	const lons = keptGeo.map((g) => g.lonDeg);
	const road: NormalizedRoad = {
		id: 'stelvio-ss38',
		name: 'Passo dello Stelvio (SS38)',
		ref: 'SS38',
		origin: STELVIO_ORIGIN,
		tags: parseTags(passWays),
		centerline,
		lengthM: Math.round(polylineLengthM(centerline)),
		bounds: {
			minLatDeg: Math.min(...lats),
			minLonDeg: Math.min(...lons),
			maxLatDeg: Math.max(...lats),
			maxLonDeg: Math.max(...lons)
		},
		hairpinCount: hairpinCount(centerline),
		maxSegmentGapM: Math.round(maxGapM(centerline) * 10) / 10,
		source: {
			file: 'tools/data/stelvio.osm.json',
			wayIds: passWays.map((w) => w.id),
			extractedAt: new Date().toISOString()
		}
	};

	for (const out of [OUT_TOOLS, OUT_STATIC]) {
		mkdirSync(dirname(out), { recursive: true });
		writeFileSync(out, JSON.stringify(road, null, '\t') + '\n');
	}

	process.stdout.write(
		`Road: ${centerline.length} points, ${(road.lengthM / 1000).toFixed(2)} km, ` +
			`${road.hairpinCount} hairpins, surface=${road.tags.surface ?? 'n/a'}, ` +
			`max gap ${road.maxSegmentGapM} m\n` +
			`Wrote ${OUT_TOOLS}\n      ${OUT_STATIC}\n`
	);
}

main();
