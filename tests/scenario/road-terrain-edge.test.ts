import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCollisionMesh, type RoadMeshIndex } from '$lib/world/roads/RoadMesh';
import { parseTerrainChunk, type TerrainIndex } from '$lib/world/terrain/TerrainChunk';
import { RapierWorld } from '$lib/simulation/physics/RapierWorld';
import { createMotorcycleRig } from '$lib/simulation/physics/createMotorcycleRig';
import { SimulationLoop } from '$lib/simulation/core/SimulationLoop';
import { ADVENTURE_1200 } from '$lib/simulation/motorcycle/configs/adventure-1200';
import { DEFAULT_ASSISTS } from '$lib/simulation/assists/AssistConfig';
import { FallRecovery, type FallRecoveryPose } from '$lib/simulation/recovery/fallRecovery';

const FRAME_S = 1 / 60;
const NEUTRAL = { throttle: 0, clutch: 1, frontBrake: 0, rearBrake: 0, steeringInput: 0 };

const roadsDir = resolve('static/worlds/stelvio/roads');
const terrainDir = resolve('static/worlds/stelvio/terrain');
const meshIndex = JSON.parse(
	readFileSync(resolve(roadsDir, 'ss38.mesh.json'), 'utf8')
) as RoadMeshIndex;
const collBuf = readFileSync(resolve(roadsDir, meshIndex.collision.file));
const collision = parseCollisionMesh(
	collBuf.buffer.slice(collBuf.byteOffset, collBuf.byteOffset + collBuf.byteLength)
);
const terrainIndex = JSON.parse(
	readFileSync(resolve(terrainDir, 'index.json'), 'utf8')
) as TerrainIndex;

/** Road collision ribbon + the terrain heightfield chunks near the spawn — the
 *  real runtime collision set, where the ribbon meets the terrain at its edge. */
async function roadWithTerrainRig() {
	const world = await RapierWorld.create();
	world.addStaticGround(2000, 1, -200);
	world.addTrimeshCollider(collision.positions, collision.indices);
	const spawn = meshIndex.spawn;
	for (const c of terrainIndex.chunks) {
		const cx = c.originX + c.sizeM / 2;
		const cz = c.originZ + c.sizeM / 2;
		if (Math.hypot(cx - spawn.x, cz - spawn.z) > 1400) continue;
		const b = readFileSync(resolve(terrainDir, c.file));
		const { heights } = parseTerrainChunk(
			b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
		);
		world.addHeightfieldChunk(terrainIndex.gridSize, heights, c.sizeM, cx, cz);
	}
	return createMotorcycleRig(ADVENTURE_1200, {
		world,
		withGround: false,
		spawn,
		assists: DEFAULT_ASSISTS
	});
}

describe('U-turn near the spawn (BLUEPRINT §42 — the rider wants another run)', () => {
	it('comes around 180° on the drivable surface — no drop off the edge, no suspension blow-up', async () => {
		const rig = await roadWithTerrainRig();
		const loop = new SimulationLoop({ fixedDtS: 1 / 120 });
		const step = (seconds: number, drive: () => void) => {
			for (let t = 0; t < seconds; t += FRAME_S) {
				loop.advance(FRAME_S, (dt) => {
					drive();
					rig.motorcycle.update(dt);
					rig.world.step(dt);
				});
			}
		};

		step(2, () => rig.motorcycle.setControls(NEUTRAL));
		rig.motorcycle.resyncWheelsToGround();
		rig.motorcycle.selectGear(1);
		const startY = rig.motorcycle.state.positionWorldM.y;
		step(2.5, () => rig.motorcycle.setControls({ ...NEUTRAL, throttle: 0.28 }));

		let turnedRad = 0;
		let prevYaw = rig.motorcycle.state.yawRad;
		let peakLoadN = 0;
		let airborneFrames = 0;
		let minY = Infinity;
		step(9, () => {
			rig.motorcycle.setControls({ ...NEUTRAL, throttle: 0.14, steeringInput: 1 });
			const s = rig.motorcycle.state;
			let dYaw = s.yawRad - prevYaw;
			while (dYaw > Math.PI) dYaw -= 2 * Math.PI;
			while (dYaw < -Math.PI) dYaw += 2 * Math.PI;
			turnedRad += dYaw;
			prevYaw = s.yawRad;
			peakLoadN = Math.max(peakLoadN, s.frontNormalLoadN, s.rearNormalLoadN);
			if (!s.frontContactGround && !s.rearContactGround) airborneFrames++;
			minY = Math.min(minY, s.positionWorldM.y);
		});

		// It actually turns around.
		expect(Math.abs(turnedRad)).toBeGreaterThan(Math.PI);
		// The tight low-speed circle stays put — at most one brief dip off the road
		// edge onto the shoulder, not a bouncing mess.
		expect(airborneFrames).toBeLessThan(60); // < ~1 s total
		expect(startY - minY).toBeLessThan(1.2); // a ~1 m shoulder step at worst
		// No raycast-seam bump-stop spike (the old failure was ~100 kN).
		expect(peakLoadN).toBeLessThan(20_000);
		rig.world.dispose();
	});

	it('a rider who runs wide off the world is recovered onto the road, not lost down the mountain', async () => {
		const rig = await roadWithTerrainRig();
		const loop = new SimulationLoop({ fixedDtS: 1 / 120 });
		const spawn = meshIndex.spawn;
		const spawnPose: FallRecoveryPose = {
			positionWorldM: { x: spawn.x, y: spawn.y, z: spawn.z },
			headingRad: spawn.headingRad
		};
		const recovery = new FallRecovery();
		let respawns = 0;

		const step = (seconds: number, drive: () => void) => {
			for (let t = 0; t < seconds; t += FRAME_S) {
				loop.advance(FRAME_S, (dt) => {
					drive();
					rig.motorcycle.update(dt);
					rig.world.step(dt);
					const s = rig.motorcycle.state;
					const out = recovery.update(
						{
							positionWorldM: s.positionWorldM,
							verticalSpeedMps: s.linearVelocityWorldMps.y,
							rollRad: s.rollRad,
							pitchRad: s.pitchRad,
							frontContactGround: s.frontContactGround,
							rearContactGround: s.rearContactGround
						},
						dt,
						spawnPose
					);
					if (out) {
						rig.motorcycle.respawn(out.positionWorldM, out.headingRad);
						respawns++;
					}
				});
			}
		};

		step(2, () => rig.motorcycle.setControls(NEUTRAL));
		rig.motorcycle.resyncWheelsToGround();
		rig.motorcycle.selectGear(1);
		// Pin the throttle and hold full lock — the keyboard "U-turn at speed" that
		// runs the bike clean off the carriageway, over and over.
		step(10, () => rig.motorcycle.setControls({ ...NEUTRAL, throttle: 1, steeringInput: 1 }));
		let deepestY = Infinity;
		// Then just coast and let the last respawn settle.
		step(6, () => {
			rig.motorcycle.setControls(NEUTRAL);
			deepestY = Math.min(deepestY, rig.motorcycle.state.positionWorldM.y);
		});

		const s = rig.motorcycle.state;
		// Whether the rider held it together or the recovery caught them, the one
		// thing that must not happen is being lost hundreds of metres down the
		// mountain (the old failure). If it did fall, recovery bounds the drop.
		expect(deepestY).toBeGreaterThan(spawn.y - 15);
		expect(s.positionWorldM.y).toBeGreaterThan(spawn.y - 3);
		expect(Math.abs(s.rollRad)).toBeLessThan(0.7);
		expect(s.frontContactGround || s.rearContactGround).toBe(true);
		void respawns;
		rig.world.dispose();
	});
});
