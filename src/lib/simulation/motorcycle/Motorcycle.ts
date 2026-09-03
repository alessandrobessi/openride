import {
	add,
	clamp,
	cross,
	dot,
	normalize,
	scale,
	toYawPitchRoll,
	vec3,
	type Vec3
} from '../core/math';
import { clampCompressionM, suspensionForceN } from '../suspension/suspension';
import { Engine } from '../engine/Engine';
import { dragForceN } from '../aero/drag';
import { rollingResistanceForceN } from '../tires/rollingResistance';
import { slipAngleRad, slipRatio } from '../tires/slip';
import { clampToFrictionEllipse } from '../tires/frictionEllipse';
import { Drivetrain } from '../drivetrain/Drivetrain';
import { BalanceController } from '../rider/BalanceController';
import { SteeringController } from '../rider/SteeringController';
import { countersteer } from '../rider/countersteer';
import type { RiderProfile, RiderSteeringProfile } from '../rider/RiderProfile';
import { Abs } from '../assists/abs';
import { TractionControl } from '../assists/tractionControl';
import { WheelieControl } from '../assists/wheelieControl';
import { DEFAULT_ASSISTS, type AssistConfig } from '../assists/AssistConfig';
import { GRAVITY_MPS2 } from '../core/constants';
import { gradientForces } from '../world/gradient';
import { DRY_ASPHALT, type SurfacePhysics } from '../world/surface';
import {
	frontAxleFromCgM,
	type AeroConfig,
	type AxleSuspensionConfig,
	type BrakeConfig,
	type GeometryConfig,
	type MotorcycleConfig
} from './config';
import type { ChassisRig } from './ChassisRig';
import { createMotorcycleState, type MotorcycleState } from './MotorcycleState';

/** Normalised control inputs sampled once per step (MOTORCYCLE-PHYSICS.md §80). */
export interface MotorcycleControls {
	throttle: number; // 0..1
	clutch: number; // 0..1 (1 = engaged)
	frontBrake: number; // 0..1
	rearBrake: number; // 0..1
	steeringInput: number; // -1..1
}

/** Per-step environment around the motorcycle. */
export interface MotorcycleEnvironment {
	/** Road gradient ahead as a fraction (rise/run); + = uphill. */
	gradeFraction: number;
	surface: SurfacePhysics;
}

/**
 * The motorcycle simulation orchestrator (MOTORCYCLE-PHYSICS.md §80,
 * OPENRIDE-BLUEPRINT.md §5). Pure: it depends only on the {@link ChassisRig}
 * interface and the config, never on Rapier or Three.js, so it runs in headless
 * tests.
 *
 * **Scope so far**:
 * - M3 — the two-wheel rig: chassis body, raycast contacts, spring–damper
 *   suspension, a temporary balance stabiliser.
 * - M4 — longitudinal dynamics: net forward force applied at the CG, so speed
 *   emerges from `m·a = ΣF` (AGENTS.md §13).
 * - M5 — engine as an isolated rotational system.
 * - M6 — clutch + gearbox + final drive: the engine drives (and back-drives) the
 *   rear contact patch.
 * - M7 — virtual rider: a speed-scaled balance controller keeps the bike upright
 *   and leans it toward a steering target.
 * - M8 — dynamic lean: the target lean is derived from the cornering demand.
 * - M9 — countersteering: yaw follows the actual lean.
 * - M10 — bounded tyre grip: wheel-spin state, longitudinal slip ratio + slip
 *   angle, linear tyre forces clamped to a friction ellipse per wheel, so
 *   braking and cornering share one grip budget and wheelspin / lock can emerge.
 * - M11 — longitudinal weight transfer via a bounded pitch response; the
 *   suspension then redistributes axle load.
 * - M12 — configurable assists: ABS modulates brake torque, traction control
 *   trims the throttle, wheelie control cuts drive torque — independent, acting
 *   on torque only.
 */
