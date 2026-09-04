import { describe, expect, it } from 'vitest';
import { FallRecovery, type FallRecoverySample } from './fallRecovery';

const SPAWN = { positionWorldM: { x: 0, y: 1, z: 0 }, headingRad: 0 };

const planted = (over: Partial<FallRecoverySample> = {}): FallRecoverySample => ({
	positionWorldM: { x: 10, y: 5, z: 20 },
	yawRad: 1.2,
	rollRad: 0.05,
	pitchRad: 0.02,
	forwardSpeedMps: 12,
	verticalSpeedMps: 0,
	frontContactGround: true,
	rearContactGround: true,
	...over
});

describe('FallRecovery', () => {
	it('does nothing while the bike is planted and upright', () => {
		const fr = new FallRecovery();
		for (let i = 0; i < 200; i++) {
			expect(fr.update(planted(), 1 / 120, SPAWN)).toBeNull();
		}
	});

	it('respawns at the last planted pose after a long fall, not at spawn', () => {
		const fr = new FallRecovery();
		// Ride along, planted, at a raised part of the course.
		const anchored = fr.update(
			planted({ positionWorldM: { x: 40, y: 60, z: -100 } }),
			1 / 120,
			SPAWN
		);
		expect(anchored).toBeNull();

		// Now off the edge and dropping.
		let respawn = null;
		for (let i = 0; i < 240 && !respawn; i++) {
			respawn = fr.update(
				planted({
					positionWorldM: { x: 44, y: 60 - i * 0.5, z: -104 },
					frontContactGround: false,
					rearContactGround: false
				}),
				1 / 120,
				SPAWN
			);
		}
		expect(respawn).not.toBeNull();
		expect(respawn!.positionWorldM.x).toBeCloseTo(40, 3);
		expect(respawn!.positionWorldM.z).toBeCloseTo(-100, 3);
		expect(respawn!.positionWorldM.y).toBeGreaterThan(60); // lifted a touch above the safe y
		expect(respawn!.headingRad).toBeCloseTo(1.2, 3);
	});

	it('falls back to the spawn pose if the bike was never planted', () => {
		const fr = new FallRecovery();
		let respawn = null;
		for (let i = 0; i < 240 && !respawn; i++) {
			respawn = fr.update(
				planted({
					positionWorldM: { x: 0, y: -i * 0.5, z: 0 },
					frontContactGround: false,
					rearContactGround: false
				}),
				1 / 120,
				SPAWN
			);
		}
		expect(respawn).not.toBeNull();
		expect(respawn!.positionWorldM.x).toBe(0);
		expect(respawn!.positionWorldM.z).toBe(0);
	});

	it('recovers a bike left lying on its side', () => {
		const fr = new FallRecovery();
		fr.update(planted(), 1 / 120, SPAWN); // one planted pose to anchor to
		let respawn = null;
		for (let i = 0; i < 600 && !respawn; i++) {
			// on its side, wheels off the ground, near where it crashed
			respawn = fr.update(
				planted({ rollRad: 2.6, frontContactGround: false, rearContactGround: false }),
				1 / 120,
				SPAWN
			);
		}
		expect(respawn).not.toBeNull();
	});

	it('tolerates a normal jump — a second or so airborne does not trigger', () => {
		const fr = new FallRecovery();
		fr.update(planted(), 1 / 120, SPAWN);
		for (let i = 0; i < 120; i++) {
			// ~1 s airborne but level and near the last safe height
			expect(
				fr.update(planted({ frontContactGround: false, rearContactGround: false }), 1 / 120, SPAWN)
			).toBeNull();
		}
	});

	it('recovers from a NaN position immediately', () => {
		const fr = new FallRecovery();
		fr.update(planted(), 1 / 120, SPAWN);
		const out = fr.update(planted({ positionWorldM: { x: NaN, y: NaN, z: NaN } }), 1 / 120, SPAWN);
		expect(out).not.toBeNull();
	});
});
