import { describe, expect, it } from 'vitest';
import { SimulationLoop } from './SimulationLoop';

describe('SimulationLoop', () => {
	it('runs one fixed step per elapsed interval and reports alpha', () => {
		const loop = new SimulationLoop({ fixedDtS: 0.01 });
		let steps = 0;
		const alpha = loop.advance(0.025, () => (steps += 1));
		expect(steps).toBe(2);
		expect(alpha).toBeCloseTo(0.5, 6);
		expect(loop.stepCount).toBe(2);
	});

	it('carries the remainder into the next frame', () => {
		const loop = new SimulationLoop({ fixedDtS: 0.01 });
		let steps = 0;
		loop.advance(0.015, () => (steps += 1)); // 1 step, 0.005 pending
		loop.advance(0.006, () => (steps += 1)); // 0.011 pending -> 1 step
		expect(steps).toBe(2);
		expect(loop.pendingS).toBeCloseTo(0.001, 6);
	});

	it('clamps an oversized frame delta instead of simulating it in full', () => {
		const loop = new SimulationLoop({ fixedDtS: 0.01, maxFrameDeltaS: 0.1, maxStepsPerFrame: 100 });
		let steps = 0;
		loop.advance(5, () => (steps += 1)); // tab was backgrounded for 5 s
		expect(steps).toBe(10); // 0.1 s clamp / 0.01 s step
	});

	it('drops the backlog when the per-frame step cap is hit', () => {
		const loop = new SimulationLoop({ fixedDtS: 0.01, maxFrameDeltaS: 1, maxStepsPerFrame: 4 });
		let steps = 0;
		const alpha = loop.advance(1, () => (steps += 1));
		expect(steps).toBe(4);
		expect(alpha).toBe(0);
		expect(loop.pendingS).toBe(0);
	});

	it('rejects a non-positive fixed step', () => {
		expect(() => new SimulationLoop({ fixedDtS: 0 })).toThrow();
	});
});
