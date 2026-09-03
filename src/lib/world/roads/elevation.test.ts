import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RoadPackage } from './RoadPackage';

const road = JSON.parse(
	readFileSync(resolve('static/worlds/stelvio/roads/ss38.json'), 'utf8')
) as RoadPackage;

describe('Stelvio SS38 elevation profile (M15)', () => {
	it('every centreline point has a finite local up (y)', () => {
		expect(road.centerline.every((p) => Number.isFinite(p.y))).toBe(true);
	});

	it('sits in the real altitude band of the pass region', () => {
		const e = road.elevation!;
		expect(e).toBeTruthy();
		expect(e.minM).toBeGreaterThan(1400);
		expect(e.maxM).toBeLessThan(2900);
	});

	it('is a substantial, mostly-uphill climb', () => {
		const e = road.elevation!;
		expect(e.endM).toBeGreaterThan(e.startM + 400); // net gain
		expect(e.totalClimbM).toBeGreaterThan(500);
		// average grade over the run
		expect((e.endM - e.startM) / road.lengthM).toBeGreaterThan(0.04);
	});

	it('grade is bounded to a plausible road value (no DEM switchback spikes)', () => {
		expect(road.elevation!.maxGradePct).toBeLessThanOrEqual(15);
		// spot-check against the point data
		let worst = 0;
		for (let i = 1; i < road.centerline.length; i++) {
			const a = road.centerline[i - 1];
			const b = road.centerline[i];
			const run = Math.hypot(b.x - a.x, b.z - a.z);
			if (run > 2) worst = Math.max(worst, Math.abs(((b.y ?? 0) - (a.y ?? 0)) / run));
		}
		expect(worst).toBeLessThan(0.2);
	});

	it('local y is consistent with the elevation range (relative to the origin altitude)', () => {
		const ys = road.centerline.map((p) => p.y ?? 0);
		const span = Math.max(...ys) - Math.min(...ys);
		expect(span).toBeGreaterThan(road.elevation!.maxM - road.elevation!.minM - 20);
		expect(span).toBeLessThan(road.elevation!.maxM - road.elevation!.minM + 20);
	});
});
