/**
 * Static scenery package format (milestones M25–M27): furniture, vegetation and
 * building instances baked offline from the road + terrain + OSM data and shipped
 * under `static/worlds/<id>/scenery/`. The runtime only instances them.
 */
import type { FurniturePost } from './furniturePlacement';
import type { BuildingFootprint } from './buildingExtraction';

export interface SceneryIndex {
	worldId: string;
	bounds: { minX: number; minZ: number; maxX: number; maxZ: number };
	furniture?: { file: string; postCount: number; railCount: number };
	vegetation?: { file: string; instanceCount: number };
	buildings?: { file: string; count: number };
}

export interface BuildingsData {
	buildings: BuildingFootprint[];
}

export function assertBuildingsData(value: unknown): asserts value is BuildingsData {
	if (!value || typeof value !== 'object') fail('buildings is not an object');
	const b = value as Partial<BuildingsData>;
	if (!Array.isArray(b.buildings)) fail('buildings.buildings must be an array');
	for (const item of b.buildings) {
		if (!Array.isArray(item.footprint) || item.footprint.length < 3) {
			fail('a building has a degenerate footprint');
		}
		if (!Number.isFinite(item.baseY) || !Number.isFinite(item.heightM) || item.heightM <= 0) {
			fail('a building has a non-finite baseY / heightM');
		}
	}
}

export interface FurnitureData {
	posts: FurniturePost[];
	/** Edge polylines (left, right) at road level. */
	rails: Array<Array<{ x: number; y: number; z: number }>>;
}

/** Packed tree instances: `[u32 count][f32 (x, y, z, scale, ry) * count]`. */
export interface VegetationData {
	count: number;
	/** Flat `x, y, z, scale, ry` per instance. */
	instances: Float32Array;
}

export function parseVegetation(buf: ArrayBuffer): VegetationData {
	const count = new Uint32Array(buf, 0, 1)[0];
	const instances = new Float32Array(buf, 4, count * 5);
	return { count, instances };
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