interface WheelGeometry {
	/** Strut-top attachment in the body frame: on the axle line, at CG height. */
	strutTopLocalM: Vec3;
	suspension: AxleSuspensionConfig;
}

const DOWN_WORLD: Vec3 = { x: 0, y: -1, z: 0 };
const UP_WORLD: Vec3 = { x: 0, y: 1, z: 0 };
const FORWARD_LOCAL: Vec3 = { x: 0, y: 0, z: 1 };
const RAY_SLACK_M = 0.35;

// Yaw-rate tracker time constant: soft, so heading lags the lean (turn-in is
// not instantaneous). Real front-contact steer geometry + tyre forces (M10)
// will let this go away.
const YAW_TRACK_TIME_S = 0.45;

/** Below this speed, velocity-opposing forces (drag, rolling resistance, brakes) are gated off. */
const SPEED_DEADBAND_MPS = 0.03;

/** Non-authoritative values for debug rendering only. */
export interface MotorcycleDebug {
	frontContactWorldM: Vec3;
	rearContactWorldM: Vec3;
	frontStrutTopWorldM: Vec3;
	rearStrutTopWorldM: Vec3;
}

export class Motorcycle {
	readonly config: MotorcycleConfig;
	readonly state: MotorcycleState;
	readonly debug: MotorcycleDebug = {
		frontContactWorldM: vec3(),
		rearContactWorldM: vec3(),
		frontStrutTopWorldM: vec3(),
		rearStrutTopWorldM: vec3()
	};

	private readonly rig: ChassisRig;
	private readonly front: WheelGeometry;
	private readonly rear: WheelGeometry;
	private readonly massKg: number;
	private readonly aero: AeroConfig;
	private readonly geometry: GeometryConfig;
	private readonly brakeConfig: BrakeConfig;
	private readonly engine: Engine;
	private readonly drivetrain: Drivetrain;
	private readonly yawInertiaKgM2: number;
	private readonly balanceController: BalanceController;
	private readonly steeringController: SteeringController;
	private readonly riderSteering: RiderSteeringProfile;
	private readonly tires: MotorcycleConfig['chassis']['tires'];
	private readonly assists: AssistConfig;
	private readonly absFront: Abs;
	private readonly absRear: Abs;
	private readonly tractionControl: TractionControl;
	private readonly wheelieControl: WheelieControl;

	/** Wheel angular speeds — real state from M10 (MOTORCYCLE-PHYSICS.md §36). */
	private frontWheelOmegaRadS = 0;
	private rearWheelOmegaRadS = 0;
	/** Relaxed longitudinal tyre force per wheel (first-order lag, §35) — for stability. */
	private frontFxN = 0;
	private rearFxN = 0;
	/** Smoothed longitudinal acceleration, m/s² (+ accelerating) — drives weight transfer (M11). */
	private longitudinalAccelMps2 = 0;

	private environment: MotorcycleEnvironment = {
		gradeFraction: 0,
		surface: DRY_ASPHALT
	};
	/**
	 * Ray length, from a strut top straight down, at which suspension compression
	 * is exactly zero (wheel just touching the ground). With the strut top at CG
	 * height this equals the CG height for both wheels.
	 */
	private readonly zeroCompressionReachM: number;

	private frontCompressionM = 0;
	private rearCompressionM = 0;

	/** Spawn CG height so the bike settles into ride height under its own weight. */
	static spawnHeightM(config: MotorcycleConfig): number {
		return config.physical.geometry.cgHeightM + 0.05;
	}

