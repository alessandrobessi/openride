import { describe, expect, it } from 'vitest';
import { windAudioParams, WIND_REFERENCE_MPS } from './windAudioParams';

describe('windAudioParams', () => {
	it('is silent at a standstill', () => {
		const p = windAudioParams(0);
		expect(p.level).toBe(0);
		expect(p.buffetLevel).toBe(0);
	});

	it('rises steeply and brightens with speed', () => {
		const slow = windAudioParams(10);
		const fast = windAudioParams(45);
		expect(fast.level).toBeGreaterThan(slow.level);
		expect(fast.cutoffHz).toBeGreaterThan(slow.cutoffHz);
		// Super-linear: doubling speed more than doubles the level.
		expect(windAudioParams(40).level).toBeGreaterThan(2 * windAudioParams(20).level);
	});

	it('clamps level and keeps params finite past the reference speed', () => {
		const p = windAudioParams(WIND_REFERENCE_MPS * 3);
		expect(p.level).toBeLessThanOrEqual(1);
		expect(Number.isFinite(p.cutoffHz)).toBe(true);
		expect(Number.isFinite(p.buffetLevel)).toBe(true);
	});

	it('treats reverse speed like forward speed', () => {
		expect(windAudioParams(-30).level).toBeCloseTo(windAudioParams(30).level, 6);
	});
});
