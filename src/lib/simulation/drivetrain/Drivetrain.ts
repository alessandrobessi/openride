import type { GeometryConfig, PowertrainConfig } from '../motorcycle/config';
import { clutchTransferTorqueNm } from './Clutch';
import { Gearbox } from './Gearbox';

/**
 * Couples the engine crankshaft to the rear contact patch through the clutch,
 * gearbox and final drive (MOTORCYCLE-PHYSICS.md §19–24, OPENRIDE-BLUEPRINT.md
 * §16).
 *
 * **M6 simplification**: no wheel slip yet — the rear wheel is kinematically
 * locked to ground speed (`ω_r = v / r_r`). Slip ratio, a real wheel spin state
 * and grip-limited drive force arrive in M10 (§32, §36).
 *
 *   ω_drivetrain(engine side) = ω_r · R              (§22)
 *   Δω  = ω_engine − ω_drivetrain
 *   T_c = clutch(u_c, Δω)                             (§21)   [engine-side]
 *   T_wheel = T_c · R · η                             (§19)
 *   F_drive = T_wheel / r_r                           (§24, grip-limited from M10)
 *
 * `T_c` is also the reaction torque on the crank — fed back to `Engine.update`
 * as its load. On the overrun (`Δω < 0`) it is negative: engine braking reaches
 * the wheel.
 */
export interface DrivetrainSolution {
	/** Reaction torque on the crankshaft, N·m (feed to Engine as load). */
	engineLoadTorqueNm: number;
	/** Longitudinal force at the rear contact patch, N (+ = forward). */
	driveForceN: number;
	/** Rear-wheel angular speed used this step, rad/s. */
	rearWheelOmegaRadS: number;
	totalRatio: number;
}

export class Drivetrain {
	readonly gearbox: Gearbox;

	private readonly clutchConfig: PowertrainConfig['clutch'];
	private readonly efficiency: number;
	private readonly rearWheelRadiusM: number;

	constructor(powertrain: PowertrainConfig, geometry: GeometryConfig) {
		this.gearbox = new Gearbox(powertrain.gearbox);
		this.clutchConfig = powertrain.clutch;
		this.efficiency = powertrain.gearbox.efficiency;
		this.rearWheelRadiusM = geometry.rearWheelRadiusM;
	}

	update(dtS: number): void {
		this.gearbox.update(dtS);
	}

	solve(
		engineOmegaRadS: number,
		forwardSpeedMps: number,
		clutchEngagementU01: number
	): DrivetrainSolution {
		const rearWheelOmegaRadS = forwardSpeedMps / this.rearWheelRadiusM;
		const totalRatio = this.gearbox.totalRatio();

		if (this.gearbox.isNeutral) {
			// Gearbox open: no torque path regardless of clutch state.
			return { engineLoadTorqueNm: 0, driveForceN: 0, rearWheelOmegaRadS, totalRatio: 0 };
		}

		const drivetrainOmegaAtEngine = rearWheelOmegaRadS * totalRatio;
		const deltaOmega = engineOmegaRadS - drivetrainOmegaAtEngine;

		let clutchTorqueNm = clutchTransferTorqueNm(clutchEngagementU01, deltaOmega, this.clutchConfig);
		if (this.gearbox.torqueCutActive) clutchTorqueNm = 0; // smooth the shift

		const wheelTorqueNm = clutchTorqueNm * totalRatio * this.efficiency;
		return {
			engineLoadTorqueNm: clutchTorqueNm,
			driveForceN: wheelTorqueNm / this.rearWheelRadiusM,
			rearWheelOmegaRadS,
			totalRatio
		};
	}
}