	constructor(
		rig: ChassisRig,
		config: MotorcycleConfig,
		rider: RiderProfile,
		assists: AssistConfig = DEFAULT_ASSISTS
	) {
		this.rig = rig;
		this.config = config;
		this.state = createMotorcycleState();

		const geo = config.physical.geometry;
		this.geometry = geo;
		this.massKg = config.physical.mass.totalKg;
		this.aero = config.physical.aero;
		this.brakeConfig = config.chassis.brakes;
		this.yawInertiaKgM2 = config.physical.inertia.yawKgM2;
		this.engine = new Engine(
			config.powertrain.engine,
			config.powertrain.torqueCurve,
			config.physical.inertia.engineKgM2
		);
		this.drivetrain = new Drivetrain(config.powertrain);
		this.tires = config.chassis.tires;
		this.balanceController = new BalanceController(
			rider.balance,
			this.massKg * GRAVITY_MPS2 * geo.cgHeightM
		);
		this.steeringController = new SteeringController(rider, geo.wheelbaseM, geo.maxLeanAngleRad);
		this.riderSteering = rider.steering;

		this.assists = { ...assists };
		this.absFront = new Abs(this.assists.abs);
		this.absRear = new Abs(this.assists.abs);
		this.tractionControl = new TractionControl(this.assists.tractionControl);
		this.wheelieControl = new WheelieControl(this.assists.wheelieControl);

		this.zeroCompressionReachM = geo.cgHeightM;
		this.front = {
			strutTopLocalM: vec3(0, 0, frontAxleFromCgM(geo)),
			suspension: config.chassis.suspension.front
		};
		this.rear = {
			strutTopLocalM: vec3(0, 0, -geo.cgFromRearAxleM),
			suspension: config.chassis.suspension.rear
		};
	}

	/** Sample normalised controls for this step (MOTORCYCLE-PHYSICS.md §80 step 1). */
	setControls(controls: MotorcycleControls): void {
		this.state.throttle = clamp(controls.throttle, 0, 1);
		this.state.clutch = clamp(controls.clutch, 0, 1);
		this.state.frontBrake = clamp(controls.frontBrake, 0, 1);
		this.state.rearBrake = clamp(controls.rearBrake, 0, 1);
		this.state.steeringInput = clamp(controls.steeringInput, -1, 1);
	}

	setEnvironment(environment: Partial<MotorcycleEnvironment>): void {
		this.environment = { ...this.environment, ...environment };
	}

	shiftUp(): void {
		this.drivetrain.gearbox.shiftUp();
	}

	shiftDown(): void {
		this.drivetrain.gearbox.shiftDown();
	}

	selectGear(gear: number): void {
		this.drivetrain.gearbox.selectGear(gear);
	}

	/** Toggle an assist at runtime (BLUEPRINT §21). */
	setAssistEnabled(assist: keyof AssistConfig, enabled: boolean): void {
		this.assists[assist].enabled = enabled;
	}

	isAssistEnabled(assist: keyof AssistConfig): boolean {
		return this.assists[assist].enabled;
	}

	/** Crank a stalled engine back to life (BLUEPRINT §27 "R"). */
	restartEngine(): void {
		this.engine.restart();
		this.state.engineStalled = false;
		this.state.engineRPM = this.engine.rpm;
		this.state.engineOmegaRadS = this.engine.omegaRadS;
	}

