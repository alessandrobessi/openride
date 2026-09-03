import { clamp } from '../core/math';
import type { TractionControlConfig } from './AssistConfig';

/**
 * Traction control (MOTORCYCLE-PHYSICS.md §57): when rear *drive* slip exceeds
 * the activation threshold, reduce the requested engine torque (here: the
 * throttle command) proportionally to (slip − target). Acts on torque, never on
 * vehicle or wheel speed.
 */
export class TractionControl {
	active = false;

	constructor(private readonly config: TractionControlConfig) {}

	/**
	 * @param throttleRequest01  rider throttle, 0..1
	 * @param rearSlipRatio      current rear longitudinal slip (positive = spin)
	 * @returns limited throttle, 0..1
	 */
	limit(throttleRequest01: number, rearSlipRatio: number): number {
		if (!this.config.enabled || rearSlipRatio <= this.config.activationSlip) {
			this.active = false;
			return throttleRequest01;
		}
		this.active = true;
		const excess = rearSlipRatio - this.config.targetSlip;
		const cut = clamp(this.config.torqueReductionGain * excess, 0, 1);
		return clamp(throttleRequest01 * (1 - cut), 0, 1);
	}
}
