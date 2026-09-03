import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertRoadPackage } from './RoadPackage';
import { LocalFrame } from '../geo/enu';

/** The committed Stelvio extraction — the offline pipeline's output for M14. */
const road = JSON.parse(
	readFileSync(resolve('static/worlds/stelvio/roads/ss38.json'), 'utf8')
) as ReturnType<typeof JSON.parse>;

describe('Stelvio SS38 road package', () => {
	it('is a structurally valid road package', () => {
		expect(() => assertRoadPackage(road)).not.toThrow();
	});

	it('is a substantial, contiguous centreline the length of the hairpin climb', () => {
		expect(road.centerline.length).toBeGreaterThan(800);
		expect(road.lengthM / 1000).toBeGreaterThan(6);
		expect(road.lengthM / 1000).toBeLessThan(14);
		expect(road.maxSegmentGapM).toBeLessThan(80); // no big stitch discontinuity
	});

	it('preserves the recognisable Stelvio hairpins', () => {
		expect(road.hairpinCount).toBeGreaterThanOrEqual(15);
	});

	it('kept useful OSM tags (asphalt pass road)', () => {
		expect(road.ref).toBe('SS38');
		expect(road.tags.highway).toBeTruthy();
		expect(road.tags.surface).toBe('asphalt');
	});

	it('centreline lies within its stated geographic bounds when reprojected', () => {
		const frame = new LocalFrame(road.origin);
		for (const p of road.centerline) {
			const g = frame.toGeo({ x: p.x, y: 0, z: p.z });
			expect(g.latDeg).toBeGreaterThanOrEqual(road.bounds.minLatDeg - 1e-4);
			expect(g.latDeg).toBeLessThanOrEqual(road.bounds.maxLatDeg + 1e-4);
			expect(g.lonDeg).toBeGreaterThanOrEqual(road.bounds.minLonDeg - 1e-4);
			expect(g.lonDeg).toBeLessThanOrEqual(road.bounds.maxLonDeg + 1e-4);
		}
	});
});