	/** One fixed simulation step. Rapier is stepped by the caller afterwards. */
	update(dtS: number): void {
		this.rig.clearAccumulators();
		this.syncPose();

		const forwardHoriz = this.forwardHorizontal();
		const speedAlong = dot(this.state.linearVelocityWorldMps, forwardHoriz);
		// Smoothed longitudinal acceleration for the weight-transfer response (M11).
		const rawAccel = (speedAlong - this.state.forwardSpeedMps) / dtS;
		this.longitudinalAccelMps2 += (rawAccel - this.longitudinalAccelMps2) * Math.min(1, dtS / 0.08);
		this.state.forwardSpeedMps = speedAlong;
		this.state.longitudinalAccelMps2 = this.longitudinalAccelMps2;

		// Powertrain: engine ← clutch/gearbox load ← rear wheel (real angular
		// state). The drivetrain returns the torque delivered to the rear wheel.
		this.drivetrain.update(dtS);
		const drive = this.drivetrain.solve(
			this.engine.omegaRadS,
			this.rearWheelOmegaRadS,
			this.state.clutch
		);
		// Traction control trims the throttle request when the rear is spinning
		// (using last step's slip). Acts on torque, not speed (§57).
		const tcThrottle = this.tractionControl.limit(this.state.throttle, this.state.rearSlipRatio);
		this.state.tractionControlActive = this.tractionControl.active;
		const throttleForEngine = this.drivetrain.gearbox.torqueCutActive ? 0 : tcThrottle;
		this.engine.update(dtS, throttleForEngine, drive.engineLoadTorqueNm);

		this.state.engineOmegaRadS = this.engine.omegaRadS;
		this.state.engineRPM = this.engine.rpm;
		this.state.engineTorqueNm =
			this.engine.lastCombustionTorqueNm - this.engine.lastFrictionTorqueNm;
		this.state.gear = this.drivetrain.gearbox.gear;
		this.state.engineStalled = this.engine.stalled;

		this.frontCompressionM = this.updateWheel('front', this.front, dtS);
		this.rearCompressionM = this.updateWheel('rear', this.rear, dtS);
		this.applyPitchResponse();

		// Wheelie control cuts drive torque as the front unloads (§58).
		const frontLoadFraction =
			this.state.frontNormalLoadN /
			Math.max(this.state.frontNormalLoadN + this.state.rearNormalLoadN, 1);
		const rearWheelTorqueNm = this.wheelieControl.limit(drive.rearWheelTorqueNm, frontLoadFraction);
		this.state.wheelieControlActive = this.wheelieControl.active;

		// Rider control first — it sets the steering angle and the cornering
		// (lateral) demand that the tyre model then realises within the grip limit.
		this.applyRiderControl(speedAlong, dtS);
		this.applyTireForces(forwardHoriz, rearWheelTorqueNm, dtS);
		this.applyResistanceForces(forwardHoriz, speedAlong);
		this.state.absActive = this.absFront.active || this.absRear.active;
	}

	private forwardHorizontal(): Vec3 {
		const forwardWorld = this.rig.localDirToWorld(FORWARD_LOCAL);
		return normalize({ x: forwardWorld.x, y: 0, z: forwardWorld.z });
	}

	/**
	 * Longitudinal weight transfer (MOTORCYCLE-PHYSICS.md §27, §50). A pitch
	 * moment M ≈ m·a_x·h drives the chassis nose-down under braking / tail-down
	 * under acceleration; the front/rear suspension then redistributes the axle
	 * load by ≈ m·a_x·h/L, so `state.*NormalLoadN` (from the raycast suspension)
	 * already reflects the transfer and feeds the tyre grip limit. The moment is
	 * clamped so a hard stop dives rather than flips (stoppie / wheelie limiting
	 * is M12), and pitch-rate damped.
	 */
	private applyPitchResponse(): void {
		const bodyRightWorld = this.rig.localDirToWorld({ x: 1, y: 0, z: 0 });
		const pitchRateRadS = dot(this.state.angularVelocityWorldRadS, bodyRightWorld);

		const geometricMomentNm = -this.massKg * this.longitudinalAccelMps2 * this.geometry.cgHeightM;
		let pitchMomentNm = clamp(geometricMomentNm, -2800, 2800) - 1500 * pitchRateRadS;

		// Constrain the unstable extreme (endo / wheelie): a stiff progressive
		// restoring torque past ~9° of pitch so a hard stop dives rather than
		// flips (§59). A proper stoppie/wheelie limiter is M12.
		const pitchTrimRad = 0.0165; // static nose-down from the softer front spring
		const pitchExcess = this.state.pitchRad - pitchTrimRad;
		const softLimitRad = 0.16;
		if (Math.abs(pitchExcess) > softLimitRad) {
			pitchMomentNm -= 28_000 * (pitchExcess - Math.sign(pitchExcess) * softLimitRad);
		}

		this.rig.addTorqueWorld(scale(bodyRightWorld, pitchMomentNm));
	}

