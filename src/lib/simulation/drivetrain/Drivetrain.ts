import type { InertiaConfig, PowertrainConfig } from '../motorcycle/config';
import { clutchCapacityNm } from './Clutch';
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
 *
 * **Lock-up solve.** The clutch law `T_c = k_c·Δω` is a stiff spring: the torque
 * it applies is exactly what pulls `ω_engine` and `ω_r·R` together, so
 * integrating it explicitly at 120 Hz diverges once `k_c` is large enough to
 * actually couple the engine to the wheel — worst in first gear, where a small
 * wheel wobble is multiplied by the ~11:1 ratio into a huge Δω swing (this is
 * why `k_c` used to be pinned at a nearly-decoupled 12). Instead solve `T_c`
 * *implicitly*: predict the slip the driveline would have at the end of the step
 * with no clutch torque (`Δω_free`), then take the `T_c` consistent with
 * `T_c = k_c·Δω_end` and `Δω_end = Δω_free − s·T_c`, where
 * `s = dt·(1/I_e + R²·η/I_r)` is how much engine-side slip one N·m of clutch
 * torque removes over the step. That gives
 *
 *   T_c = k_c·Δω_free / (1 + k_c·s)
 *
 * which is unconditionally stable and, for a large `k_c`, tends to `Δω_free / s`
 * — the constraint torque that fully closes the slip in one step (lock-up) —
 * until it hits the friction capacity `u_c·T_max` and the clutch slips.
 */
export interface DrivetrainSolution {
	/** Reaction torque on the crankshaft, N·m (feed to Engine as load). */
	engineLoadTorqueNm: number;
	/** Drive torque delivered to the rear wheel, N·m (+ = accelerating). */
	rearWheelTorqueNm: number;
	totalRatio: number;
}

/** Extra terms the lock-up solve needs about the rest of the powertrain this step. */
export interface DrivetrainLoads {
	/** `T_combustion − T_friction` the engine would make this step with no clutch load, N·m. */
	engineFreeTorqueNm: number;
}

export class Drivetrain {
	readonly gearbox: Gearbox;

	private readonly clutchConfig: PowertrainConfig['clutch'];
	private readonly efficiency: number;
	private readonly engineInertiaKgM2: number;
	private readonly rearWheelInertiaKgM2: number;

	constructor(powertrain: PowertrainConfig, inertia: InertiaConfig) {
		this.gearbox = new Gearbox(powertrain.gearbox);
		this.clutchConfig = powertrain.clutch;
		this.efficiency = powertrain.gearbox.efficiency;
		this.engineInertiaKgM2 = inertia.engineKgM2;
		this.rearWheelInertiaKgM2 = inertia.rearWheelKgM2;
	}

	update(dtS: number): void {
		this.gearbox.update(dtS);
	}

	solve(
		engineOmegaRadS: number,
		rearWheelOmegaRadS: number,
		clutchEngagementU01: number,
		dtS: number,
		loads: DrivetrainLoads
	): DrivetrainSolution {
		const totalRatio = this.gearbox.totalRatio();

		if (this.gearbox.isNeutral || this.gearbox.torqueCutActive) {
			// Gearbox open (neutral) or mid-shift torque cut: no torque path.
			return { engineLoadTorqueNm: 0, rearWheelTorqueNm: 0, totalRatio: 0 };
		}

		const drivetrainOmegaAtEngine = rearWheelOmegaRadS * totalRatio;
		const deltaOmega = engineOmegaRadS - drivetrainOmegaAtEngine;

		// Slip the driveline would reach at the end of the step with no clutch
		// torque: over one 120 Hz step the wheel side barely moves, so the engine
		// spinning up on its own free torque is the term that matters.
		const eta = this.efficiency;
		const deltaOmegaFree = deltaOmega + (dtS * loads.engineFreeTorqueNm) / this.engineInertiaKgM2;

		// How much engine-side Δω one N·m of clutch torque removes over this step
		// (via the engine inertia and the ratio-reflected rear-wheel inertia).
		const stepSlipPerNm =
			dtS *
			(1 / this.engineInertiaKgM2 + (totalRatio * totalRatio * eta) / this.rearWheelInertiaKgM2);

		// Backward-Euler solve of T_c = k_c·Δω_end with Δω_end = Δω_free − T_c·stepSlipPerNm.
		// Stable for any k_c; as k_c grows, T_c → Δω_free / stepSlipPerNm, the torque
		// that fully closes the slip in one step (lock-up).
		const kc = this.clutchConfig.stiffnessNmPerRadS;
		const lockedTorqueNm = (kc * deltaOmegaFree) / (1 + kc * stepSlipPerNm);

		// Past the friction capacity the clutch slips at constant torque.
		const capNm = clutchCapacityNm(clutchEngagementU01, this.clutchConfig);
		const clutchTorqueNm = Math.max(-capNm, Math.min(capNm, lockedTorqueNm));

		return {
			engineLoadTorqueNm: clutchTorqueNm,
			rearWheelTorqueNm: clutchTorqueNm * totalRatio * eta,
			totalRatio
		};
	}
}
