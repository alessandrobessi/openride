import type { RiderProfile } from '../RiderProfile';

/**
 * The default "simulation" rider. Starting point: ADVENTURE-1200.md §16.
 *
 * Tuning note: the document's balance gains (rollKp 420, rollKd 110) are far too
 * soft to hold the free two-wheel Rapier body up against its own
 * inverted-pendulum gravity moment (~m·g·h ≈ 2170 N·m/rad), so the balance
 * controller adds explicit gravity feed-forward and the PD gains here are raised
 * accordingly. Later milestones (M8 lean dynamics, M9 countersteering, M10 tyre
 * forces) add the real stabilising physics: `minAssistFactor` comes down and the
 * gravity feed-forward fades to `gravityFeedForwardFloor` at riding speed (where
 * the tyre lateral force, not the rider, holds the lean), so the rider can carry
 * the bike to its target lean instead of being pinned upright by its own FF.
 */
export const DEFAULT_RIDER: RiderProfile = {
	id: 'simulation-rider',
	name: 'Simulation Rider',
	maxTargetLateralAccelerationMps2: 9.5,

	balance: {
		rollKp: 3200, // §16 start: 420 — carries the lean to target now the FF fades at speed
		rollKd: 900, // §16 start: 110 — heavier damping so a step steer does not overshoot
		fullAssistBelowMps: 3,
		minimalAssistAboveMps: 12,
		minAssistFactor: 0.82,
		gravityFeedForwardFloor: 0.1
	},

	steering: {
		leanKp: 65,
		leanKd: 18,
		countersteerGain: 18,
		lowSpeedTransitionStartMps: 3,
		lowSpeedTransitionEndMps: 16,
		maxSteeringTorqueNm: 35
	}
};
