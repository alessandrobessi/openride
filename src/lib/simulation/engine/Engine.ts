import { clamp } from '../core/math';
import type { EngineConfig, TorquePoint } from '../motorcycle/config';
import { interpolateTorqueNm, omegaFromRpm, rpmFromOmega } from './torqueCurve';

/**
 * The engine as an isolated rotational system (MOTORCYCLE-PHYSICS.md §14–18):
 *
 *   I_e · dω_e/dt = T_combustion − T_friction − T_load
 *
 * - `T_combustion` = laggy throttle × full-throttle torque curve, cut by the
 *   rev limiter near the redline.
 * - `T_friction` = base + speed-proportional drag + a closed-throttle
 *   engine-braking term (§17).
 * - `T_load` = reaction torque from the clutch/drivetrain. **Zero in M5** — the
 *   engine is still decoupled (as in neutral); the clutch couples it in M6.
 *
 * An idle governor keeps the engine alive near `idleRPM` when the throttle is
 * closed. When a clutch load drags the speed below the stall threshold and
 * combustion cannot recover it (§23), the engine stalls: combustion goes to
 * zero until {@link restart}.
 *
 * Pure — integrates its own scalar state with semi-implicit Euler; no Rapier.
 */
export class Engine {
	/** Authoritative engine angular speed, rad/s. */
	omegaRadS: number;
	/** First-order-lagged throttle actually acting on combustion, 0..1. */
	throttleActual = 0;
	/** Net combustion torque produced last step, N·m (telemetry). */
	lastCombustionTorqueNm = 0;
	/** Net friction + engine-braking torque last step, N·m, positive = opposing. */
	lastFrictionTorqueNm = 0;
	/** True once the engine has been dragged down and killed (§23). */
	stalled = false;

	private readonly config: EngineConfig;
	private readonly curve: readonly TorquePoint[];
	private readonly inertiaKgM2: number;
	private readonly minOmegaRadS: number;
	private readonly stallOmegaRadS: number;
	/** How long the engine has been lugging below the stall threshold under load. */
	private belowStallTimeS = 0;

	constructor(config: EngineConfig, curve: readonly TorquePoint[], inertiaKgM2: number) {
		this.config = config;
		this.curve = curve;
		this.inertiaKgM2 = inertiaKgM2;
		this.omegaRadS = omegaFromRpm(config.idleRPM);
		this.throttleActual = 0;
		this.stallOmegaRadS = omegaFromRpm(config.stallRPM);
		// A stalled engine may be cranked no lower than this.
		this.minOmegaRadS = omegaFromRpm(config.stallRPM * 0.35);
	}

	get rpm(): number {
		return rpmFromOmega(this.omegaRadS);
	}

	/** Restart a stalled engine (BLUEPRINT §27 "R"): back to idle. */
	restart(): void {
		this.stalled = false;
		this.belowStallTimeS = 0;
		this.omegaRadS = omegaFromRpm(this.config.idleRPM);
		this.throttleActual = 0;
	}

	/**
	 * @param dtS fixed step
	 * @param throttleCommand raw throttle 0..1
	 * @param loadTorqueNm reaction torque from the drivetrain (0 until M6)
	 */
	update(dtS: number, throttleCommand: number, loadTorqueNm = 0): void {
		const cmd = clamp(throttleCommand, 0, 1);
		// Intake / throttle-body first-order lag (§15).
		const lag = 1 - Math.exp(-dtS / this.config.throttleResponseTimeS);
		this.throttleActual += (cmd - this.throttleActual) * lag;

		const rpm = this.rpm;

		const wideOpenTorque = interpolateTorqueNm(this.curve, rpm);
		const combustion = this.stalled
			? 0
			: this.throttleActual * wideOpenTorque * this.limiterMultiplier(rpm);

		const friction = this.frictionTorqueNm();
		const idleAssist = this.stalled ? 0 : this.idleGovernorTorqueNm(rpm, friction);

		this.lastCombustionTorqueNm = combustion;
		this.lastFrictionTorqueNm = friction;

		const netNm = combustion + idleAssist - friction - loadTorqueNm;
		// Semi-implicit Euler on ω (MOTORCYCLE-PHYSICS.md §63).
		this.omegaRadS = Math.max(this.omegaRadS + (netNm / this.inertiaKgM2) * dtS, this.minOmegaRadS);

		// Stall (§23): the engine dies only when a load it cannot answer keeps it
		// lugging below the stall threshold for a sustained moment — or drags it
		// straight onto the floor. A brief clutch nip at part throttle recovers.
		// Never stall from RPM alone (a neutral coast-down is governed toward idle).
		if (!this.stalled) {
			const overloaded = this.rpm < this.config.stallRPM && loadTorqueNm > combustion + idleAssist;
			this.belowStallTimeS = overloaded ? this.belowStallTimeS + dtS : 0;
			if (this.belowStallTimeS > 0.25 || this.omegaRadS <= this.minOmegaRadS + 1e-3) {
				this.stalled = true;
			}
		}
	}

