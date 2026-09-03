/**
 * Streams terrain chunks in and out around the rider (milestone M19,
 * OPENRIDE-BLUEPRINT.md §9, AGENTS.md §20).
 *
 * The Stelvio prototype is small enough to hold entirely in memory, but this
 * abstraction must not assume that: it keeps only a near set of chunks active,
 * loads chunk binaries on demand, drops chunks once the rider is well clear
 * (with hysteresis so a chunk doesn't flicker at the boundary), and keeps a
 * small LRU of parsed-but-inactive chunks so re-entry is free.
 *
 * It is deliberately free of Three.js and Rapier: the caller supplies a
 * {@link ChunkSink} that turns an activate/deactivate call into a heightfield
 * collider and a mesh. That keeps the streaming logic headless-testable.
 */
import {
	parseTerrainChunk,
	type TerrainChunkHeights,
	type TerrainChunkMeta,
	type TerrainIndex
} from '../terrain/TerrainChunk';

export interface ChunkSink {
	/** Make a chunk physically and visually present. Called once per activation. */
	activate(meta: TerrainChunkMeta, heights: TerrainChunkHeights): void;
	/** Remove a chunk's collider and mesh. Called once per deactivation. */
	deactivate(meta: TerrainChunkMeta): void;
}

export interface WorldManagerOptions {
	/** Fetch one chunk binary by its `file` name (relative to the terrain dir). */
	fetchChunk: (file: string) => Promise<ArrayBuffer>;
	/** Chunks whose AABB is within this distance of the rider load. Default 640 m. */
	nearRadiusM?: number;
	/** Active chunks are only dropped past this distance (hysteresis). Default 900 m. */
	farRadiusM?: number;
	/** Parsed-but-inactive chunks retained for cheap re-entry. Default 24. */
	cacheSize?: number;
}

export interface WorldStreamingStats {
	activeChunks: number;
	loadingChunks: number;
	cachedChunks: number;
	currentChunkId: string | null;
}

/** Distance from a point to a chunk's axis-aligned footprint (0 when inside). */
function distanceToChunk(meta: TerrainChunkMeta, x: number, z: number): number {
	const dx = Math.max(meta.originX - x, 0, x - (meta.originX + meta.sizeM));
	const dz = Math.max(meta.originZ - z, 0, z - (meta.originZ + meta.sizeM));
	return Math.hypot(dx, dz);
}

export class WorldManager {
	private readonly near: number;
	private readonly far: number;
	private readonly cacheLimit: number;

	private readonly active = new Map<string, TerrainChunkMeta>();
	private readonly activeHeights = new Map<string, TerrainChunkHeights>();
	private readonly loading = new Set<string>();
	/** Insertion-ordered LRU of parsed heights for inactive chunks. */
	private readonly cache = new Map<string, TerrainChunkHeights>();
	private disposed = false;

	constructor(
		private readonly index: TerrainIndex,
		private readonly sink: ChunkSink,
		private readonly options: WorldManagerOptions
	) {
		this.near = options.nearRadiusM ?? 640;
		this.far = options.farRadiusM ?? 900;
		this.cacheLimit = options.cacheSize ?? 24;
	}

	/** The chunk currently under `(x, z)`, if any. */
	chunkAt(x: number, z: number): TerrainChunkMeta | null {
		return (
			this.index.chunks.find(
				(c) =>
					x >= c.originX && x < c.originX + c.sizeM && z >= c.originZ && z < c.originZ + c.sizeM
			) ?? null
		);
	}

	/**
	 * Reconcile the active set with the rider position. Cheap to call every
	 * frame: it only starts/stops work when a chunk crosses a radius.
	 */
	update(x: number, z: number): void {
		if (this.disposed) return;

		for (const meta of this.index.chunks) {
			const d = distanceToChunk(meta, x, z);
			const isActive = this.active.has(meta.id);

			if (!isActive && !this.loading.has(meta.id) && d <= this.near) {
				void this.beginLoad(meta);
			} else if (isActive && d > this.far) {
				this.deactivate(meta);
			}
		}
	}

	/** Load and activate every chunk (small worlds / warm start) via the same path. */
	async preloadAll(): Promise<void> {
		await Promise.all(this.index.chunks.map((meta) => this.beginLoad(meta)));
	}

	/** Streaming counters plus the chunk the rider is standing on. */
	statsAt(x: number, z: number): WorldStreamingStats {
		return {
			activeChunks: this.active.size,
			loadingChunks: this.loading.size,
			cachedChunks: this.cache.size,
			currentChunkId: this.chunkAt(x, z)?.id ?? null
		};
	}

	dispose(): void {
		this.disposed = true;
		for (const meta of this.active.values()) this.sink.deactivate(meta);
		this.active.clear();
		this.activeHeights.clear();
		this.loading.clear();
		this.cache.clear();
	}

	private async beginLoad(meta: TerrainChunkMeta): Promise<void> {
		if (this.disposed || this.active.has(meta.id) || this.loading.has(meta.id)) return;

		const cached = this.cache.get(meta.id);
		if (cached) {
			this.cache.delete(meta.id);
			this.finishLoad(meta, cached);
			return;
		}

		this.loading.add(meta.id);
		let heights: TerrainChunkHeights;
		try {
			heights = parseTerrainChunk(await this.options.fetchChunk(meta.file));
		} catch (err) {
			this.loading.delete(meta.id);
			console.warn(`terrain chunk ${meta.id} failed to load:`, err);
			return;
		}
		this.loading.delete(meta.id);
		this.finishLoad(meta, heights);
	}

	private finishLoad(meta: TerrainChunkMeta, heights: TerrainChunkHeights): void {
		// A slow fetch may land after the rider has moved on, or after dispose.
		if (this.disposed || this.active.has(meta.id)) return;
		this.active.set(meta.id, meta);
		this.activeHeights.set(meta.id, heights);
		this.sink.activate(meta, heights);
	}

	private deactivate(meta: TerrainChunkMeta): void {
		this.active.delete(meta.id);
		const heights = this.activeHeights.get(meta.id);
		this.activeHeights.delete(meta.id);
		this.sink.deactivate(meta);
		if (heights) this.retain(meta.id, heights);
	}

	private retain(id: string, heights: TerrainChunkHeights): void {
		this.cache.set(id, heights);
		while (this.cache.size > this.cacheLimit) {
			const oldest = this.cache.keys().next().value;
			if (oldest === undefined) break;
			this.cache.delete(oldest);
		}
	}
}
