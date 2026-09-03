import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCollisionMesh, type RoadMeshIndex } from '$lib/world/roads/RoadMesh';
import { assertRoadPackage } from '$lib/world/roads/RoadPackage';
import { RapierWorld } from '$lib/simulation/physics/RapierWorld';
import { createMotorcycleRig } from '$lib/simulation/physics/createMotorcycleRig';
import { SimulationLoop } from '$lib/simulation/core/SimulationLoop';
import { ADVENTURE_1200 } from '$lib/simulation/motorcycle/configs/adventure-1200';
import { ASSISTS_OFF } from '$lib/simulation/assists/AssistConfig';
import type { MotorcycleControls } from '$lib/simulation/motorcycle/Motorcycle';

const NEUTRAL: MotorcycleControls = {
	throttle: 0,
	clutch: 1,
	frontBrake: 0,
	rearBrake: 0,
	steeringInput: 0
};
const RENDER_FRAME_S = 1 / 60;

const dir = resolve('static/worlds/stelvio/roads');
const index = JSON.parse(readFileSync(resolve(dir, 'ss38.mesh.json'), 'utf8')) as RoadMeshIndex;
const collBuf = readFileSync(resolve(dir, index.collision.file));
const collision = parseCollisionMesh(
	collBuf.buffer.slice(collBuf.byteOffset, collBuf.byteOffset + collBuf.byteLength)
);
const roadPkg: unknown = JSON.parse(readFileSync(resolve(dir, 'ss38.json'), 'utf8'));
assertRoadPackage(roadPkg);
const centerline = roadPkg.centerline;

/** Minimal pure-pursuit: steer toward a look-ahead point on the centreline. */
function pursuitSteer(pos: { x: number; z: number }, headingRad: number): number {
	let nearest = 0;
	let best = Infinity;
	for (let i = 0; i < centerline.length; i++) {
		const d = (centerline[i].x - pos.x) ** 2 + (centerline[i].z - pos.z) ** 2;
		if (d < best) {
			best = d;
			nearest = i;
		}
	}
	const target = centerline[Math.min(centerline.length - 1, nearest + 6)];
	const desired = Math.atan2(target.x - pos.x, target.z - pos.z);
	let err = desired - headingRad;
	while (err > Math.PI) err -= 2 * Math.PI;
	while (err < -Math.PI) err += 2 * Math.PI;
	return Math.max(-1, Math.min(1, err * 1.4));
}

async function stelvioRig() {
	const world = await RapierWorld.create();
	world.addStaticGround(2000, 1, -40); // safety floor far below the road
	world.addTrimeshCollider(collision.positions, collision.indices);
	const rig = await createMotorcycleRig(ADVENTURE_1200, {
		world,
		withGround: false,
		spawn: index.spawn,
		assists: ASSISTS_OFF
	});
	return rig;
}

describe('M16 rideable Stelvio road mesh (headless)', () => {
	it('the bike settles on the road surface, not the safety floor', async () => {
		const rig = await stelvioRig();
		const loop = new SimulationLoop({ fixedDtS: 1 / 120 });
		for (let t = 0; t < 3; t += RENDER_FRAME_S) {
			loop.advance(RENDER_FRAME_S, (dt) => {
				rig.motorcycle.setControls(NEUTRAL);
				rig.motorcycle.update(dt);
				rig.world.step(dt);
			});
		}
		const s = rig.motorcycle.state;
		rig.world.dispose();

		// Rests near the spawn elevation (road ≈ 1600 m band, safety floor is −40).
		expect(s.positionWorldM.y).toBeGreaterThan(index.spawn.y - 1);
		expect(s.positionWorldM.y).toBeLessThan(index.spawn.y + 1);
		// Suspension is loaded by the road, both wheels down.
		expect(s.frontContactGround && s.rearContactGround).toBe(true);
		const supported = s.frontNormalLoadN + s.rearNormalLoadN;
		const weight = ADVENTURE_1200.physical.mass.totalKg * 9.80665;
		expect(supported).toBeGreaterThan(weight * 0.85);
		expect(Math.abs(s.rollRad)).toBeLessThan(0.15);
	});

	it('a path-follower rides a substantial stretch, climbing, staying on the ribbon', async () => {
		const rig = await stelvioRig();
		const loop = new SimulationLoop({ fixedDtS: 1 / 120 });
		for (let t = 0; t < 1.5; t += RENDER_FRAME_S) {
			loop.advance(RENDER_FRAME_S, (dt) => {
				rig.motorcycle.setControls(NEUTRAL);
				rig.motorcycle.update(dt);
				rig.world.step(dt);
			});
		}
		rig.motorcycle.resyncWheelsToGround();
		rig.motorcycle.selectGear(2);
		const startY = rig.motorcycle.state.positionWorldM.y;

		let maxLateralOffM = 0;
		let onRoadUntilS = 0;
		let lastOnRoadY = startY;
		let lastOnRoadSpeed = 0;
		for (let t = 0; t < 25; t += RENDER_FRAME_S) {
			loop.advance(RENDER_FRAME_S, (dt) => {
				const st = rig.motorcycle.state;
				rig.motorcycle.setControls({
					...NEUTRAL,
					throttle: 0.28,
					clutch: 1,
					steeringInput: pursuitSteer(st.positionWorldM, st.yawRad)
				});
				rig.motorcycle.update(dt);
				rig.world.step(dt);
			});
			const st = rig.motorcycle.state;
			let nearest = Infinity;
			for (const p of centerline) {
				nearest = Math.min(
					nearest,
					Math.hypot(p.x - st.positionWorldM.x, p.z - st.positionWorldM.z)
				);
			}
			if (st.positionWorldM.y > -20 && nearest < index.widthM) {
				onRoadUntilS = t;
				lastOnRoadY = st.positionWorldM.y;
				lastOnRoadSpeed = st.forwardSpeedMps;
				maxLateralOffM = Math.max(maxLateralOffM, nearest);
			} else break;
		}
		rig.world.dispose();

		// Rode a meaningful distance on the carriageway before any excursion.
		expect(onRoadUntilS).toBeGreaterThan(12);
		expect(maxLateralOffM).toBeLessThan(index.widthM);
		expect(lastOnRoadY).toBeGreaterThan(startY + 3); // real elevation gained on the climb
		expect(lastOnRoadSpeed).toBeGreaterThan(4);
	});
});
