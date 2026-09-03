/**
 * Keyboard control map (OPENRIDE-BLUEPRINT.md §27). Development input until the
 * gamepad (M22) is the primary path; both stay wired.
 *
 *   W / ↑    throttle          A / D or ← / →   steer
 *   S / ↓    front + rear brake   Shift / C     clutch (hold to disengage)
 *   Q / E    gear down / up     R               restart engine
 *   1 / 2 / 3  toggle ABS / TC / wheelie control
 *   V        toggle cockpit / chase view
 *
 * The analog helpers are pure so they can be unit-tested; `attachKeyboardControls`
 * is the thin listener wrapper.
 */

export interface KeyboardAnalog {
	throttle: number;
	frontBrake: number;
	rearBrake: number;
	steeringInput: number;
}

export interface KeyboardHandlers {
	setAnalog: (c: KeyboardAnalog) => void;
	setClutchEngaged: (engaged: boolean) => void;
	shiftUp: () => void;
	shiftDown: () => void;
	restartEngine: () => void;
	toggleAssist: (assist: 'abs' | 'tractionControl' | 'wheelieControl') => void;
	toggleView: () => void;
	shiftTimeOfDay: (deltaHours: number) => void;
}

export type EdgeAction =
	| { kind: 'shiftUp' }
	| { kind: 'shiftDown' }
	| { kind: 'restart' }
	| { kind: 'toggleAssist'; assist: 'abs' | 'tractionControl' | 'wheelieControl' }
	| { kind: 'toggleView' }
	| { kind: 'shiftTimeOfDay'; deltaHours: number };

/** Full-press action for a key, or null if the key only affects the analog state. */
export function edgeActionForKey(key: string): EdgeAction | null {
	switch (key.toLowerCase()) {
		case 'e':
			return { kind: 'shiftUp' };
		case 'q':
			return { kind: 'shiftDown' };
		case 'r':
			return { kind: 'restart' };
		case '1':
			return { kind: 'toggleAssist', assist: 'abs' };
		case '2':
			return { kind: 'toggleAssist', assist: 'tractionControl' };
		case '3':
			return { kind: 'toggleAssist', assist: 'wheelieControl' };
		case 'v':
			return { kind: 'toggleView' };
		case '[':
			return { kind: 'shiftTimeOfDay', deltaHours: -0.5 };
		case ']':
			return { kind: 'shiftTimeOfDay', deltaHours: 0.5 };
		default:
			return null;
	}
}

/**
 * Normalised analog controls from the set of currently-held keys (lower-case).
 *
 * `steeringInput` follows the rider-model sign convention (see the
 * `tests/scenario/steering-step` step test): **positive steers left**. So the
 * left keys produce +1 and the right keys −1 — press left, lean left.
 */
export function analogFromHeldKeys(held: ReadonlySet<string>): KeyboardAnalog {
	const has = (...keys: string[]) => keys.some((k) => held.has(k));
	const brake = has('s', 'arrowdown') ? 1 : 0;
	const left = has('a', 'arrowleft');
	const right = has('d', 'arrowright');
	return {
		throttle: has('w', 'arrowup') ? 1 : 0,
		frontBrake: brake,
		rearBrake: brake,
		steeringInput: (left ? 1 : 0) - (right ? 1 : 0)
	};
}

/** True when the held keys mean "clutch engaged" (Shift / C not held). */
export function clutchEngagedFromHeldKeys(held: ReadonlySet<string>): boolean {
	return !(held.has('shift') || held.has('c'));
}

/** Attach listeners; returns a disposer. `target` defaults to `window`. */
export function attachKeyboardControls(
	handlers: KeyboardHandlers,
	target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window
): () => void {
	const held = new Set<string>();

	const push = () => {
		handlers.setAnalog(analogFromHeldKeys(held));
		handlers.setClutchEngaged(clutchEngagedFromHeldKeys(held));
	};

	const onDown = (e: KeyboardEvent) => {
		const k = e.key.toLowerCase();
		if (!held.has(k)) {
			const action = edgeActionForKey(k);
			if (action) applyEdge(handlers, action);
		}
		held.add(k);
		push();
	};
	const onUp = (e: KeyboardEvent) => {
		held.delete(e.key.toLowerCase());
		push();
	};

	target.addEventListener('keydown', onDown as EventListener);
	target.addEventListener('keyup', onUp as EventListener);
	return () => {
		target.removeEventListener('keydown', onDown as EventListener);
		target.removeEventListener('keyup', onUp as EventListener);
	};
}

function applyEdge(handlers: KeyboardHandlers, action: EdgeAction): void {
	switch (action.kind) {
		case 'shiftUp':
			return handlers.shiftUp();
		case 'shiftDown':
			return handlers.shiftDown();
		case 'restart':
			return handlers.restartEngine();
		case 'toggleAssist':
			return handlers.toggleAssist(action.assist);
		case 'toggleView':
			return handlers.toggleView();
		case 'shiftTimeOfDay':
			return handlers.shiftTimeOfDay(action.deltaHours);
	}
}
