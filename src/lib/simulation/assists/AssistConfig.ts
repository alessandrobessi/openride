/**
 * Rider-assist configuration (OPENRIDE-BLUEPRINT.md §21, MOTORCYCLE-PHYSICS.md
 * §56–60). Assists are kept separate from the motorcycle physics and from each
 * other so levels are tunable and advanced users can switch them off. They act
 * on *brake torque* and *requested engine/drive torque* only — never on
 * velocity or wheel speed directly (§56–58).
 *
 * Baseline values: ADVENTURE-1200.md §17–19.
 */
export interface AbsConfig {
	enabled: boolean;
	/** Desired (negative) braking slip to hold. */
	targetSlip: number;
	/** Slip past which ABS intervenes. */
	activationSlip: number;
	/** How fast brake pressure is bled off while intervening, per second. */
	releaseRatePerS: number;
	/** How fast it is restored once slip recovers, per second. */
	recoveryRatePerS: number;
}

export interface TractionControlConfig {
	enabled: boolean;
	targetSlip: number;
	activationSlip: number;
	/** Throttle-reduction gain on (slip − target). */
	torqueReductionGain: number;
}

export interface WheelieControlConfig {
	enabled: boolean;
	/** Drive torque is cut as the front normal-load fraction falls to this. */
	minimumFrontLoadFraction: number;
}

export interface AssistConfig {
	abs: AbsConfig;
	tractionControl: TractionControlConfig;
	wheelieControl: WheelieControlConfig;
}

/** All assists off — the raw physical model, used by most scenario tests. */
export const ASSISTS_OFF: AssistConfig = {
	abs: {
		enabled: false,
		targetSlip: -0.14,
		activationSlip: -0.18,
		releaseRatePerS: 45,
		recoveryRatePerS: 10
	},
	tractionControl: {
		enabled: false,
		targetSlip: 0.1,
		activationSlip: 0.14,
		torqueReductionGain: 4.0
	},
	wheelieControl: { enabled: false, minimumFrontLoadFraction: 0.08 }
};

export const DEFAULT_ASSISTS: AssistConfig = {
	abs: {
		enabled: true,
		targetSlip: -0.14,
		activationSlip: -0.18,
		// Faster than the ADVENTURE-1200.md §17 start (15 / 8): the reduced-order
		// wheel model locks in a few steps at 120 Hz, so the modulation has to
		// bleed off quickly to catch it. Tuned per §17's note.
		releaseRatePerS: 45,
		recoveryRatePerS: 10
	},
	tractionControl: {
		enabled: true,
		targetSlip: 0.1,
		activationSlip: 0.14,
		torqueReductionGain: 4.0
	},
	wheelieControl: {
		enabled: true,
		minimumFrontLoadFraction: 0.08
	}
};
