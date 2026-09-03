import { describe, expect, it } from 'vitest';
import { ASPHALT, tireAudioParams, type TireSurface } from './tireAudioParams';

const at = (
	speedMps: number,
	over: Partial<{ surface: TireSurface; gripUtilization: number }> = {}
) =>
	tireAudioParams({
		speedMps,
		surface: over.surface ?? ASPHALT,
		gripUtilization: over.gripUtilization ?? 0
	});

describe('tireAudioParams', () => {
	it('is silent at a standstill and grows with speed', () => {
		expect(at(0).level).toBe(0);
		expect(at(30).level).toBeGreaterThan(at(8).level);
		expect(at(30).cutoffHz).toBeGreaterThan(at(8).cutoffHz);
	});

	it('a rougher surface is louder, darker and grainier', () => {
		const smooth = at(25, { surface: { roughness: 0.05, loudness: 1 } });
		const coarse = at(25, { surface: { roughness: 0.8, loudness: 1 } });
		expect(coarse.level).toBeGreaterThan(smooth.level);
		expect(coarse.cutoffHz).toBeLessThan(smooth.cutoffHz);
		expect(coarse.grainLevel).toBeGreaterThan(smooth.grainLevel);
	});

	it('adds scrub only when grip is worked near the limit', () => {
		const cruise = at(25, { gripUtilization: 0.3 });
		const onTheLimit = at(25, { gripUtilization: 1.0 });
		expect(onTheLimit.level).toBeGreaterThan(cruise.level);
	});

	it('keeps every parameter finite and bounded across a speed sweep', () => {
		for (let v = 0; v <= 80; v += 5) {
			const p = at(v, { gripUtilization: 0.9 });
			expect(p.level).toBeGreaterThanOrEqual(0);
			expect(p.level).toBeLessThanOrEqual(1);
			expect(p.grainLevel).toBeLessThanOrEqual(1);
			expect(p.cutoffHz).toBeGreaterThan(0);
		}
	});
});
