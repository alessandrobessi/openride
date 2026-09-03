import { clamp } from '../core/math';
import type { AbsConfig } from './AssistConfig';

/**
 * Anti-lock braking (MOTORCYCLE-PHYSICS.md §56). One instance per wheel.
 *
 * Holds a modulation factor `m ∈ [m_min, 1]`. While braking slip is deeper than
 * `activationSlip`, `m` bleeds off at `releaseRatePerS`; once slip recovers past
 * `targetSlip`, `m` is restored at `recoveryRatePerS`. Effective brake input is
 * `u_brake · m`. Rate-limited so it modulates rather than chatters (§56).
 *
 * Never touches wheel speed or velocity — only the commanded brake.
 */
const MIN_MODULATION = 0.02;

export class Abs {
	private modulation = 1;
	active = false;

	constructor(private readonly config: AbsConfig) {}

	reset(): void {
		this.modulation = 1;
		this.active = false;
	}

	/**
	 * @param brakeInput01  commanded brake, 0..1
	 * @param slipRatio     current longitudinal slip (negative under braking)
	 * @returns effective brake input, 0..1
	 */
	modulate(brakeInput01: number, slipRatio: number, dtS: number): number {
		if (!this.config.enabled || brakeInput01 <= 0) {
			this.modulation = 1;
			this.active = false;
			return brakeInput01;
		}

		if (slipRatio < this.config.activationSlip) {
			this.active = true;
			this.modulation = Math.max(
				MIN_MODULATION,
				this.modulation - this.config.releaseRatePerS * dtS
			);
		} else if (slipRatio > this.config.targetSlip) {
			this.modulation = Math.min(1, this.modulation + this.config.recoveryRatePerS * dtS);
			if (this.modulation >= 1) this.active = false;
		}
		// In the target..activation band: hold.

		return clamp(brakeInput01 * this.modulation, 0, 1);
	}
}
