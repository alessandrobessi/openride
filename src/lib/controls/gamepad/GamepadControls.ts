/**
 * Gamepad → normalised motorcycle controls (milestone M22, OPENRIDE-BLUEPRINT
 * §27, AGENTS.md §15). Uses the W3C "standard" gamepad layout:
 *
 *   RT (buttons[7])   analog throttle        0..1
 *   LT (buttons[6])   analog front brake     0..1
 *   RB (buttons[5])   rear brake             0..1
 *   LB (buttons[4])   clutch (pull to disengage)
 *   left stick X      steering               -1..1  (right = +)
 *   A / B             gear up / down         (edge)
 *   dpad up / down    gear up / down         (edge, alt)
 *   Start / Back      restart engine / toggle view (edge)
 *
 * {@link mapGamepad} is pure — it conditions axes and reports button levels.
 * {@link GamepadControls} adds rising-edge detection and an "active" gate so a
 * connected-but-untouched pad never fights the keyboard.
 */
import { clamp01, clampSigned, deadzone01, expo, radialDeadzone } from '../normalize';

export interface GamepadReading {
	axes: readonly number[];
	buttons: readonly { readonly pressed: boolean; readonly value: number }[];
}

export interface GamepadConfig {
	stickDeadzone: number;
	triggerDeadzone: number;
	steerExpo: number;
	throttleExpo: number;
	brakeExpo: number;
	/** Multiplies the conditioned steering before the final clamp. */
	steerSensitivity: number;
	invertSteer: boolean;
}

export const DEFAULT_GAMEPAD_CONFIG: GamepadConfig = {
	stickDeadzone: 0.12,
	triggerDeadzone: 0.04,
	steerExpo: 1.6,
	throttleExpo: 1.35,
	brakeExpo: 1.25,
	steerSensitivity: 1,
	invertSteer: false
};

export interface MappedControls {
	throttle: number;
	frontBrake: number;
	rearBrake: number;
	/** 1 = fully engaged, 0 = pulled in. */
	clutch: number;
	steeringInput: number;
}

export interface GamepadButtonLevels {
	gearUp: boolean;
	gearDown: boolean;
	restart: boolean;
	toggleView: boolean;
}

export interface GamepadFrame {
	controls: MappedControls;
	buttons: GamepadButtonLevels;
	/** True once any control has left neutral — the pad has been touched. */
	active: boolean;
}

const NEUTRAL: MappedControls = {
	throttle: 0,
	frontBrake: 0,
	rearBrake: 0,
	clutch: 1,
	steeringInput: 0
};

const btn = (r: GamepadReading, i: number): { pressed: boolean; value: number } =>
	r.buttons[i] ?? { pressed: false, value: 0 };
const axis = (r: GamepadReading, i: number): number => r.axes[i] ?? 0;

/** Condition one raw gamepad reading into normalised controls + button levels. */
export function mapGamepad(reading: GamepadReading, config: GamepadConfig): GamepadFrame {
	const throttle = clamp01(
		expo(deadzone01(btn(reading, 7).value, config.triggerDeadzone), config.throttleExpo)
	);
	const frontBrake = clamp01(
		expo(deadzone01(btn(reading, 6).value, config.triggerDeadzone), config.brakeExpo)
	);
	const rearBrake = clamp01(btn(reading, 5).value);

	// LB is usually digital; treat its analog value as a partial clutch pull.
	const clutchPull = clamp01(Math.max(btn(reading, 4).value, btn(reading, 4).pressed ? 1 : 0));
	const clutch = 1 - clutchPull;

	const [sx] = radialDeadzone(axis(reading, 0), axis(reading, 1), config.stickDeadzone);
	let steeringInput = expo(sx, config.steerExpo) * config.steerSensitivity;
	if (config.invertSteer) steeringInput = -steeringInput;
	steeringInput = clampSigned(steeringInput);

	const controls: MappedControls = { throttle, frontBrake, rearBrake, clutch, steeringInput };

	const buttons: GamepadButtonLevels = {
		gearUp: btn(reading, 0).pressed || btn(reading, 12).pressed,
		gearDown: btn(reading, 1).pressed || btn(reading, 13).pressed,
		restart: btn(reading, 9).pressed,
		toggleView: btn(reading, 8).pressed
	};

	const active =
		throttle > 0 ||
		frontBrake > 0 ||
		rearBrake > 0 ||
		clutchPull > 0 ||
		Math.abs(steeringInput) > 0 ||
		buttons.gearUp ||
		buttons.gearDown ||
		buttons.restart ||
		buttons.toggleView;

	return { controls, buttons, active };
}

export interface GamepadTick {
	controls: MappedControls;
	/** Rising-edge events since the last tick. */
	events: GamepadButtonLevels;
	/** Whether the pad currently owns input (connected and touched at least once). */
	owning: boolean;
}

/** Stateful wrapper: rising-edge detection and the connected-but-idle gate. */
export class GamepadControls {
	private prev: GamepadButtonLevels = {
		gearUp: false,
		gearDown: false,
		restart: false,
		toggleView: false
	};
	private touched = false;

	constructor(private readonly config: GamepadConfig = DEFAULT_GAMEPAD_CONFIG) {}

	/** Feed the current reading (or null when no pad is connected). */
	poll(reading: GamepadReading | null): GamepadTick {
		if (!reading) {
			this.touched = false;
			this.prev = { gearUp: false, gearDown: false, restart: false, toggleView: false };
			return { controls: NEUTRAL, events: this.prev, owning: false };
		}

		const frame = mapGamepad(reading, this.config);
		if (frame.active) this.touched = true;

		const events: GamepadButtonLevels = {
			gearUp: frame.buttons.gearUp && !this.prev.gearUp,
			gearDown: frame.buttons.gearDown && !this.prev.gearDown,
			restart: frame.buttons.restart && !this.prev.restart,
			toggleView: frame.buttons.toggleView && !this.prev.toggleView
		};
		this.prev = frame.buttons;

		return { controls: frame.controls, events, owning: this.touched };
	}
}
