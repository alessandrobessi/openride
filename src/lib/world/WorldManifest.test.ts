import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertWorldManifest, WORLD_MANIFEST_VERSION, type WorldManifest } from './WorldManifest';

/** The committed Stelvio world package — the offline pipeline's output for M18. */
const stelvio = JSON.parse(
	readFileSync(resolve('static/worlds/stelvio/manifest.json'), 'utf8')
) as unknown;

function valid(): WorldManifest {
	return {
		version: WORLD_MANIFEST_VERSION,
		id: 'demo',
		name: 'Demo World',
		origin: { latDeg: 46.5, lonDeg: 10.5, altM: 1600 },
		spawn: { x: 0, y: 1, z: 0, headingRad: 0 },
		assets: { roads: 'roads', terrain: 'terrain' }
	};
}

describe('WorldManifest schema', () => {
	it('accepts a well-formed manifest', () => {
		expect(() => assertWorldManifest(valid())).not.toThrow();
	});

	it('rejects a non-object', () => {
		expect(() => assertWorldManifest(null)).toThrow(/not an object/);
		expect(() => assertWorldManifest('x')).toThrow(/not an object/);
	});

	it('rejects an unknown schema version', () => {
		expect(() => assertWorldManifest({ ...valid(), version: 99 })).toThrow(
			/unsupported version 99/
		);
		expect(() => assertWorldManifest({ ...valid(), version: undefined })).toThrow(/unsupported/);
	});

	it('rejects a missing or out-of-range origin', () => {
		expect(() => assertWorldManifest({ ...valid(), origin: undefined })).toThrow(/origin/);
		expect(() =>
			assertWorldManifest({ ...valid(), origin: { latDeg: 200, lonDeg: 10, altM: 0 } })
		).toThrow(/origin/);
		expect(() =>
			assertWorldManifest({ ...valid(), origin: { latDeg: 46, lonDeg: 10, altM: NaN } })
		).toThrow(/origin/);
	});

	it('rejects a non-finite spawn', () => {
		expect(() =>
			assertWorldManifest({ ...valid(), spawn: { x: 0, y: 0, z: 0, headingRad: Infinity } })
		).toThrow(/spawn/);
		expect(() => assertWorldManifest({ ...valid(), spawn: { x: 0, y: 0, z: 0 } })).toThrow(/spawn/);
	});

	it('rejects missing or unsafe asset paths', () => {
		expect(() => assertWorldManifest({ ...valid(), assets: undefined })).toThrow(/missing assets/);
		expect(() =>
			assertWorldManifest({ ...valid(), assets: { roads: 'roads', terrain: '' } })
		).toThrow(/assets\.terrain/);
		expect(() =>
			assertWorldManifest({ ...valid(), assets: { roads: '/etc', terrain: 'terrain' } })
		).toThrow(/must be relative/);
		expect(() =>
			assertWorldManifest({ ...valid(), assets: { roads: '../x', terrain: 'terrain' } })
		).toThrow(/must be relative/);
	});
});

describe('Stelvio world manifest', () => {
	it('is structurally valid', () => {
		expect(() => assertWorldManifest(stelvio)).not.toThrow();
	});

	it('anchors the local frame on the Stelvio climb and spawns near its origin', () => {
		assertWorldManifest(stelvio);
		expect(stelvio.id).toBe('stelvio');
		expect(stelvio.origin.latDeg).toBeCloseTo(46.5476, 3);
		expect(stelvio.origin.lonDeg).toBeCloseTo(10.5055, 3);
		expect(Math.hypot(stelvio.spawn.x, stelvio.spawn.z)).toBeLessThan(50);
		expect(stelvio.assets.roads).toBe('roads');
		expect(stelvio.assets.terrain).toBe('terrain');
	});
});
