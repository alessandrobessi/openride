import { smoothstep } from '../core/math';
import type { RiderBalanceProfile } from './RiderProfile';

/**
 * Virtual-rider roll stabilisation (MOTORCYCLE-PHYSICS.md §46, §39). An explicit
 * assist force — not folded into gravity or collisions (AGENTS.md §14).
 *
 * A free two-wheel body is an inverted pendulum: gravity applies a
 * *destabilising* roll moment ≈ +m·g·h·sin φ (it grows the lean). The controller
 * cancels that with a feed-forward term of the opposite sign, then drives roll
 * toward the target lean with PD:
 *
 *   T_balance = w(v) · [ −m·g·h·sin φ  +  Kp·(φ_target − φ)  −  Kd·φ̇ ]
 *
 * With no cornering force yet (M8/M10), holding a commanded lean therefore needs
 * a sustained rider torque ≈ m·g·h·sin φ_target — the assist is literally
 * holding the bike over.
 *
 * `w(v)` scales from 1 at parking speed toward `minAssistFactor` at riding speed
 * (§46). It stays well above zero for now — real stabilising physics (dynamic
 * lean M8, countersteering M9, tyre forces M10) is not online yet.
 */
export class BalanceController {
	private readonly profile: RiderBalanceProfile;
	private readonly gravityFfNm: number;

	/** @param cgGravityTorquePerRad  m · g · h  (N·m per rad of lean, small-angle). */
	constructor(profile: RiderBalanceProfile, cgGravityTorquePerRad: number) {
		this.profile = profile;
		this.gravityFfNm = cgGravityTorquePerRad;
	}

	/** Speed blend 0 → 1 over the parking-speed → riding-speed range (§46). */
	private speedBlend(speedMps: number): number {
		return smoothstep(
			this.profile.fullAssistBelowMps,
			this.profile.minimalAssistAboveMps,
			Math.abs(speedMps)
		);
	}

	/** Assist scale 1 → minAssistFactor as speed rises (§46). */
	assistFactor(speedMps: number): number {
		return 1 - this.speedBlend(speedMps) * (1 - this.profile.minAssistFactor);
	}

	/** Gravity feed-forward scale 1 → gravityFeedForwardFloor as speed rises (§39). */
	feedForwardFactor(speedMps: number): number {
		return 1 - this.speedBlend(speedMps) * (1 - this.profile.gravityFeedForwardFloor);
	}

	/** Roll-axis torque, N·m (+ rolls toward +φ). */
	torqueNm(rollRad: number, rollRateRadS: number, targetLeanRad: number, speedMps: number): number {
		const feedForward = -this.gravityFfNm * Math.sin(rollRad) * this.feedForwardFactor(speedMps);
		const pd = this.profile.rollKp * (targetLeanRad - rollRad) - this.profile.rollKd * rollRateRadS;
		return this.assistFactor(speedMps) * (feedForward + pd);
	}
}