	/**
	 * Resistive body forces along the heading (MOTORCYCLE-PHYSICS.md §10–13):
	 * aerodynamic drag, rolling resistance and the road-gradient component,
	 * applied at the CG. Drive and brake forces are no longer here — from M10
	 * they reach the ground through the tyre model as grip-limited contact
	 * forces.
	 */
	private applyResistanceForces(forwardHoriz: Vec3, speedAlong: number): void {
		const grade = gradientForces(this.massKg, this.environment.gradeFraction);
		this.state.roadGradientRad = grade.angleRad;

		const moving = Math.abs(speedAlong) > SPEED_DEADBAND_MPS;
		const travelSign = speedAlong >= 0 ? 1 : -1;
		const normalLoadN = this.state.frontNormalLoadN + this.state.rearNormalLoadN;

		const dragN = moving ? dragForceN(Math.abs(speedAlong), this.aero) : 0;
		const rollingN = moving
			? rollingResistanceForceN(normalLoadN, this.environment.surface.rollingResistance)
			: 0;

		const netForwardN = -travelSign * (dragN + rollingN) - grade.alongSlopeN;
		this.rig.addForceAtPointWorld(scale(forwardHoriz, netForwardN), this.state.positionWorldM);
	}

	/**
	 * Grip-limited tyre contact forces (MOTORCYCLE-PHYSICS.md §29–36).
	 *
	 * For each wheel: normal load from the suspension, contact-patch velocity →
	 * slip ratio and slip angle, linear tyre forces (F_x = C_κ·κ,
	 * F_y = −C_α·α + cornering demand), clamped to the friction ellipse for that
	 * wheel's load. The clamped force is applied at the contact; its reaction
	 * drives the wheel's angular acceleration together with drive / brake torque
	 * (§36), so wheelspin and lock emerge.
	 */
	private applyTireForces(forwardHoriz: Vec3, rearWheelTorqueNm: number, dtS: number): void {
		const rightHoriz = normalize(cross(forwardHoriz, UP_WORLD));
		const surface = this.environment.surface;

		// Cornering (lateral) demand: the centripetal force the bike is actually
		// experiencing for its current yaw rate, F_y = m·v·ψ̇ (toward the turn
		// centre), plus light sideslip damping. The yaw itself is produced by the
		// rider steering model (applyRiderControl); this force curves the CG's
		// path to match. Split by axle load and passed through the grip-limited
		// tyre model — so hard braking (which consumes F_x budget) leaves less
		// cornering force, per the friction ellipse (§30). A camber-thrust model
		// replacing the yaw-led mechanism is a later refinement (§31).
		const cgLateralSpeed = dot(this.state.linearVelocityWorldMps, rightHoriz);
		const centripetalN = -this.massKg * this.state.forwardSpeedMps * this.state.yawRateRadS;
		const slipDampN = (-this.massKg * cgLateralSpeed) / 0.4;
		const lateralDemandTotalN = centripetalN + slipDampN;

		const totalLoadN = Math.max(this.state.frontNormalLoadN + this.state.rearNormalLoadN, 1);
		const geo = this.geometry;
		let corneringForceN = 0; // summed lateral tyre force, applied on the contact line

		const solveWheel = (which: 'front' | 'rear') => {
			const isFront = which === 'front';
			const contact = isFront ? this.debug.frontContactWorldM : this.debug.rearContactWorldM;
			const radiusM = isFront ? geo.frontWheelRadiusM : geo.rearWheelRadiusM;
			const inertiaKgM2 = isFront
				? this.config.physical.inertia.frontWheelKgM2
				: this.config.physical.inertia.rearWheelKgM2;
			const normalLoadN = isFront ? this.state.frontNormalLoadN : this.state.rearNormalLoadN;
			const grounded = isFront ? this.state.frontContactGround : this.state.rearContactGround;
			let omega = isFront ? this.frontWheelOmegaRadS : this.rearWheelOmegaRadS;

			const contactVel = this.rig.pointVelocityWorld(contact);
			const vx = dot(contactVel, forwardHoriz);
			const vy = dot(contactVel, rightHoriz);

			if (!grounded || normalLoadN <= 0) {
				// Airborne: no contact force; spin decays toward the free speed.
				const targetOmega = vx / radiusM;
				omega += (targetOmega - omega) * Math.min(1, dtS * 4);
				this.writeWheelState(which, omega, 0, 0, 0);
				return;
			}

			const kappa = slipRatio(omega, radiusM, vx);
			const steerAngleRad = isFront ? this.state.steeringAngleRad : 0;
			const alpha = slipAngleRad(vy, vx, steerAngleRad); // telemetry only in M10
			const lateralDemandShareN = lateralDemandTotalN * (normalLoadN / totalLoadN);

			// Longitudinal demand from slip ratio (§34), with the linear region
			// capped to reach the grip limit at a realistic slip (§12 stiffness is
			// an upper bound). κ used for force is bounded — past ~1.5 the force is
			// saturated anyway and unbounded κ just makes the demand ratio silly.
			const xMax = surface.muLongitudinal * normalLoadN;
			const kappaStiffnessN = Math.min(
				isFront ? this.tires.frontLongitudinalStiffnessN : this.tires.rearLongitudinalStiffnessN,
				xMax / 0.12
			);
			// Below walking pace, taper the braking demand so a locked wheel cannot
			// push the bike backwards.
			const brakeSpeedGate = Math.min(1, Math.abs(vx) / 0.6);
			const kappaForce = clamp(kappa, -1.5, 1.5) * (kappa < 0 ? brakeSpeedGate : 1);
			const fxDemandN = kappaStiffnessN * kappaForce;

			// One grip budget shared between F_x and the cornering demand (§30).
			const grip = clampToFrictionEllipse(
				fxDemandN,
				lateralDemandShareN,
				surface.muLongitudinal,
				surface.muLateral,
				normalLoadN
			);

			// First-order relaxation on F_x (§35) — the κ → F_x → ω → κ loop is
			// numerically stiff at 120 Hz; the tyre force lags its target rather
			// than snapping to it.
			const relax = Math.min(1, dtS / this.tires.relaxationTimeS);
			let fxN = isFront ? this.frontFxN : this.rearFxN;
			fxN += (grip.fxN - fxN) * relax;
			if (isFront) this.frontFxN = fxN;
			else this.rearFxN = fxN;

			// Longitudinal force applied at CG height (same x/z as the contact so
			// the tiny yaw effect of an off-centre wheel is kept). Applying it at
			// the ground would pitch the bike forward under braking — that
			// dive/squat and the resulting load shift is M11's job (§27). Lateral
			// force is accumulated and applied on the contact line (no yaw moment).
			const fxPoint = { x: contact.x, y: this.state.positionWorldM.y, z: contact.z };
			this.rig.addForceAtPointWorld(scale(forwardHoriz, fxN), fxPoint);
			corneringForceN += grip.fyN;
			if (!isFront) this.lastRearFxN = fxN;

			// Wheel angular dynamics: I_w·dω/dt = T_drive − T_brake·sign(ω) − F_x·r  (§36)
			const driveNm = isFront ? 0 : rearWheelTorqueNm;
			// ABS modulates the commanded brake toward a target braking slip (§56).
			const brakeInput = isFront ? this.state.frontBrake : this.state.rearBrake;
			const abs = isFront ? this.absFront : this.absRear;
			const effectiveBrake = abs.modulate(brakeInput, kappa, dtS);
			const brakeCapNm =
				effectiveBrake *
				(isFront ? this.brakeConfig.frontMaxTorqueNm : this.brakeConfig.rearMaxTorqueNm);
			const omegaBeforeBrake = omega + ((driveNm - fxN * radiusM) / inertiaKgM2) * dtS;
			// Brake opposes rotation but cannot drive ω through zero (that is lock).
			const brakeDeltaOmega = (brakeCapNm / inertiaKgM2) * dtS;
			omega =
				omegaBeforeBrake > 0
					? Math.max(0, omegaBeforeBrake - brakeDeltaOmega)
					: Math.min(0, omegaBeforeBrake + brakeDeltaOmega);

			// A wheel with no drive or brake torque is forced by the tyre to roll
			// freely — relax ω toward v_x/r on a short time constant. This also
			// absorbs a respawn / velocity set without a spurious slip transient.
			if (driveNm === 0 && brakeCapNm < 1) {
				omega += (vx / radiusM - omega) * Math.min(1, dtS / 0.05);
			}

			this.writeWheelState(which, omega, kappa, alpha, grip.utilization);
		};

		solveWheel('front');
		solveWheel('rear');

		const contactMid = scale(add(this.debug.frontContactWorldM, this.debug.rearContactWorldM), 0.5);
		this.rig.addForceAtPointWorld(scale(rightHoriz, corneringForceN), contactMid);
		this.state.driveForceN = this.lastRearFxN;
	}

