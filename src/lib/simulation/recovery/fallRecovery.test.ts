import { describe, expect, it } from 'vitest';
import { FallRecovery, type FallRecoverySample } from './fallRecovery';

const SPAWN = { positionWorldM: { x: 3, y: 1, z: -12 }, headingRad: 3.14 };

const riding = (over: Partial<FallRecoverySample> = {}): FallRecoverySample => ({
	positionWorldM: { x: 3, y: 1, z: -20 },
	verticalSpeedMps: 0,
	rollRad: 0.2,
	frontContactGround: true,
	rearContactGround: true,
	...over
});

describe('FallRecovery', () => {
	it('does nothing while the bike is on the ground near ride height', () => {
		const fr = new FallRecovery();
		for (let i = 0; i < 400; i++) {
			expect(fr.update(riding({ rollRad: 0.45 }), 1 / 120, SPAWN)).toBeNull();
		}
	});

	it('recovers to the spawn after a deep drop', () => {
		const fr = new FallRecovery();
		let out = null;
		for (let i = 0; i < 240 && !out; i++) {
			out = fr.update(
				riding({
					positionWorldM: { x: 40, y: 1 - i * 0.4, z: -60 },
					frontContactGround: false,
					rearContactGround: false
				}),
				1 / 120,
				SPAWN
			);
		}
		expect(out).not.toBeNull();
		expect(out!.positionWorldM.x).toBe(SPAWN.positionWorldM.x);
		expect(out!.positionWorldM.z).toBe(SPAWN.positionWorldM.z);
		expect(out!.positionWorldM.y).toBeGreaterThan(SPAWN.positionWorldM.y); // lifted a touch
		expect(out!.headingRad).toBe(SPAWN.headingRad);
	});

	it('recovers a bike wheels-up on a slope that never drops far (sustained plunge)', () => {
		const fr = new FallRecovery();
		let out = null;
		for (let i = 0; i < 400 && !out; i++) {
			// on the terrain, one wheel skimming, sliding downhill fast but only a
			// couple of metres below spawn height
			out = fr.update(
				riding({
					positionWorldM: { x: 25, y: -1, z: -5 },
					verticalSpeedMps: -9,
					frontContactGround: true,
					rearContactGround: false
				}),
				1 / 120,
				SPAWN
			);
		}
		expect(out).not.toBeNull();
	});

	it('recovers a bike left on its side', () => {
		const fr = new FallRecovery();
		let out = null;
		for (let i = 0; i < 600 && !out; i++) {
			out = fr.update(
				riding({ rollRad: 2.6, frontContactGround: false, rearContactGround: false }),
				1 / 120,
				SPAWN
			);
		}
		expect(out).not.toBeNull();
	});

	it('tolerates a normal jump — a second or so airborne, level, near height', () => {
		const fr = new FallRecovery();
		for (let i = 0; i < 150; i++) {
			expect(
				fr.update(
					riding({ frontContactGround: false, rearContactGround: false, verticalSpeedMps: -3 }),
					1 / 120,
					SPAWN
				)
			).toBeNull();
		}
	});

	it('recovers from a NaN position immediately', () => {
		const fr = new FallRecovery();
		const out = fr.update(riding({ positionWorldM: { x: NaN, y: NaN, z: NaN } }), 1 / 120, SPAWN);
		expect(out).not.toBeNull();
	});
});
