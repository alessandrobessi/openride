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
import { FallRecovery } from '$lib/simulation/recovery/fallRecovery';
import { analogFromHeldKeys } from '$lib/controls/keyboard/KeyboardControls';

const FRAME_S = 1 / 60;

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

async function stelvioRig() {
	const world = await RapierWorld.create();
	world.addStaticGround(2000, 1, -200);
	world.addTrimeshCollider(collision.positions, collision.indices);
	const spawn = meshIndex.spawn;
	for (const c of terrainIndex.chunks) {
		const cx = c.originX + c.sizeM / 2;
		const cz = c.originZ + c.sizeM / 2;
		if (Math.hypot(cx - spawn.x, cz - spawn.z) > 1600) continue;
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

describe('U-turn on the Stelvio road (real keyboard control path)', () => {
	it('brake to a crawl, hold left, come around ~180° on the road, and ride away', async () => {
		const rig = await stelvioRig();
		const loop = new SimulationLoop({ fixedDtS: 1 / 120 });
		const spawn = meshIndex.spawn;
		const spawnPose = {
			positionWorldM: { x: spawn.x, y: spawn.y, z: spawn.z },
			headingRad: spawn.headingRad
		};
		const recovery = new FallRecovery();

		let clutch = 1;
		let respawns = 0;
		let turnedRad = 0;
		let prevYaw = 0;
		let peakOffCentreM = 0;

		const centreline = (
			JSON.parse(readFileSync(resolve(roadsDir, 'ss38.json'), 'utf8')) as {
				centerline: { x: number; z: number }[];
			}
		).centerline;
		const offCentre = (x: number, z: number) => {
			let d = Infinity;
			for (const p of centreline) d = Math.min(d, Math.hypot(p.x - x, p.z - z));
			return d;
		};

		const run = (seconds: number, keysFor: (turnedDeg: number) => string[]) => {
			for (let t = 0; t < seconds; t += FRAME_S) {
				loop.advance(FRAME_S, (dt) => {
					const held = new Set(keysFor((turnedRad * 180) / Math.PI));
					const a = analogFromHeldKeys(held);
					const engaged = !(held.has('shift') || held.has('c'));
					clutch += ((engaged ? 1 : 0) - clutch) * 0.15;
					rig.motorcycle.setControls({
						throttle: a.throttle,
						clutch,
						frontBrake: a.frontBrake,
						rearBrake: a.rearBrake,
						steeringInput: a.steeringInput
					});
					rig.motorcycle.update(dt);
					rig.world.step(dt);

					const s = rig.motorcycle.state;
					let dYaw = s.yawRad - prevYaw;
					while (dYaw > Math.PI) dYaw -= 2 * Math.PI;
					while (dYaw < -Math.PI) dYaw += 2 * Math.PI;
					turnedRad += dYaw;
					prevYaw = s.yawRad;
					peakOffCentreM = Math.max(
						peakOffCentreM,
						offCentre(s.positionWorldM.x, s.positionWorldM.z)
					);
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
						respawns++;
						rig.motorcycle.respawn(out.positionWorldM, out.headingRad);
						prevYaw = rig.motorcycle.state.yawRad;
					}
				});
			}
		};

		rig.motorcycle.shiftUp(); // into first
		prevYaw = rig.motorcycle.state.yawRad;
		run(4, () => ['w']); // ride out to ~45 km/h
		prevYaw = rig.motorcycle.state.yawRad;
		turnedRad = 0;
		// Brake down to a walking-pace crawl (what you'd actually do).
		for (let i = 0; i < 400 && rig.motorcycle.state.forwardSpeedMps * 3.6 > 13; i++) {
			run(FRAME_S, () => ['s']);
		}
		peakOffCentreM = 0; // measure the excursion of the U-turn itself
		// Full lock, feathering the throttle to hold the crawl through the turn.
		run(9, (deg) =>
			Math.abs(deg) < 175
				? rig.motorcycle.state.forwardSpeedMps * 3.6 < 12
					? ['a', 'w']
					: ['a']
				: []
		);
		const cameAroundKmh = rig.motorcycle.state.forwardSpeedMps * 3.6;
		run(5, () => ['w']); // straighten and ride away

		const s = rig.motorcycle.state;
		expect((Math.abs(turnedRad) * 180) / Math.PI).toBeGreaterThan(150); // it turned around
		expect(respawns).toBe(0); // without being teleported to the start
		expect(peakOffCentreM).toBeLessThan(25); // arc uses the shoulder but stays local
		expect(s.positionWorldM.y).toBeGreaterThan(spawn.y - 2); // still up on the road
		expect(s.forwardSpeedMps * 3.6).toBeGreaterThan(15); // and rode off the other way
		// It didn't have to be flung around to get there.
		expect(cameAroundKmh).toBeLessThan(30);
		rig.world.dispose();
	});
});
