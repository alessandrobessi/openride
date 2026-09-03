import { describe, expect, it } from 'vitest';
import { createMotorcycleRig } from '$lib/simulation/physics/createMotorcycleRig';
import { SimulationLoop } from '$lib/simulation/core/SimulationLoop';
import { ADVENTURE_1200 } from '$lib/simulation/motorcycle/configs/adventure-1200';
import { ASSISTS_OFF } from '$lib/simulation/assists/AssistConfig';
import { analogFromHeldKeys } from '$lib/controls/keyboard/KeyboardControls';

const NEUTRAL = { throttle: 0, clutch: 1, frontBrake: 0, rearBrake: 0, steeringInput: 0 };

/**
 * Ties the control-layer steering sign to the simulation. Body +x is the rider's
 * right; the bike starts heading +z. Steering one way must roll and veer the
 * chassis that same way.
 */
async function veerFor(steeringInput: number) {
	const rig = await createMotorcycleRig(ADVENTURE_1200, { assists: ASSISTS_OFF });
	const loop = new SimulationLoop({ fixedDtS: 1 / 120 });
	for (let t = 0; t < 1; t += 1 / 60) {
		loop.advance(1 / 60, (dt) => {
			rig.motorcycle.setControls(NEUTRAL);
			rig.motorcycle.update(dt);
			rig.world.step(dt);
		});
	}
	rig.world.setLinearVelocity(rig.chassisHandle, { x: 0, y: 0, z: 20 });
	rig.motorcycle.resyncWheelsToGround();
	rig.motorcycle.selectGear(4);

	for (let t = 0; t < 4; t += 1 / 60) {
		loop.advance(1 / 60, (dt) => {
			rig.motorcycle.setControls({ ...NEUTRAL, throttle: 0.28, steeringInput });
			rig.motorcycle.update(dt);
			rig.world.step(dt);
		});
	}
	const roll = rig.motorcycle.state.rollRad;
	const vx = rig.world.linearVelocity(rig.chassisHandle).x;
	rig.world.dispose();
	return { roll, vx };
}

describe('steering direction — control layer agrees with the sim', () => {
	it('a positive steeringInput rolls and veers the chassis to its right (+x)', async () => {
		const r = await veerFor(0.6);
		expect(r.roll).toBeGreaterThan(0.05);
		expect(r.vx).toBeGreaterThan(1);
	});

	it('the left keys steer left (negative roll, −x veer)', async () => {
		const left = analogFromHeldKeys(new Set(['a']));
		expect(left.steeringInput).toBeLessThan(0);
		const r = await veerFor(left.steeringInput * 0.6);
		expect(r.roll).toBeLessThan(-0.05);
		expect(r.vx).toBeLessThan(-1);
	});

	it('the right keys steer right (positive roll, +x veer)', async () => {
		const right = analogFromHeldKeys(new Set(['d']));
		expect(right.steeringInput).toBeGreaterThan(0);
		const r = await veerFor(right.steeringInput * 0.6);
		expect(r.roll).toBeGreaterThan(0.05);
		expect(r.vx).toBeGreaterThan(1);
	});
});
