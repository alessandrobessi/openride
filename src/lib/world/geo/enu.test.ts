import { describe, expect, it } from 'vitest';
import { LocalFrame, STELVIO_ORIGIN, haversineDistanceM, type GeoPoint } from './enu';

const frame = new LocalFrame(STELVIO_ORIGIN);

describe('LocalFrame', () => {
	it('maps the origin to (0, 0, 0)', () => {
		const l = frame.toLocal(STELVIO_ORIGIN);
		expect(Math.hypot(l.x, l.y, l.z)).toBeLessThan(1e-6);
	});

	it('round-trips geodetic → local → geodetic to millimetre precision', () => {
		const points: GeoPoint[] = [
			{ latDeg: 46.535, lonDeg: 10.44, altM: 2500 },
			{ latDeg: 46.51, lonDeg: 10.47, altM: 1900 },
			{ latDeg: 46.5286, lonDeg: 10.4526, altM: 2758 }
		];
		for (const p of points) {
			const back = frame.toGeo(frame.toLocal(p));
			expect(back.latDeg).toBeCloseTo(p.latDeg, 8);
			expect(back.lonDeg).toBeCloseTo(p.lonDeg, 8);
			expect(back.altM).toBeCloseTo(p.altM, 3);
		}
	});

	it('east/north axes point the right way', () => {
		const east = frame.toLocal({ ...STELVIO_ORIGIN, lonDeg: STELVIO_ORIGIN.lonDeg + 0.01 });
		const north = frame.toLocal({ ...STELVIO_ORIGIN, latDeg: STELVIO_ORIGIN.latDeg + 0.01 });
		expect(east.x).toBeGreaterThan(0);
		expect(Math.abs(east.z)).toBeLessThan(Math.abs(east.x) * 0.02);
		expect(north.z).toBeGreaterThan(0);
		expect(Math.abs(north.x)).toBeLessThan(Math.abs(north.z) * 0.02);
	});

	it('local distances match the great-circle distance within a few metres', () => {
		const a: GeoPoint = { latDeg: 46.515, lonDeg: 10.42, altM: 2000 };
		const b: GeoPoint = { latDeg: 46.54, lonDeg: 10.46, altM: 2600 };
		const la = frame.toLocal({ ...a, altM: 0 });
		const lb = frame.toLocal({ ...b, altM: 0 });
		const planar = Math.hypot(lb.x - la.x, lb.z - la.z);
		const gc = haversineDistanceM(a, b);
		expect(Math.abs(planar - gc)).toBeLessThan(gc * 0.001 + 2);
	});

	it('1° of longitude at Stelvio latitude ≈ 76.5 km east', () => {
		const l = frame.toLocal({ ...STELVIO_ORIGIN, lonDeg: STELVIO_ORIGIN.lonDeg + 1, altM: 0 });
		// 111320 · cos(46.53°) ≈ 76.55 km
		expect(l.x).toBeGreaterThan(74_000);
		expect(l.x).toBeLessThan(79_000);
	});

	it('altitude maps almost straight to the up axis over 100 m', () => {
		const l = frame.toLocal({ ...STELVIO_ORIGIN, altM: STELVIO_ORIGIN.altM + 100 });
		expect(l.y).toBeCloseTo(100, 0);
		expect(Math.hypot(l.x, l.z)).toBeLessThan(1);
	});
});

describe('haversineDistanceM', () => {
	it('is zero for identical points and symmetric', () => {
		const a: GeoPoint = { latDeg: 46.5, lonDeg: 10.4, altM: 0 };
		const b: GeoPoint = { latDeg: 46.6, lonDeg: 10.5, altM: 0 };
		expect(haversineDistanceM(a, a)).toBe(0);
		expect(haversineDistanceM(a, b)).toBeCloseTo(haversineDistanceM(b, a), 6);
	});
});
