import { describe, expect, it } from 'vitest';
import { engineAudioParams, FIRINGS_PER_REV, type EngineAudioInputs } from './engineAudioParams';

const base: EngineAudioInputs = {
	rpm: 1150,
	idleRpm: 1150,
	redlineRpm: 8500,
	throttle: 0,
	load01: 0,
	engineBraking: false,
	stalled: false
};

describe('engineAudioParams', () => {
	it('ties the fundamental to the firing frequency', () => {
		expect(engineAudioParams({ ...base, rpm: 3000 }).fundamentalHz).toBeCloseTo(
			(3000 / 60) * FIRINGS_PER_REV,
			3
		);
		// Clamped low at idle-ish revs, never zero.
		expect(engineAudioParams({ ...base, rpm: 0 }).fundamentalHz).toBeGreaterThan(0);
	});

	it('brightens and gets louder from idle to redline', () => {
		const idle = engineAudioParams({ ...base, rpm: 1150, throttle: 0.1 });
		const wot = engineAudioParams({ ...base, rpm: 8000, throttle: 1, load01: 0.8 });
		expect(wot.brightnessHz).toBeGreaterThan(idle.brightnessHz);
		expect(wot.toneGain).toBeGreaterThan(idle.toneGain);
		expect(wot.noiseGain).toBeGreaterThan(idle.noiseGain);
		expect(wot.masterGain).toBeGreaterThan(idle.masterGain);
	});

	it('goes silent when stalled', () => {
		expect(engineAudioParams({ ...base, rpm: 4000, throttle: 0.5, stalled: true }).masterGain).toBe(
			0
		);
	});

	it('adds a darker overrun burble on a closed-throttle descent', () => {
		const cruise = engineAudioParams({ ...base, rpm: 5000, throttle: 0.35 });
		const overrun = engineAudioParams({ ...base, rpm: 5000, throttle: 0, engineBraking: true });
		expect(cruise.overrunLevel).toBe(0);
		expect(overrun.overrunLevel).toBeGreaterThan(0);
		// Darker (lower noise centre) but still audible noise.
		expect(overrun.noiseCenterHz).toBeLessThan(cruise.noiseCenterHz);
		expect(overrun.noiseGain).toBeGreaterThan(0);
	});

	it('keeps every parameter finite and in range across a rev sweep', () => {
		for (let rpm = 0; rpm <= 9000; rpm += 250) {
			for (const throttle of [0, 0.5, 1]) {
				const p = engineAudioParams({ ...base, rpm, throttle, load01: throttle });
				for (const v of Object.values(p)) {
					expect(Number.isFinite(v)).toBe(true);
				}
				expect(p.masterGain).toBeGreaterThanOrEqual(0);
				expect(p.masterGain).toBeLessThanOrEqual(1);
				expect(p.brightnessHz).toBeGreaterThan(0);
			}
		}
	});
});
