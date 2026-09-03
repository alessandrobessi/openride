import { describe, expect, it } from 'vitest';
import { extractBuildings, type RawBuilding } from './buildingExtraction';

const square = (cx: number, cz: number, s = 8): RawBuilding['ring'] => [
	{ x: cx - s, z: cz - s },
	{ x: cx + s, z: cz - s },
	{ x: cx + s, z: cz + s },
	{ x: cx - s, z: cz + s }
];

const flatGround = () => 100;
const nearRoad = (x: number) => Math.abs(x); // road along x = 0

describe('extractBuildings', () => {
	it('keeps buildings near the road and drops distant ones', () => {
		const raw: RawBuilding[] = [
			{ ring: square(20, 0), tags: { building: 'yes' } },
			{ ring: square(400, 0), tags: { building: 'yes' } }
		];
		const out = extractBuildings(raw, nearRoad, flatGround, { maxRoadDistM: 120 });
		expect(out).toHaveLength(1);
		expect(out[0].footprint.length).toBe(4);
	});

	it('derives height from tags, falling back to the default', () => {
		const raw: RawBuilding[] = [
			{ ring: square(10, 0), tags: { building: 'yes', 'building:levels': '3' } },
			{ ring: square(10, 30), tags: { building: 'yes', height: '11' } },
			{ ring: square(10, 60), tags: { building: 'yes' } }
		];
		const [levels, height, plain] = extractBuildings(raw, nearRoad, flatGround, {
			maxRoadDistM: 200,
			metresPerLevel: 3.2,
			defaultHeightM: 6.5
		});
		expect(levels.heightM).toBeCloseTo(9.6, 5);
		expect(height.heightM).toBeCloseTo(11, 5);
		expect(plain.heightM).toBeCloseTo(6.5, 5);
	});

	it('sits the base on the lowest terrain under the footprint', () => {
		const slope = (_x: number, z: number) => 100 + z * 0.5;
		const [b] = extractBuildings([{ ring: square(10, 40), tags: {} }], nearRoad, slope, {
			maxRoadDistM: 200
		});
		// Footprint spans z 32..48 → lowest terrain at z=32.
		expect(b.baseY).toBeCloseTo(100 + 32 * 0.5, 1);
	});

	it('rejects tiny rings and open/degenerate ones', () => {
		const raw: RawBuilding[] = [
			{ ring: square(5, 0, 1), tags: {} }, // 2×2 m → area 4 < min
			{
				ring: [
					{ x: 0, z: 0 },
					{ x: 1, z: 0 }
				],
				tags: {}
			} // < 3 points
		];
		expect(extractBuildings(raw, nearRoad, flatGround, { maxRoadDistM: 999 })).toHaveLength(0);
	});

	it('strips a repeated closing vertex', () => {
		const ring = square(10, 0);
		const closed = [...ring, { ...ring[0] }];
		const [b] = extractBuildings([{ ring: closed, tags: {} }], nearRoad, flatGround, {
			maxRoadDistM: 200
		});
		expect(b.footprint).toHaveLength(4);
	});
});
