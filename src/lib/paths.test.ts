import { describe, expect, it } from 'vitest';
import { asset } from './paths';

// `base` is '' in tests (no BASE_PATH), matching local dev and the e2e smoke.
describe('asset()', () => {
	it('joins a relative path under the base path', () => {
		expect(asset('worlds/stelvio/manifest.json')).toBe('/worlds/stelvio/manifest.json');
	});

	it('tolerates a leading slash without doubling it', () => {
		expect(asset('/worlds/stelvio/manifest.json')).toBe('/worlds/stelvio/manifest.json');
	});

	it('collapses multiple leading slashes', () => {
		expect(asset('///textures/asphalt.png')).toBe('/textures/asphalt.png');
	});
});