	/**
	 * Net torque the engine would put on the crank this step with **no** external
	 * (clutch) load: `T_combustion + T_idle − T_friction`, at the current ω and
	 * lagged throttle. The drivetrain lock-up solve needs this to predict how far
	 * the engine would run ahead of the driveline before the clutch reacts.
	 */
	currentFreeTorqueNm(): number {
		const rpm = this.rpm;
		const friction = this.frictionTorqueNm();
		if (this.stalled) return -friction;
		const combustion =
			this.throttleActual * interpolateTorqueNm(this.curve, rpm) * this.limiterMultiplier(rpm);
		return combustion + this.idleGovernorTorqueNm(rpm, friction) - friction;
	}

	/**
	 * Soft rev limiter (§18): a linear combustion-torque cut from `redlineRPM` to
	 * `limiterRPM`, fully zero above. Ramping the cut rather than hard-clamping ω
	 * avoids injecting non-physical energy.
	 */
	private limiterMultiplier(rpm: number): number {
		const { redlineRPM, limiterRPM } = this.config;
		if (rpm <= redlineRPM) return 1;
		if (rpm >= limiterRPM) return 0;
		return 1 - (rpm - redlineRPM) / (limiterRPM - redlineRPM);
	}

	/** T_friction = T0 + k_ω·ω + k_eb·(1 − u_t)·ω   (§17). Always opposes rotation. */
	private frictionTorqueNm(): number {
		const omega = Math.max(this.omegaRadS, 0);
		const base = this.config.engineFrictionBaseNm;
		const viscous = this.config.engineFrictionPerRadS * omega;
		// Overrun engine braking fades out as the engine nears idle — a real
		// engine barely retards down there, and keeping it here creates a
		// part-throttle dead zone that kills low-speed manoeuvres (§17).
		const idleOmega = omegaFromRpm(this.config.idleRPM);
		const brakingFade = clamp((omega - idleOmega) / idleOmega, 0, 1);
		const engineBraking =
			this.config.engineBrakeCoefficient * (1 - this.throttleActual) * omega * brakingFade;
		return base + viscous + engineBraking;
	}

	/**
	 * Idle governor: when the throttle is closed and the engine is near or below
	 * idle, hold `idleRPM` by feeding forward the current friction torque plus a
	 * proportional correction. The feed-forward term is what lets a pure spring
	 * of a P-controller actually sit on a non-zero setpoint. Above idle + a small
	 * band the governor releases so the engine can coast down normally.
	 */
	private idleGovernorTorqueNm(rpm: number, frictionNm: number): number {
		if (rpm > this.config.idleRPM + 300) return 0;
		// Full authority with the throttle shut, fading to nothing by ~20 % — so a
		// light throttle through a crawl (a U-turn, a hairpin) still gets an
		// anti-stall hand rather than lugging into the dead zone.
		const throttleFade = clamp((0.2 - this.throttleActual) / 0.15, 0, 1);
		if (throttleFade <= 0) return 0;
		const errorRpm = this.config.idleRPM - rpm;
		const proportionalNm = errorRpm * 0.15;
		return throttleFade * clamp(frictionNm + proportionalNm, 0, 90);
	}
}