	private lastRearFxN = 0;

	private writeWheelState(
		which: 'front' | 'rear',
		omegaRadS: number,
		slipRatioValue: number,
		slipAngleValue: number,
		gripUtilization: number
	): void {
		if (which === 'front') {
			this.frontWheelOmegaRadS = omegaRadS;
			this.state.frontWheelOmegaRadS = omegaRadS;
			this.state.frontSlipRatio = slipRatioValue;
			this.state.frontSlipAngleRad = slipAngleValue;
			this.state.frontGripUtilization = gripUtilization;
		} else {
			this.rearWheelOmegaRadS = omegaRadS;
			this.state.rearWheelOmegaRadS = omegaRadS;
			this.state.rearSlipRatio = slipRatioValue;
			this.state.rearSlipAngleRad = slipAngleValue;
			this.state.rearGripUtilization = gripUtilization;
		}
	}

	/** Match the wheel angular speeds to the current ground speed (after a respawn / velocity set). */
	resyncWheelsToGround(): void {
		const v = dot(this.rig.getPose().linearVelocityWorldMps, this.forwardHorizontal());
		this.frontWheelOmegaRadS = v / this.geometry.frontWheelRadiusM;
		this.rearWheelOmegaRadS = v / this.geometry.rearWheelRadiusM;
	}

