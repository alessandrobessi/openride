import { beforeEach, describe, expect, it } from 'vitest';
import { Engine } from './Engine';
import { ADVENTURE_1200 } from '../motorcycle/configs/adventure-1200';

const { engine: engineConfig, torqueCurve } = ADVENTURE_1200.powertrain;
const inertia = ADVENTURE_1200.physical.inertia.engineKgM2;
const DT = 1 / 120;

function makeEngine() {
	return new Engine(engineConfig, torqueCurve, inertia);
}

/** Advance `engine` for `seconds` at a constant throttle command. */
function run(engine: Engine, seconds: number, throttle: number, loadNm = 0) {
	for (let t = 0; t < seconds; t += DT) engine.update(DT, throttle, loadNm);
}

describe('Engine (neutral / decoupled — M5)', () => {
	let engine: Engine;
	beforeEach(() => {
		engine = makeEngine();
	});

	it('starts at idle and holds idle with the throttle closed', () => {
		expect(engine.rpm).toBeCloseTo(engineConfig.idleRPM, 0);
		run(engine, 4, 0);
		expect(engine.rpm).toBeGreaterThan(engineConfig.idleRPM - 120);
		expect(engine.rpm).toBeLessThan(engineConfig.idleRPM + 120);
	});

	it('revs up under throttle and never blows past the limiter', () => {
		run(engine, 4, 1);
		expect(engine.rpm).toBeGreaterThan(engineConfig.redlineRPM - 500);
		expect(engine.rpm).toBeLessThan(engineConfig.limiterRPM + 50);
	});

	it('cuts combustion torque toward zero at the limiter', () => {
		run(engine, 5, 1);
		expect(engine.rpm).toBeLessThan(engineConfig.limiterRPM + 50);
		expect(engine.lastCombustionTorqueNm).toBeLessThan(20);
	});

	it('applies throttle with a first-order lag, not a step', () => {
		// One tick after a 0→1 step, the acting throttle is far below 1.
		engine.update(DT, 1);
		expect(engine.throttleActual).toBeLessThan(0.2);
		// ~one time constant later it is around 1 − 1/e ≈ 0.63.
		run(engine, engineConfig.throttleResponseTimeS, 1);
		expect(engine.throttleActual).toBeGreaterThan(0.5);
		expect(engine.throttleActual).toBeLessThan(0.8);
	});

	it('engine-brakes back toward idle when the throttle is released', () => {
		run(engine, 3, 1); // up near the limiter
		const revved = engine.rpm;
		run(engine, 4, 0); // lift off
		expect(engine.rpm).toBeLessThan(revved - 3000);
		expect(engine.rpm).toBeLessThan(engineConfig.idleRPM + 150);
	});

	it('closed-throttle drag torque grows with engine speed (engine braking)', () => {
		const hi = makeEngine();
		run(hi, 2, 1); // spin up near the limiter
		run(hi, 0.3, 0); // let the throttle lag decay so engine braking is active
		const lo = makeEngine();
		run(lo, 0.3, 0); // idling, closed throttle
		expect(hi.rpm).toBeGreaterThan(lo.rpm + 2000);
		expect(hi.lastFrictionTorqueNm).toBeGreaterThan(lo.lastFrictionTorqueNm * 1.5);
	});

	it('a resisting load torque drags the engine speed down', () => {
		const free = makeEngine();
		run(free, 1.5, 0.5);
		const loaded = makeEngine();
		run(loaded, 1.5, 0.5, 40);
		expect(loaded.rpm).toBeLessThan(free.rpm);
	});

	it('stalls under a sustained load it cannot answer, and restarts', () => {
		// Closed throttle, a load far beyond the idle governor's authority.
		run(engine, 1, 0, 150);
		expect(engine.stalled).toBe(true);
		expect(engine.lastCombustionTorqueNm).toBe(0);

		engine.restart();
		expect(engine.stalled).toBe(false);
		expect(engine.rpm).toBeCloseTo(engineConfig.idleRPM, 0);

		// With the load removed it holds idle again.
		run(engine, 2, 0);
		expect(engine.stalled).toBe(false);
		expect(engine.rpm).toBeGreaterThan(engineConfig.idleRPM - 150);
	});

	it('does not stall from a brief load nip at part throttle', () => {
		run(engine, 0.5, 0.4); // spin up a little
		run(engine, 0.15, 0.4, 120); // a short overload
		run(engine, 0.5, 0.4); // release
		expect(engine.stalled).toBe(false);
	});

	it('never stalls from low RPM alone (neutral coast, no load)', () => {
		run(engine, 5, 0); // idles forever
		expect(engine.stalled).toBe(false);
	});
});
