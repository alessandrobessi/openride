/**
 * The virtual rider (OPENRIDE-BLUEPRINT.md §20, AGENTS.md §14). Deliberately
 * *not* part of the motorcycle config (ADVENTURE-1200.md §20) so one machine can
 * be paired with different riders (touring / simulation / expert).
 *
 * Gains here start from ADVENTURE-1200.md §16 but are expected to be tuned
 * substantially (the document says so); deviations are noted where they occur.
 */
export interface RiderBalanceProfile {
	/** Roll-error proportional gain, N·m/rad. */
	rollKp: number;
	/** Roll-rate derivative gain, N·m·s/rad. */
	rollKd: number;
	/** Assist is full at/below this speed. */
	fullAssistBelowMps: number;
	/** Assist has eased to its floor at/above this speed. */
	minimalAssistAboveMps: number;
	/** Assist floor once real stabilising physics (lean, countersteer, tyres) is online. */
	minAssistFactor: number;
	/**
	 * Floor for the inverted-pendulum gravity feed-forward once tyre cornering
	 * forces are online (M10): at parking speed the FF fully cancels the leaning
	 * moment (factor 1), but at riding speed the tyre lateral force already
	 * provides the stand-up moment, so keeping the full FF there double-counts and
	 * pins the bike short of its target lean. Fades 1 → this over the same
	 * speed range as `assistFactor` (§39, §46).
	 */
	gravityFeedForwardFloor: number;
}

export interface RiderSteeringProfile {
	/** Lean-error proportional gain for steering torque, N·m/rad. */
	leanKp: number;
	/** Lean-rate derivative gain, N·m·s/rad. */
	leanKd: number;
	/** Countersteer feed-forward gain (used from M9). */
	countersteerGain: number;
	/** Below this speed steering is treated as direct (parking-lot) input. */
	lowSpeedTransitionStartMps: number;
	/** Above this speed steering is lean/countersteer-led. */
	lowSpeedTransitionEndMps: number;
	/** Clamp on virtual-rider steering torque, N·m. */
	maxSteeringTorqueNm: number;
}

export interface RiderProfile {
	id: string;
	name: string;
	/** Target lateral acceleration at full turn intention, m/s² (~0.92 g). */
	maxTargetLateralAccelerationMps2: number;
	balance: RiderBalanceProfile;
	steering: RiderSteeringProfile;
}
