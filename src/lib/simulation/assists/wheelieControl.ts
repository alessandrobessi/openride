import { smoothstep } from '../core/math';
import type { WheelieControlConfig } from './AssistConfig';

/**
 * Wheelie control (MOTORCYCLE-PHYSICS.md §58): as the front normal-load fraction
 * falls toward `minimumFrontLoadFraction`, progressively cut drive torque. Does
 * not force the front wheel down geometrically — it only reduces torque.
 */
export class WheelieControl {
	active = false;

	constructor(private readonly config: WheelieControlConfig) {}

	/**
	 * @param driveTorqueNm      requested rear-wheel drive torque
	 * @param frontLoadFraction  F_zf / (F_zf + F_zr), 0..1
	 */
	limit(driveTorqueNm: number, frontLoadFraction: number): number {
		if (!this.config.enabled || driveTorqueNm <= 0) {
			this.active = false;
			return driveTorqueNm;
		}
		const minFrac = this.config.minimumFrontLoadFraction;
		// 0 at/below the limit, back to full torque within a narrow band above it
		// (so it only bites when the front is genuinely going light, not always).
		const factor = smoothstep(minFrac, minFrac + 0.12, frontLoadFraction);
		this.active = factor < 0.999;
		return driveTorqueNm * factor;
	}
}
