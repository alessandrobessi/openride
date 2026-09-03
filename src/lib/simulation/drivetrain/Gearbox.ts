import { clamp } from '../core/math';
import type { GearboxConfig } from '../motorcycle/config';

/**
 * Sequential gearbox (MOTORCYCLE-PHYSICS.md §19–20, OPENRIDE-BLUEPRINT.md §16).
 *
 * Total reduction for a gear `i`:
 *
 *   R = R_primary · G_i · R_final
 *
 * Gear 0 is neutral (R = 0): the engine is mechanically decoupled from the rear
 * wheel. On a shift a brief combustion torque cut (`shiftCutTimeS`) smooths the
 * change; the gear itself changes immediately.
 *
 * Pure — integrates only its own shift-cut timer.
 */
export class Gearbox {
	gear = 0;

	private readonly config: GearboxConfig;
	private readonly topGear: number;
	private shiftCutRemainingS = 0;

	constructor(config: GearboxConfig) {
		this.config = config;
		this.topGear = config.gearRatios.length - 1; // index 0 = neutral
	}

	get isNeutral(): boolean {
		return this.gear === 0;
	}

	get torqueCutActive(): boolean {
		return this.shiftCutRemainingS > 0;
	}

	/** Combined primary · gear · final reduction for the current gear (0 in neutral). */
	totalRatio(): number {
		if (this.gear === 0) return 0;
		return (
			this.config.primaryRatio * this.config.gearRatios[this.gear] * this.config.finalDriveRatio
		);
	}

	/** Select a gear (clamped to [0, topGear]); triggers the shift cut if it changed. */
	selectGear(gear: number): void {
		const next = clamp(Math.round(gear), 0, this.topGear);
		if (next !== this.gear) {
			this.gear = next;
			this.shiftCutRemainingS = this.config.shiftCutTimeS;
		}
	}

	shiftUp(): void {
		this.selectGear(this.gear + 1);
	}

	shiftDown(): void {
		this.selectGear(this.gear - 1);
	}

	/** Advance the shift-cut timer by one step. */
	update(dtS: number): void {
		if (this.shiftCutRemainingS > 0) {
			this.shiftCutRemainingS = Math.max(0, this.shiftCutRemainingS - dtS);
		}
	}
}
