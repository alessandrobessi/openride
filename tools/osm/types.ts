import type { GeoPoint } from '../../src/lib/world/geo/enu';

/** A point on the road centreline in local ENU metres (x = east, z = north). Elevation added in M15. */
export interface RoadPoint {
	x: number;
	z: number;
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

/**
 * The offline OSM extractor's output for one road: an ordered centreline in the
 * world's local frame, plus the tags that survived the source data. Consumers
 * must not assume any tag is present (AGENTS.md §18, OPENRIDE-BLUEPRINT.md §9).
 */
export interface NormalizedRoad {
	id: string;
	name: string;
	ref: string;
	/** World origin the centreline is expressed relative to. */
	origin: GeoPoint;
	tags: RoadTags;
	centerline: RoadPoint[];
	lengthM: number;
	/** Geographic bounds of the extracted centreline. */
	bounds: { minLatDeg: number; minLonDeg: number; maxLatDeg: number; maxLonDeg: number };
	/** Number of switchback hairpins detected (sharp direction reversals). */
	hairpinCount: number;
	/** Largest gap between consecutive centreline points — flags stitch discontinuities. */
	maxSegmentGapM: number;
	source: { file: string; wayIds: number[]; extractedAt: string };
}

// --- raw Overpass shapes ---
export interface OverpassNode {
	type: 'node';
	id: number;
	lat: number;
	lon: number;
}
export interface OverpassWay {
	type: 'way';
	id: number;
	nodes: number[];
	tags?: Record<string, string>;
}
export interface OverpassResponse {
	elements: Array<OverpassNode | OverpassWay | { type: string }>;
}
