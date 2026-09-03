import type { Vec3 } from '../../simulation/core/math';

/**
 * Geodetic ↔ local Cartesian conversion (OPENRIDE-BLUEPRINT.md §8, AGENTS.md
 * §8).
 *
 * The simulation only ever sees metres in a local **ENU** frame about a fixed
 * world origin, mapped to OpenRide's world axes:
 *
 *   x = east   y = up   z = north
 *
 * Latitude/longitude must be converted here before entering any rigid-body
 * calculation. Pure — no Three.js, no Rapier — so the offline world builder and
 * the runtime share it.
 *
 * Method: geodetic → ECEF (WGS84 ellipsoid) → ENU rotation about the origin,
 * and the exact inverse (Bowring's method for ECEF → geodetic). Accurate to a
 * few millimetres over a Stelvio-sized region.
 */

export interface GeoPoint {
	latDeg: number;
	lonDeg: number;
	/** Height above the WGS84 ellipsoid, metres. */
	altM: number;
}

// WGS84
const A = 6378137.0; // semi-major axis, m
const F = 1 / 298.257223563; // flattening
const E2 = F * (2 - F); // first eccentricity squared

const DEG = Math.PI / 180;

interface Ecef {
	x: number;
	y: number;
	z: number;
}

function geodeticToEcef(p: GeoPoint): Ecef {
	const lat = p.latDeg * DEG;
	const lon = p.lonDeg * DEG;
	const sinLat = Math.sin(lat);
	const cosLat = Math.cos(lat);
	const n = A / Math.sqrt(1 - E2 * sinLat * sinLat); // prime vertical radius
	return {
		x: (n + p.altM) * cosLat * Math.cos(lon),
		y: (n + p.altM) * cosLat * Math.sin(lon),
		z: (n * (1 - E2) + p.altM) * sinLat
	};
}

function ecefToGeodetic(e: Ecef): GeoPoint {
	const lon = Math.atan2(e.y, e.x);
	const p = Math.hypot(e.x, e.y);
	// Iterative fixed point (Hirvonen). Converges in a few steps near the surface.
	let lat = Math.atan2(e.z, p * (1 - E2));
	let n = A;
	for (let i = 0; i < 8; i++) {
		const sinLat = Math.sin(lat);
		n = A / Math.sqrt(1 - E2 * sinLat * sinLat);
		const h = p / Math.cos(lat) - n;
		lat = Math.atan2(e.z, p * (1 - (E2 * n) / (n + h)));
	}
	const altM = p / Math.cos(lat) - n;
	return { latDeg: lat / DEG, lonDeg: lon / DEG, altM };
}

/**
 * A converter anchored at a world origin. Reuse one instance per world.
 */
export class LocalFrame {
	readonly origin: GeoPoint;
	private readonly originEcef: Ecef;
	private readonly sinLat: number;
	private readonly cosLat: number;
	private readonly sinLon: number;
	private readonly cosLon: number;

	constructor(origin: GeoPoint) {
		this.origin = { ...origin };
		this.originEcef = geodeticToEcef(origin);
		const lat = origin.latDeg * DEG;
		const lon = origin.lonDeg * DEG;
		this.sinLat = Math.sin(lat);
		this.cosLat = Math.cos(lat);
		this.sinLon = Math.sin(lon);
		this.cosLon = Math.cos(lon);
	}

	/** Geodetic → local ENU metres (x = east, y = up, z = north). */
	toLocal(p: GeoPoint): Vec3 {
		const e = geodeticToEcef(p);
		const dx = e.x - this.originEcef.x;
		const dy = e.y - this.originEcef.y;
		const dz = e.z - this.originEcef.z;
		const east = -this.sinLon * dx + this.cosLon * dy;
		const north =
			-this.sinLat * this.cosLon * dx - this.sinLat * this.sinLon * dy + this.cosLat * dz;
		const up = this.cosLat * this.cosLon * dx + this.cosLat * this.sinLon * dy + this.sinLat * dz;
		return { x: east, y: up, z: north };
	}

	/** Local ENU metres → geodetic. */
	toGeo(local: Vec3): GeoPoint {
		const east = local.x;
		const up = local.y;
		const north = local.z;
		const dx =
			-this.sinLon * east - this.sinLat * this.cosLon * north + this.cosLat * this.cosLon * up;
		const dy =
			this.cosLon * east - this.sinLat * this.sinLon * north + this.cosLat * this.sinLon * up;
		const dz = this.cosLat * north + this.sinLat * up;
		return ecefToGeodetic({
			x: this.originEcef.x + dx,
			y: this.originEcef.y + dy,
			z: this.originEcef.z + dz
		});
	}
}

/** Great-circle distance between two points, metres (mean Earth radius). Validation helper. */
export function haversineDistanceM(a: GeoPoint, b: GeoPoint): number {
	const R = 6371008.8;
	const dLat = (b.latDeg - a.latDeg) * DEG;
	const dLon = (b.lonDeg - a.lonDeg) * DEG;
	const s =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(a.latDeg * DEG) * Math.cos(b.latDeg * DEG) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * World origin for the Stelvio prototype — Passo dello Stelvio summit. The
 * offline world builder writes the authoritative origin into the world manifest
 * (M18); this constant anchors the coordinate module and its tests until then.
 */
export const STELVIO_ORIGIN: GeoPoint = { latDeg: 46.52859, lonDeg: 10.45259, altM: 2758 };
