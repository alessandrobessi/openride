import type { Vec3 } from '../core/math';

/**
 * Off-world recovery (OPENRIDE-BLUEPRINT.md §42 — "wants another run"). v0.1 has
 * no guardrails or crash geometry, and the DEM terrain past the drivable shoulder
 * is a real mountainside, so a rider who runs wide can slide out of the world.
 *
 * This watches the sampled chassis state, keeps the last pose where the bike was
 * genuinely planted on the road (near level, not sinking), and reports when the
 * bike has clearly left it so the caller can respawn it there. Pure — no Rapier,
 * no rendering.
 */
export interface FallRecoveryPose {
	positionWorldM: Vec3;
	headingRad: number;
}

export interface FallRecoverySample {
	positionWorldM: Vec3;
	/** World-frame vertical velocity, m/s (+ up). */
	verticalSpeedMps: number;
	yawRad: number;
	rollRad: number;
	pitchRad: number;
	forwardSpeedMps: number;
	frontContactGround: boolean;
	rearContactGround: boolean;
}

/** To *record* a safe pose the bike must be within this of level and barely sinking. */
const SAFE_ROLL_RAD = 0.35; // ~20°
const SAFE_PITCH_RAD = 0.3; // ~17°
const SAFE_SINK_MPS = 1.5;
/** Above this the forward-speed reading is nonsense (a tumble) — never record it. */
const SANE_SPEED_MPS = 130;

/** Dropped this far below the last safe height → off the world. */
const FALL_DEPTH_M = 8;
/** No wheel touching for this long → stuck airborne (a real jump lands well inside this). */
const AIRBORNE_LIMIT_S = 3;
/** Past this roll for this long → lying on its side and not coming back. */
const INVERTED_ROLL_RAD = 1.92; // ~110°
const INVERTED_LIMIT_S = 2.5;
/** Falling faster than any road descent, sustained → sliding down the mountainside. */
const PLUNGE_SPEED_MPS = -6;
const PLUNGE_LIMIT_S = 1.5;

export class FallRecovery {
	private safe: FallRecoveryPose | null = null;
	private airborneS = 0;
	private invertedS = 0;
	private plungeS = 0;

	/**
	 * Feed one physics step. Returns a pose to respawn the bike at, or `null` if
	 * it is fine. `fallbackSpawn` is used until the bike has been planted once.
	 */
	update(
		sample: FallRecoverySample,
		dtS: number,
		fallbackSpawn: FallRecoveryPose
	): FallRecoveryPose | null {
		const p = sample.positionWorldM;
		const grounded = sample.frontContactGround || sample.rearContactGround;
		const finite =
			Number.isFinite(p.x) &&
			Number.isFinite(p.y) &&
			Number.isFinite(p.z) &&
			Number.isFinite(sample.verticalSpeedMps);

		const onTheRoad =
			grounded &&
			finite &&
			Math.abs(sample.rollRad) < SAFE_ROLL_RAD &&
			Math.abs(sample.pitchRad) < SAFE_PITCH_RAD &&
			Math.abs(sample.verticalSpeedMps) < SAFE_SINK_MPS &&
			Math.abs(sample.forwardSpeedMps) < SANE_SPEED_MPS;
		if (onTheRoad) {
			this.safe = { positionWorldM: { x: p.x, y: p.y, z: p.z }, headingRad: sample.yawRad };
		}

		this.airborneS = grounded ? 0 : this.airborneS + dtS;
		this.invertedS = Math.abs(sample.rollRad) > INVERTED_ROLL_RAD ? this.invertedS + dtS : 0;
		this.plungeS = finite && sample.verticalSpeedMps < PLUNGE_SPEED_MPS ? this.plungeS + dtS : 0;

		const ref = this.safe ?? fallbackSpawn;
		const wentOffTheWorld =
			!finite ||
			p.y < ref.positionWorldM.y - FALL_DEPTH_M ||
			this.airborneS > AIRBORNE_LIMIT_S ||
			this.invertedS > INVERTED_LIMIT_S ||
			this.plungeS > PLUNGE_LIMIT_S;

		if (!wentOffTheWorld) return null;

		this.airborneS = 0;
		this.invertedS = 0;
		this.plungeS = 0;
		// Lift it a touch so it drops onto the surface rather than starting inside it.
		return {
			positionWorldM: {
				x: ref.positionWorldM.x,
				y: ref.positionWorldM.y + 0.5,
				z: ref.positionWorldM.z
			},
			headingRad: ref.headingRad
		};
	}
}
