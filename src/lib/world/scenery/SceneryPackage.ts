/**
 * Static scenery package format (milestones M25–M27): furniture, vegetation and
 * building instances baked offline from the road + terrain + OSM data and shipped
 * under `static/worlds/<id>/scenery/`. The runtime only instances them.
 */
import type { FurniturePost } from './furniturePlacement';

export interface SceneryIndex {
	worldId: string;
	bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
	furniture?: { file: string; postCount: number; railCount: number };
	vegetation?: { file: string; instanceCount: number };
	buildings?: { file: string; count: number };
}

export interface FurnitureData {
	posts: FurniturePost[];
	/** Edge polylines (left, right) at road level. */
	rails: Array<Array<{ x: number; y: number; z: number }>>;
}

function fail(msg: string): never {
	throw new Error(`scenery: ${msg}`);
}

export function assertSceneryIndex(value: unknown): asserts value is SceneryIndex {
	if (!value || typeof value !== 'object') fail('index is not an object');
	const i = value as Partial<SceneryIndex>;
	if (typeof i.worldId !== 'string' || !i.worldId) fail('index missing worldId');
	if (
		!i.bounds ||
		!Number.isFinite(i.bounds.minX) ||
		!Number.isFinite(i.bounds.maxX) ||
		!Number.isFinite(i.bounds.minZ) ||
		!Number.isFinite(i.bounds.maxZ)
	) {
		fail('index missing finite bounds');
	}
}

export function assertFurnitureData(value: unknown): asserts value is FurnitureData {
	if (!value || typeof value !== 'object') fail('furniture is not an object');
	const f = value as Partial<FurnitureData>;
	if (!Array.isArray(f.posts)) fail('furniture.posts must be an array');
	if (!Array.isArray(f.rails)) fail('furniture.rails must be an array');
	for (const p of f.posts) {
		if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
			fail('furniture post has a non-finite coordinate');
		}
	}
}
