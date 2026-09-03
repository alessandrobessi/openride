/**
 * The static world package format (milestone M18, OPENRIDE-BLUEPRINT.md §7, §9).
 *
 * A world ships as a directory under `static/worlds/<id>/` containing this
 * `manifest.json` plus the road and terrain sub-packages. The runtime loads a
 * world *only* through the manifest — it never hard-codes an origin, a spawn or
 * an asset path (AGENTS.md §3, §8). Fetches go through `$lib/paths`.
 */
import type { GeoPoint } from './geo/enu';

/** Schema version the loader understands. Bump on any breaking shape change. */
export const WORLD_MANIFEST_VERSION = 1;

export interface WorldSpawn {
	/** Local ENU east / up / north, metres. */
	x: number;
	y: number;
	z: number;
	/** Initial heading about +y, radians (`atan2(dx, dz)`). */
	headingRad: number;
}

export interface WorldAssetRefs {
	/** Directory holding the road package + mesh, relative to the manifest. */
	roads: string;
	/** Directory holding the terrain chunks + index, relative to the manifest. */
	terrain: string;
	/** Directory holding the scenery package (furniture / vegetation / buildings). */
	scenery?: string;
}

export interface WorldManifest {
	version: number;
	id: string;
	name: string;
	/** Geographic anchor of the world's local ENU frame. */
	origin: GeoPoint;
	/** Where the rider is placed at load, in the local frame. */
	spawn: WorldSpawn;
	assets: WorldAssetRefs;
	/** Free-form descriptive fields (length, hairpins, elevation band …). */
	metadata?: Record<string, unknown>;
}

function fail(msg: string): never {
	throw new Error(`world manifest: ${msg}`);
}

/** Structural validation of an untrusted manifest; thrown errors name the fault. */
export function assertWorldManifest(value: unknown): asserts value is WorldManifest {
	if (!value || typeof value !== 'object') fail('not an object');
	const m = value as Partial<WorldManifest>;

	if (m.version !== WORLD_MANIFEST_VERSION) {
		fail(`unsupported version ${String(m.version)} (expected ${WORLD_MANIFEST_VERSION})`);
	}
	if (typeof m.id !== 'string' || !m.id) fail('missing id');
	if (typeof m.name !== 'string' || !m.name) fail('missing name');

	const o = m.origin;
	if (
		!o ||
		!Number.isFinite(o.latDeg) ||
		!Number.isFinite(o.lonDeg) ||
		!Number.isFinite(o.altM) ||
		Math.abs(o.latDeg) > 90 ||
		Math.abs(o.lonDeg) > 180
	) {
		fail('origin must have finite latDeg / lonDeg / altM in range');
	}

	const s = m.spawn;
	if (
		!s ||
		!Number.isFinite(s.x) ||
		!Number.isFinite(s.y) ||
		!Number.isFinite(s.z) ||
		!Number.isFinite(s.headingRad)
	) {
		fail('spawn must have finite x / y / z / headingRad');
	}

	const a = m.assets;
	if (!a || typeof a !== 'object') fail('missing assets');
	if (typeof a.roads !== 'string' || !a.roads) fail('assets.roads must be a directory path');
	if (typeof a.terrain !== 'string' || !a.terrain) fail('assets.terrain must be a directory path');
	if (a.scenery !== undefined && (typeof a.scenery !== 'string' || !a.scenery)) {
		fail('assets.scenery must be a directory path when present');
	}
	for (const dir of [a.roads, a.terrain, a.scenery]) {
		if (dir !== undefined && (dir.startsWith('/') || dir.includes('..'))) {
			fail(`asset path "${dir}" must be relative`);
		}
	}

	if (m.metadata !== undefined && (typeof m.metadata !== 'object' || m.metadata === null)) {
		fail('metadata must be an object when present');
	}
}

/**
 * Fetch and validate `manifest.json` from a world directory. `baseUrl` is the
 * directory URL (already run through the base-path helper), e.g.
 * `asset('worlds/stelvio')`.
 */
export async function fetchWorldManifest(baseUrl: string): Promise<WorldManifest> {
	const dir = baseUrl.replace(/\/$/, '');
	const url = `${dir}/manifest.json`;
	let res: Response;
	try {
		res = await fetch(url);
	} catch (cause) {
		throw new Error(`world manifest: could not reach ${url}`, { cause });
	}
	if (!res.ok) throw new Error(`world manifest: ${url} returned HTTP ${res.status}`);

	let data: unknown;
	try {
		data = await res.json();
	} catch (cause) {
		throw new Error(`world manifest: ${url} is not valid JSON`, { cause });
	}
	assertWorldManifest(data);
	return data;
}
