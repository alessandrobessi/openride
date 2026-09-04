import type { Vec3 } from '../core/math';

/**
 * Off-world recovery (OPENRIDE-BLUEPRINT.md §42 — "wants another run"). v0.1 has
 * no guardrails or crash geometry, and the DEM terrain past the drivable
 * shoulder is a real mountainside, so a rider who runs wide can slide out of the
 * world. This watches the sampled chassis state and reports when the bike has
 * clearly left it, so the caller can put it back on the road at the spawn.
 *
 * Pure — no Rapier, no rendering. It deliberately does *not* try to remember a
 * "last good" pose: the only place it can be sure is on the carriageway is the
 * manifest spawn, so recovery always sends the rider there (single route, v0.1).
 */
export interface FallRecoveryPose {
	positionWorldM: Vec3;
	headingRad: number;
}

export interface FallRecoverySample {
	positionWorldM: Vec3;
	/** World-frame vertical velocity, m/s (+ up). */
	verticalSpeedMps: number;
	rollRad: number;
	frontContactGround: boolean;
	rearContactGround: boolean;
}

/** Dropped this far below the spawn height → off the world (the route climbs from the spawn). */
const FALL_DEPTH_M = 8;
/** No wheel touching for this long → stuck airborne (a big jump still lands inside this). */
const AIRBORNE_LIMIT_S = 4;
/** Past this roll for this long → lying on its side and not coming back. */
const INVERTED_ROLL_RAD = 1.92; // ~110°
const INVERTED_LIMIT_S = 2.5;
/** Dropping faster than a cliff fall, sustained → gone over the edge (a steep pass
 *  descent or a tank-slapper twitch never holds this). */
const PLUNGE_SPEED_MPS = -12;
const PLUNGE_LIMIT_S = 1.2;

export class FallRecovery {
	private airborneS = 0;
	private invertedS = 0;
	private plungeS = 0;

	/**
	 * Feed one physics step. Returns the pose to respawn the bike at (the given
	 * `spawn`), or `null` if it is fine.
	 */
	update(
		sample: FallRecoverySample,
		dtS: number,
		spawn: FallRecoveryPose
	): FallRecoveryPose | null {
		const p = sample.positionWorldM;
		const grounded = sample.frontContactGround || sample.rearContactGround;
		const finite =
			Number.isFinite(p.x) &&
			Number.isFinite(p.y) &&
			Number.isFinite(p.z) &&
			Number.isFinite(sample.verticalSpeedMps);

		this.airborneS = grounded ? 0 : this.airborneS + dtS;
		this.invertedS = Math.abs(sample.rollRad) > INVERTED_ROLL_RAD ? this.invertedS + dtS : 0;
		this.plungeS = finite && sample.verticalSpeedMps < PLUNGE_SPEED_MPS ? this.plungeS + dtS : 0;

		const wentOffTheWorld =
			!finite ||
			p.y < spawn.positionWorldM.y - FALL_DEPTH_M ||
			this.airborneS > AIRBORNE_LIMIT_S ||
			this.invertedS > INVERTED_LIMIT_S ||
			this.plungeS > PLUNGE_LIMIT_S;

		if (!wentOffTheWorld) return null;

		this.airborneS = 0;
		this.invertedS = 0;
		this.plungeS = 0;
		return {
			positionWorldM: {
				x: spawn.positionWorldM.x,
				y: spawn.positionWorldM.y + 0.5,
				z: spawn.positionWorldM.z
			},
			headingRad: spawn.headingRad
		};
	}
}
