import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fromFile } from 'geotiff';

const MERC_R = 6378137;

function lonLatToMercator(lonDeg: number, latDeg: number): { x: number; y: number } {
	const latRad = (latDeg * Math.PI) / 180;
	return {
		x: MERC_R * ((lonDeg * Math.PI) / 180),
		y: MERC_R * Math.log(Math.tan(Math.PI / 4 + latRad / 2))
	};
}

interface DemTile {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
	width: number;
	height: number;
	resX: number;
	resY: number;
	data: Float32Array | Float64Array | Int16Array | Uint16Array;
}

/**
 * Bilinear elevation lookup over a set of AWS terrain GeoTIFF tiles
 * (EPSG:3857, single-band metres). Load once, sample many.
 */
export class DemSampler {
	private constructor(private readonly tiles: DemTile[]) {}

	static async load(dir: string): Promise<DemSampler> {
		const files = readdirSync(dir).filter((f) => f.endsWith('.tif'));
		if (files.length === 0) throw new Error(`No DEM tiles in ${dir} — run pnpm world:fetch-dem`);
		const tiles: DemTile[] = [];
		for (const f of files) {
			const tiff = await fromFile(resolve(dir, f));
			const img = await tiff.getImage();
			const [minX, minY, maxX, maxY] = img.getBoundingBox();
			const rasters = await img.readRasters();
			tiles.push({
				minX,
				minY,
				maxX,
				maxY,
				width: img.getWidth(),
				height: img.getHeight(),
				resX: (maxX - minX) / img.getWidth(),
				resY: (maxY - minY) / img.getHeight(),
				data: rasters[0] as DemTile['data']
			});
		}
		return new DemSampler(tiles);
	}

	/** Metres above sea level at a geographic point (bilinear). NaN if outside all tiles. */
	elevationAt(lonDeg: number, latDeg: number): number {
		const m = lonLatToMercator(lonDeg, latDeg);
		const tile = this.tiles.find(
			(t) => m.x >= t.minX && m.x <= t.maxX && m.y >= t.minY && m.y <= t.maxY
		);
		if (!tile) return Number.NaN;

		// Pixel coordinates (origin top-left, +y downward in the raster).
		const px = (m.x - tile.minX) / tile.resX - 0.5;
		const py = (tile.maxY - m.y) / tile.resY - 0.5;
		const x0 = Math.max(0, Math.min(tile.width - 1, Math.floor(px)));
		const y0 = Math.max(0, Math.min(tile.height - 1, Math.floor(py)));
		const x1 = Math.min(tile.width - 1, x0 + 1);
		const y1 = Math.min(tile.height - 1, y0 + 1);
		const fx = Math.max(0, Math.min(1, px - x0));
		const fy = Math.max(0, Math.min(1, py - y0));

		const at = (x: number, y: number) => tile.data[y * tile.width + x] as number;
		const top = at(x0, y0) * (1 - fx) + at(x1, y0) * fx;
		const bot = at(x0, y1) * (1 - fx) + at(x1, y1) * fx;
		return top * (1 - fy) + bot * fy;
	}
}
