import { describe, expect, it } from 'vitest';
import { clutchTransferTorqueNm } from './Clutch';
import { ADVENTURE_1200 } from '../motorcycle/configs/adventure-1200';

const clutch = ADVENTURE_1200.powertrain.clutch;

describe('clutchTransferTorqueNm', () => {
	it('transmits nothing when fully disengaged', () => {
		expect(clutchTransferTorqueNm(0, 200, clutch)).toBe(0);
	});

	it('is k_c · Δω while below the engagement-scaled capacity', () => {
		// small slip, fully engaged: linear region
		expect(clutchTransferTorqueNm(1, 3, clutch)).toBeCloseTo(clutch.stiffnessNmPerRadS * 3, 6);
	});

	it('saturates at u_c · T_max for large slip', () => {
		expect(clutchTransferTorqueNm(0.5, 500, clutch)).toBeCloseTo(0.5 * clutch.maxTorqueNm, 6);
		expect(clutchTransferTorqueNm(1, 500, clutch)).toBeCloseTo(clutch.maxTorqueNm, 6);
	});

	it('is signed: the wheel back-drives the engine on the overrun', () => {
		expect(clutchTransferTorqueNm(1, -500, clutch)).toBeCloseTo(-clutch.maxTorqueNm, 6);
	});
});
