import type { PowertrainConfig } from '../motorcycle/config';
import { clutchTransferTorqueNm } from './Clutch';
import { Gearbox } from './Gearbox';

/**
 * Couples the engine crankshaft to the rear contact patch through the clutch,
 * gearbox and final drive (MOTORCYCLE-PHYSICS.md §19–24, OPENRIDE-BLUEPRINT.md
 * §16).
 *
 * The rear wheel has its own angular state from M10 (§36): the drivetrain
 * delivers a *torque* to it, and the tyre model turns wheel spin vs ground
 * speed into the contact force (with a grip limit).
 *
 *   ω_drivetrain(engine side) = ω_r · R              (§22)
 *   Δω  = ω_engine − ω_drivetrain
 *   T_c = clutch(u_c, Δω)                             (§21)   [engine-side]
 *   T_wheel = T_c · R · η                             (§19)   [to the rear wheel]
 *
 * `T_c` is also the reaction torque on the crank — fed back to `Engine.update`
 * as its load. On the overrun (`Δω < 0`) it is negative: engine braking reaches
 * the wheel.
 */
export interface DrivetrainSolution {
	/** Reaction torque on the crankshaft, N·m (feed to Engine as load). */
	engineLoadTorqueNm: number;
	/** Drive torque delivered to the rear wheel, N·m (+ = accelerating). */
	rearWheelTorqueNm: number;
	totalRatio: number;
}

export class Drivetrain {
	readonly gearbox: Gearbox;

	private readonly clutchConfig: PowertrainConfig['clutch'];
	private readonly efficiency: number;

	constructor(powertrain: PowertrainConfig) {
		this.gearbox = new Gearbox(powertrain.gearbox);
		this.clutchConfig = powertrain.clutch;
		this.efficiency = powertrain.gearbox.efficiency;
	}

	update(dtS: number): void {
		this.gearbox.update(dtS);
	}

	solve(
		engineOmegaRadS: number,
		rearWheelOmegaRadS: number,
		clutchEngagementU01: number
	): DrivetrainSolution {
		const totalRatio = this.gearbox.totalRatio();

		if (this.gearbox.isNeutral) {
			// Gearbox open: no torque path regardless of clutch state.
			return { engineLoadTorqueNm: 0, rearWheelTorqueNm: 0, totalRatio: 0 };
		}

		const drivetrainOmegaAtEngine = rearWheelOmegaRadS * totalRatio;
		const deltaOmega = engineOmegaRadS - drivetrainOmegaAtEngine;

		let clutchTorqueNm = clutchTransferTorqueNm(clutchEngagementU01, deltaOmega, this.clutchConfig);
		if (this.gearbox.torqueCutActive) clutchTorqueNm = 0; // smooth the shift

		return {
			engineLoadTorqueNm: clutchTorqueNm,
			rearWheelTorqueNm: clutchTorqueNm * totalRatio * this.efficiency,
			totalRatio
		};
	}
}
