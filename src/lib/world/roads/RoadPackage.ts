import type { GeoPoint } from '../geo/enu';

/**
 * A normalised road produced by the offline extractor (tools/osm/extract-road.ts)
 * and shipped under `static/worlds/stelvio/roads/`. The runtime never parses OSM
 * — it consumes this (OPENRIDE-BLUEPRINT.md §4, §9).
 *
 * Consumers must treat every tag as optional (AGENTS.md §18).
 */
export interface RoadPoint {
	/** Local ENU east, metres. */
	x: number;
	/** Local ENU north, metres. */
	z: number;
	/** Local ENU up, metres — added by the elevation pipeline (M15). */
	y?: number;
}

export interface RoadTags {
	highway?: string;
	surface?: string;
	lanes?: number;
	widthM?: number;
	maxspeedKmh?: number;
	bridge?: boolean;
	tunnel?: boolean;
	name?: string;
	ref?: string;
	oneway?: boolean;
}

export interface RoadPackage {
	id: string;
	name: string;
	ref: string;
	origin: GeoPoint;
	tags: RoadTags;
	centerline: RoadPoint[];
	lengthM: number;
	bounds: { minLatDeg: number; minLonDeg: number; maxLatDeg: number; maxLonDeg: number };
	hairpinCount: number;
	maxSegmentGapM: number;
	source: { file: string; wayIds: number[]; extractedAt: string };
}

/** Structural validation of an untrusted road package (thrown errors name the problem). */
export function assertRoadPackage(value: unknown): asserts value is RoadPackage {
	const r = value as Partial<RoadPackage>;
	if (!r || typeof r !== 'object') throw new Error('road package: not an object');
	if (typeof r.id !== 'string' || !r.id) throw new Error('road package: missing id');
	if (!Array.isArray(r.centerline) || r.centerline.length < 2) {
		throw new Error('road package: centerline must have ≥ 2 points');
	}
	for (const p of r.centerline) {
		if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) {
			throw new Error('road package: centerline point is not finite');
		}
	}
	if (!(typeof r.lengthM === 'number' && r.lengthM > 0)) {
		throw new Error('road package: missing lengthM');
	}
	if (!r.origin || !Number.isFinite(r.origin.latDeg) || !Number.isFinite(r.origin.lonDeg)) {
		throw new Error('road package: missing origin');
	}
	if (!r.tags || typeof r.tags !== 'object') throw new Error('road package: missing tags');
}

export async function loadRoadPackage(url: string): Promise<RoadPackage> {
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Failed to load road package: ${url} (HTTP ${res.status})`);
	}
	const data: unknown = await res.json();
	assertRoadPackage(data);
	return data;
}
