import { describe, expect, it } from 'vitest';
import {
	analogFromHeldKeys,
	clutchEngagedFromHeldKeys,
	edgeActionForKey
} from './KeyboardControls';

describe('keyboard map', () => {
	it('routes full-press keys to their action', () => {
		expect(edgeActionForKey('e')).toEqual({ kind: 'shiftUp' });
		expect(edgeActionForKey('Q')).toEqual({ kind: 'shiftDown' });
		expect(edgeActionForKey('r')).toEqual({ kind: 'restart' });
		expect(edgeActionForKey('1')).toEqual({ kind: 'toggleAssist', assist: 'abs' });
		expect(edgeActionForKey('2')).toEqual({ kind: 'toggleAssist', assist: 'tractionControl' });
		expect(edgeActionForKey('3')).toEqual({ kind: 'toggleAssist', assist: 'wheelieControl' });
		expect(edgeActionForKey('v')).toEqual({ kind: 'toggleView' });
		expect(edgeActionForKey('w')).toBeNull();
	});

	it('builds analog controls from held keys', () => {
		expect(analogFromHeldKeys(new Set(['w']))).toMatchObject({ throttle: 1, frontBrake: 0 });
		expect(analogFromHeldKeys(new Set(['arrowup']))).toMatchObject({ throttle: 1 });
		expect(analogFromHeldKeys(new Set(['s']))).toMatchObject({ frontBrake: 1, rearBrake: 1 });
		expect(analogFromHeldKeys(new Set(['a'])).steeringInput).toBe(-1);
		expect(analogFromHeldKeys(new Set(['d'])).steeringInput).toBe(1);
		expect(analogFromHeldKeys(new Set(['a', 'd'])).steeringInput).toBe(0);
	});

	it('treats Shift / C as the clutch pull', () => {
		expect(clutchEngagedFromHeldKeys(new Set())).toBe(true);
		expect(clutchEngagedFromHeldKeys(new Set(['c']))).toBe(false);
		expect(clutchEngagedFromHeldKeys(new Set(['shift']))).toBe(false);
	});
});
