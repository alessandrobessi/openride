import { describe, expect, it } from 'vitest';
import { suspensionForceN } from './suspension';
import { ADVENTURE_1200 } from '../motorcycle/configs/adventure-1200';

const rear = ADVENTURE_1200.chassis.suspension.rear;

describe('suspensionForceN', () => {
	it('is zero when the strut is topped out or airborne', () => {
		expect(suspensionForceN({ compressionM: 0, compressionVelMps: 0 }, rear)).toBe(0);
		expect(suspensionForceN({ compressionM: -0.05, compressionVelMps: 0 }, rear)).toBe(0);
	});

	it('rises linearly with compression through the spring rate', () => {
		const at2 = suspensionForceN({ compressionM: 0.02, compressionVelMps: 0 }, rear);
		const at4 = suspensionForceN({ compressionM: 0.04, compressionVelMps: 0 }, rear);
		expect(at4 - at2).toBeCloseTo(rear.springRateNPerM * 0.02, 3);
		expect(at2).toBeCloseTo(rear.springRateNPerM * 0.02, 3);
	});

	it('uses stiffer rebound damping than compression damping', () => {
		const compressing = suspensionForceN({ compressionM: 0.05, compressionVelMps: 0.3 }, rear);
		const reboundingSame = suspensionForceN({ compressionM: 0.05, compressionVelMps: -0.3 }, rear);
		const staticForce = suspensionForceN({ compressionM: 0.05, compressionVelMps: 0 }, rear);
		expect(compressing - staticForce).toBeCloseTo(rear.dampingCompressionNsPerM * 0.3, 2);
		expect(staticForce - reboundingSame).toBeCloseTo(rear.dampingReboundNsPerM * 0.3, 2);
	});

	it('adds a stiff bump-stop force past full travel', () => {
		const atTravel = suspensionForceN({ compressionM: rear.travelM, compressionVelMps: 0 }, rear);
		const past = suspensionForceN(
			{ compressionM: rear.travelM + 0.01, compressionVelMps: 0 },
			rear
		);
		expect(past - atTravel).toBeGreaterThan(1000); // far steeper than the main spring
	});

	it('never pulls (force stays ≥ 0 under strong rebound)', () => {
		expect(suspensionForceN({ compressionM: 0.01, compressionVelMps: -5 }, rear)).toBe(0);
	});
});
