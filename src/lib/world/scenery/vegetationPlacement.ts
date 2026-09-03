/**
 * Procedural vegetation placement (milestone M26): conifers scattered on the
 * terrain by altitude and slope, thinning toward the treeline and kept off the
 * road. Pure — the offline baker feeds it height / road-distance samplers and
 * packs the result; the runtime instances it.
 */

export interface VegetationBounds {
	minX: number;
	minZ: number;
	maxX: number;
	maxZ: number;
}

export interface VegetationOptions {
	/** Nominal grid spacing before jitter, m. */
	gridM?: number;
	/** Position jitter as a fraction of the grid cell. */
	jitterFrac?: number;
	/** Local-y (elevation − origin altitude) at which trees stop entirely. */
	treelineLocalY: number;
	/** Trees thin out over this vertical band below the treeline. */
	treelineFadeM?: number;
	/** No trees within this distance of the road centreline. */
	roadClearM?: number;
	/** No trees where the terrain gradient exceeds this (rise/run). */
	maxSlope?: number;
	/** Acceptance probability at low altitude (density ceiling). */
	baseDensity?: number;
	/** Deterministic seed. */
	seed?: number;
}

export interface TreeInstance {
	x: number;
	y: number;
	z: number;
	/** Uniform scale multiplier. */
	scale: number;
	/** Yaw about +y, radians. */
	ry: number;
}

export interface VegetationSamplers {
	/** Terrain local-y at a local (x, z). */
	heightAt: (x: number, z: number) => number;
	/** Distance from a local (x, z) to the road centreline, metres. */
	roadDistAt: (x: number, z: number) => number;
}

const DEFAULTS = {
	gridM: 16,
	jitterFrac: 0.7,
	treelineFadeM: 220,
	roadClearM: 9,
	maxSlope: 0.85,
	baseDensity: 0.55,
	seed: 1
};

/** mulberry32 — small deterministic PRNG. */
function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function placeVegetation(
	bounds: VegetationBounds,
	samplers: VegetationSamplers,
	options: VegetationOptions
): TreeInstance[] {
	const o = { ...DEFAULTS, ...options };
	const trees: TreeInstance[] = [];
	const cols = Math.max(1, Math.floor((bounds.maxX - bounds.minX) / o.gridM));
	const rows = Math.max(1, Math.floor((bounds.maxZ - bounds.minZ) / o.gridM));
	const slopeProbe = o.gridM * 0.5;

	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const rand = rng(o.seed + r * 73856093 + c * 19349663);
			const jx = (rand() - 0.5) * o.gridM * o.jitterFrac;
			const jz = (rand() - 0.5) * o.gridM * o.jitterFrac;
			const x = bounds.minX + (c + 0.5) * o.gridM + jx;
			const z = bounds.minZ + (r + 0.5) * o.gridM + jz;

			if (samplers.roadDistAt(x, z) < o.roadClearM) continue;

			const y = samplers.heightAt(x, z);
			if (!Number.isFinite(y) || y >= o.treelineLocalY) continue;

			// Altitude fade: full density well below the treeline, none at it.
			const belowLine = o.treelineLocalY - y;
			const altFactor = Math.min(1, belowLine / o.treelineFadeM);
			if (rand() > o.baseDensity * altFactor) continue;

			// Slope reject.
			const dx = samplers.heightAt(x + slopeProbe, z) - samplers.heightAt(x - slopeProbe, z);
			const dz = samplers.heightAt(x, z + slopeProbe) - samplers.heightAt(x, z - slopeProbe);
			const slope = Math.hypot(dx, dz) / (2 * slopeProbe);
			if (slope > o.maxSlope) continue;

			trees.push({
				x,
				y,
				z,
				scale: 0.7 + rand() * 0.8 * (0.6 + 0.4 * altFactor),
				ry: rand() * Math.PI * 2
			});
		}
	}
	return trees;
}
