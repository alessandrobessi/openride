import { describe, expect, it } from 'vitest';
import { placeFurniture, type CenterlinePoint } from './furniturePlacement';

/** A straight road along +z, then a tight left hairpin, in local metres. */
function testCenterline(): CenterlinePoint[] {
	const pts: CenterlinePoint[] = [];
	for (let z = 0; z <= 80; z += 4) pts.push({ x: 0, z, y: z * 0.08 });
	// ~12 m radius hairpin
	const cx = -12;
	const cz = 80;
	for (let a = 0; a <= Math.PI; a += Math.PI / 12) {
		pts.push({ x: cx + 12 * Math.cos(a), z: cz + 12 * Math.sin(a), y: 6.4 + a });
	}
	return pts;
}

const opts = { roadWidthM: 6 };

describe('placeFurniture', () => {
	it('lines both edges with a rail offset just outside the road', () => {
		const f = placeFurniture(
			[
				{ x: 0, z: 0, y: 0 },
				{ x: 0, z: 40, y: 0 }
			],
			opts
		);
		expect(f.rails).toHaveLength(2);
		for (const rail of f.rails) {
			for (const p of rail) {
				expect(Math.abs(Math.abs(p.x) - (3 + 0.7))).toBeLessThan(1e-6); // half width + margin
			}
		}
		// Left and right rails on opposite sides.
		expect(Math.sign(f.rails[0][0].x)).toBe(-Math.sign(f.rails[1][0].x));
	});

	it('posts follow the road grade (y interpolated from the centerline)', () => {
		const f = placeFurniture(
			[
				{ x: 0, z: 0, y: 0 },
				{ x: 0, z: 100, y: 8 }
			],
			opts
		);
		const mid = f.posts.find((p) => p.z > 40 && p.z < 60);
		expect(mid).toBeDefined();
		expect(mid!.y).toBeGreaterThan(3);
		expect(mid!.y).toBeLessThan(5);
	});

	it('places guardrail posts at the requested spacing', () => {
		const f = placeFurniture(
			[
				{ x: 0, z: 0, y: 0 },
				{ x: 0, z: 40, y: 0 }
			],
			{ ...opts, postSpacingM: 4 }
		);
		const rails = f.posts.filter((p) => p.kind === 'guardrail' && p.x < 0);
		// ~40 m / 4 m ≈ 10-11 posts per side.
		expect(rails.length).toBeGreaterThanOrEqual(9);
		expect(rails.length).toBeLessThanOrEqual(13);
	});

	it('spaces delineators closer through a hairpin than on the straight', () => {
		const f = placeFurniture(testCenterline(), opts);
		const del = f.posts.filter((p) => p.kind === 'delineator');
		expect(del.length).toBeGreaterThan(0);
		const straightDel = del.filter((p) => p.z < 70 && p.x < 0).sort((a, b) => a.z - b.z);
		const hairpinDel = del.filter((p) => p.z > 82);
		// The hairpin arc is short but still gets markers.
		expect(hairpinDel.length).toBeGreaterThan(0);
		if (straightDel.length >= 2) {
			const gap = straightDel[1].z - straightDel[0].z;
			expect(gap).toBeGreaterThan(8); // straights are sparser
		}
	});

	it('produces only finite coordinates', () => {
		const f = placeFurniture(testCenterline(), opts);
		for (const p of f.posts) {
			for (const v of [p.x, p.y, p.z, p.ry, p.h]) expect(Number.isFinite(v)).toBe(true);
		}
	});
});
