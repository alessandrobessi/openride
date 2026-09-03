import { describe, expect, it } from 'vitest';
import {
	DEFAULT_GAMEPAD_CONFIG,
	GamepadControls,
	mapGamepad,
	type GamepadReading
} from './GamepadControls';

/** A neutral standard-layout reading with overrides applied. */
function reading(
	over: Partial<{ axes: number[]; buttons: [boolean, number][] }> = {}
): GamepadReading {
	const axes = over.axes ?? [0, 0, 0, 0];
	const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
	for (const [i, [pressed, value]] of (over.buttons ?? []).map((b, i) => [i, b] as const)) {
		buttons[i] = { pressed, value };
	}
	return { axes, buttons };
}

const withButton = (index: number, pressed: boolean, value = pressed ? 1 : 0): GamepadReading => {
	const b: [boolean, number][] = Array.from({ length: 17 }, () => [false, 0]);
	b[index] = [pressed, value];
	return reading({ buttons: b });
};

const cfg = DEFAULT_GAMEPAD_CONFIG;

describe('mapGamepad', () => {
	it('maps the triggers to throttle and front brake through a dead zone', () => {
		expect(mapGamepad(withButton(7, true, 1), cfg).controls.throttle).toBeCloseTo(1, 3);
		expect(mapGamepad(withButton(7, false, 0.02), cfg).controls.throttle).toBe(0); // inside dead zone
		expect(mapGamepad(withButton(6, true, 1), cfg).controls.frontBrake).toBeCloseTo(1, 3);
		expect(mapGamepad(withButton(5, true, 1), cfg).controls.rearBrake).toBe(1);
	});

	it('LB pulls the clutch in (1 → 0)', () => {
		expect(mapGamepad(reading(), cfg).controls.clutch).toBe(1);
		expect(mapGamepad(withButton(4, true), cfg).controls.clutch).toBe(0);
	});

	it('left stick X steers, with a dead zone and optional inversion', () => {
		expect(mapGamepad(reading({ axes: [0.05, 0, 0, 0] }), cfg).controls.steeringInput).toBeCloseTo(
			0,
			10
		);
		// `steeringInput` positive is LEFT (matches the keyboard map), so pushing
		// the stick right reads negative — the bike then steers right.
		const pushRight = mapGamepad(reading({ axes: [0.9, 0, 0, 0] }), cfg).controls.steeringInput;
		expect(pushRight).toBeLessThan(0);
		const pushLeft = mapGamepad(reading({ axes: [-0.9, 0, 0, 0] }), cfg).controls.steeringInput;
		expect(pushLeft).toBeGreaterThan(0);
		const inverted = mapGamepad(reading({ axes: [0.9, 0, 0, 0] }), { ...cfg, invertSteer: true })
			.controls.steeringInput;
		expect(inverted).toBeCloseTo(-pushRight, 6);
	});

	it('reports gear / restart / view button levels and an active flag', () => {
		expect(mapGamepad(reading(), cfg).active).toBe(false);
		const up = mapGamepad(withButton(0, true), cfg);
		expect(up.buttons.gearUp).toBe(true);
		expect(up.active).toBe(true);
		expect(mapGamepad(withButton(1, true), cfg).buttons.gearDown).toBe(true);
		expect(mapGamepad(withButton(9, true), cfg).buttons.restart).toBe(true);
		expect(mapGamepad(withButton(8, true), cfg).buttons.toggleView).toBe(true);
	});
});

describe('GamepadControls', () => {
	it('is not owning until a pad is connected and touched', () => {
		const gp = new GamepadControls();
		expect(gp.poll(null).owning).toBe(false);
		expect(gp.poll(reading()).owning).toBe(false); // connected, untouched
		expect(gp.poll(withButton(7, true, 1)).owning).toBe(true); // throttle pressed
		expect(gp.poll(reading()).owning).toBe(true); // stays owning
	});

	it('emits gear changes on the rising edge only', () => {
		const gp = new GamepadControls();
		expect(gp.poll(withButton(0, true)).events.gearUp).toBe(true);
		expect(gp.poll(withButton(0, true)).events.gearUp).toBe(false); // still held
		expect(gp.poll(reading()).events.gearUp).toBe(false);
		expect(gp.poll(withButton(0, true)).events.gearUp).toBe(true); // pressed again
	});

	it('drops ownership and edge history when the pad disconnects', () => {
		const gp = new GamepadControls();
		gp.poll(withButton(0, true));
		const after = gp.poll(null);
		expect(after.owning).toBe(false);
		expect(gp.poll(withButton(0, true)).events.gearUp).toBe(true); // fresh edge
	});
});