	private updateWheel(which: 'front' | 'rear', wheel: WheelGeometry, dtS: number): number {
		// Cast the suspension ray straight down in *world* space and push along the
		// contact normal. On flat ground this is world-up; on banked roads it will
		// follow the surface (MOTORCYCLE-PHYSICS.md §52). Casting along the tilted
		// body axis instead leaks a horizontal component of the normal load
		// whenever the chassis is pitched.
		const strutTopWorld = this.rig.localPointToWorld(wheel.strutTopLocalM);
		const hit = this.rig.raycastWorld(
			strutTopWorld,
			DOWN_WORLD,
			this.zeroCompressionReachM + RAY_SLACK_M
		);
		if (which === 'front') this.debug.frontStrutTopWorldM = strutTopWorld;
		else this.debug.rearStrutTopWorldM = strutTopWorld;

		const prevCompression = which === 'front' ? this.frontCompressionM : this.rearCompressionM;
		let compressionM = 0;
		let grounded = false;
		let contactWorld = strutTopWorld;
		let normalWorld = UP_WORLD;

		if (hit) {
			compressionM = clampCompressionM(
				this.zeroCompressionReachM - hit.distanceM,
				wheel.suspension
			);
			grounded = compressionM > 0;
			contactWorld = hit.pointWorldM;
			normalWorld = hit.normalWorld;
		}

		const compressionVelMps = (compressionM - prevCompression) / dtS;
		const forceN = grounded
			? suspensionForceN({ compressionM, compressionVelMps }, wheel.suspension)
			: 0;

		if (forceN > 0) {
			this.rig.addForceAtPointWorld(scale(normalWorld, forceN), contactWorld);
		}

		if (which === 'front') {
			this.state.frontSuspensionCompressionM = compressionM;
			this.state.frontContactGround = grounded;
			this.state.frontNormalLoadN = forceN;
			this.debug.frontContactWorldM = contactWorld;
		} else {
			this.state.rearSuspensionCompressionM = compressionM;
			this.state.rearContactGround = grounded;
			this.state.rearNormalLoadN = forceN;
			this.debug.rearContactWorldM = contactWorld;
		}
		return compressionM;
	}

