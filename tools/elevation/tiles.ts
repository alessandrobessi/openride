/**
 * Slippy-map (XYZ) tile maths and the AWS "elevation-tiles-prod" GeoTIFF
 * source — single-band Float32 elevation in metres, no authentication.
 * Terrain-tiles © Mapzen / AWS Open Data, from SRTM, GMTED and others.
 */
export const DEM_TILE_URL = (z: number, x: number, y: number) =>
	`https://s3.amazonaws.com/elevation-tiles-prod/geotiff/${z}/${x}/${y}.tif`;

export interface TileXY {
	z: number;
	x: number;
	y: number;
}

export function lonLatToTile(lonDeg: number, latDeg: number, z: number): { x: number; y: number } {
	const n = 2 ** z;
	const x = ((lonDeg + 180) / 360) * n;
	const latRad = (latDeg * Math.PI) / 180;
	const y = ((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2) * n;
	return { x, y };
}

export function tilesCoveringBbox(
	bbox: { south: number; west: number; north: number; east: number },
	z: number
): TileXY[] {
	const a = lonLatToTile(bbox.west, bbox.north, z);
	const b = lonLatToTile(bbox.east, bbox.south, z);
	const x0 = Math.floor(Math.min(a.x, b.x));
	const x1 = Math.floor(Math.max(a.x, b.x));
	const y0 = Math.floor(Math.min(a.y, b.y));
	const y1 = Math.floor(Math.max(a.y, b.y));
	const out: TileXY[] = [];
	for (let x = x0; x <= x1; x++) {
		for (let y = y0; y <= y1; y++) out.push({ z, x, y });
	}
	return out;
}

/** Geographic bounds of an XYZ tile (deg). */
export function tileBounds(t: TileXY): {
	west: number;
	east: number;
	south: number;
	north: number;
} {
	const n = 2 ** t.z;
	const lon = (x: number) => (x / n) * 360 - 180;
	const lat = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
	return { west: lon(t.x), east: lon(t.x + 1), north: lat(t.y), south: lat(t.y + 1) };
}
