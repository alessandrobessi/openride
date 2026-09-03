/**
 * Turn OSM building ways into extrudable footprints in the world's local frame
 * (milestone M27). Pure — the baker supplies projected node rings and terrain
 * heights; this filters and shapes them. Recognizable silhouettes, not detail
 * (OPENRIDE-BLUEPRINT.md §34). Nothing is fabricated from absent data: a way
 * with no level/height tag just gets the default storey count.
 */

export interface RingPoint {
	x: number;
	z: number;
}

export interface RawBuilding {
	/** Closed footprint ring in local metres (first != last is fine). */
	ring: RingPoint[];
	tags: Record<string, string>;
}

export interface BuildingFootprint {
	/** Simple polygon, local metres, no repeated closing point. */
	footprint: RingPoint[];
	baseY: number;
	heightM: number;
	name?: string;
}

export interface BuildingExtractionOptions {
	/** Keep only buildings whose centroid is within this of the road. */
	maxRoadDistM: number;
	/** Metres of height per building level. */
	metresPerLevel?: number;
	/** Height when no level/height tag is present. */
	defaultHeightM?: number;
	/** Reject rings smaller than this floor area (m²) — map noise. */
	minAreaM2?: number;
}

const DEFAULTS = {
	metresPerLevel: 3.2,
	defaultHeightM: 6.5,
	minAreaM2: 12
};

function ringArea(ring: RingPoint[]): number {
	let a = 0;
	for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
		a += (ring[j].x + ring[i].x) * (ring[j].z - ring[i].z);
	}
	return Math.abs(a) / 2;
}

function centroid(ring: RingPoint[]): RingPoint {
	let x = 0;
	let z = 0;
	for (const p of ring) {
		x += p.x;
		z += p.z;
	}
	return { x: x / ring.length, z: z / ring.length };
}

function buildingHeight(tags: Record<string, string>, o: typeof DEFAULTS): number {
	const h = Number.parseFloat(tags.height ?? '');
	if (Number.isFinite(h) && h > 0) return h;
	const levels = Number.parseFloat(tags['building:levels'] ?? '');
	if (Number.isFinite(levels) && levels > 0) return levels * o.metresPerLevel;
	return o.defaultHeightM;
}

export function extractBuildings(
	raw: RawBuilding[],
	roadDistAt: (x: number, z: number) => number,
	terrainYAt: (x: number, z: number) => number,
	options: BuildingExtractionOptions
): BuildingFootprint[] {
	const o = { ...DEFAULTS, ...options };
	const out: BuildingFootprint[] = [];

	for (const b of raw) {
		// Drop a repeated closing vertex.
		const ring = b.ring.slice();
		if (
			ring.length > 3 &&
			ring[0].x === ring[ring.length - 1].x &&
			ring[0].z === ring[ring.length - 1].z
		) {
			ring.pop();
		}
		if (ring.length < 3) continue;
		if (ringArea(ring) < o.minAreaM2) continue;

		const c = centroid(ring);
		if (roadDistAt(c.x, c.z) > o.maxRoadDistM) continue;

		// Sit the base on the lowest terrain under the footprint (cut, don't float).
		let baseY = Number.POSITIVE_INFINITY;
		for (const p of ring) baseY = Math.min(baseY, terrainYAt(p.x, p.z));
		baseY = Math.min(baseY, terrainYAt(c.x, c.z));
		if (!Number.isFinite(baseY)) continue;

		out.push({
			footprint: ring,
			baseY: Math.round(baseY * 100) / 100,
			heightM: Math.round(buildingHeight(b.tags, o) * 100) / 100,
			name: b.tags.name
		});
	}
	return out;
}