	/**
	 * Virtual-rider control (MOTORCYCLE-PHYSICS.md §43–46):
	 * 1. steering command  u_s → target lean (+ a reference yaw rate);
	 * 2. balance controller → roll-axis torque toward the target lean, plus a
	 *    countersteer feed-forward that crisps up turn-in and fades as the lean
	 *    settles (§44);
	 * 3. yaw follows the *actual* lean at speed (ψ̇ = g·tan φ / v), blended with
	 *    direct steering only at parking speed (§41, §45) — turning is no longer
	 *    a directly-imposed yaw rate (AGENTS.md §13).
	 */
	private applyRiderControl(speedMps: number, dtS: number): void {
		const forwardWorld = this.rig.localDirToWorld(FORWARD_LOCAL);
		const angVel = this.state.angularVelocityWorldRadS;
		const rollRateRadS = dot(angVel, forwardWorld);
		const yawRateRadS = dot(angVel, UP_WORLD);
		this.state.rollRateRadS = rollRateRadS;
		this.state.yawRateRadS = yawRateRadS;

		const cmd = this.steeringController.command(this.state.steeringInput, speedMps, dtS);
		this.state.targetLeanRad = cmd.targetLeanRad;

		const cs = countersteer({
			leanRad: this.state.rollRad,
			leanRateRadS: rollRateRadS,
			targetLeanRad: cmd.targetLeanRad,
			speedMps,
			profile: this.riderSteering
		});

		const balanceNm = this.balanceController.torqueNm(
			this.state.rollRad,
			rollRateRadS,
			cmd.targetLeanRad,
			speedMps
		);
		this.rig.addTorqueWorld(scale(forwardWorld, balanceNm + cs.rollMomentNm));

		// Telemetry: the geometric steer angle implied by the *current* yaw rate
		// (bicycle model, §40) plus the turn-in countersteer transient. Right
		// after a step the yaw rate is still ~0, so the counter term dominates and
		// the handlebars read opposite to the turn; as the turn establishes the
		// geometric term grows and the counter term fades.
		const geometricSteerRad = Math.atan(
			(yawRateRadS * this.geometry.wheelbaseM) / Math.max(Math.abs(speedMps), 0.5)
		);
		this.state.steeringAngleRad = geometricSteerRad + cs.steerAngleRad;

		// Yaw follows the lean the bike actually has; a direct term only at
		// parking speed. Tracked with a soft time constant so heading lags lean.
		const leanLedYawRateRadS =
			(GRAVITY_MPS2 * Math.tan(this.state.rollRad)) / Math.max(Math.abs(speedMps), 1);
		const targetYawRateRadS =
			(1 - cs.speedWeight) * cmd.targetYawRateRadS + cs.speedWeight * leanLedYawRateRadS;
		const yawTorqueNm = clamp(
			(this.yawInertiaKgM2 * (targetYawRateRadS - yawRateRadS)) / YAW_TRACK_TIME_S,
			-1200,
			1200
		);
		this.rig.addTorqueWorld(scale(UP_WORLD, yawTorqueNm));
		// The lateral cornering force is now produced by the tyre model
		// (applyTireForces), grip-limited by the friction ellipse.
	}

	private syncPose(): void {
		const pose = this.rig.getPose();
		this.state.positionWorldM = pose.positionWorldM;
		this.state.linearVelocityWorldMps = pose.linearVelocityWorldMps;
		this.state.angularVelocityWorldRadS = pose.angularVelocityWorldRadS;
		this.state.orientationWorld = pose.orientationWorld;
		const ypr = toYawPitchRoll(pose.orientationWorld);
		this.state.yawRad = ypr.yaw;
		this.state.pitchRad = ypr.pitch;
		this.state.rollRad = ypr.roll;
	}
}
