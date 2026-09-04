import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCollisionMesh, parseSurfaceMesh, type RoadMeshIndex } from './RoadMesh';

const dir = resolve('static/worlds/stelvio/roads');
const readAB = (name: string) => {
	const b = readFileSync(resolve(dir, name));
	return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
};

const index = JSON.parse(readFileSync(resolve(dir, 'ss38.mesh.json'), 'utf8')) as RoadMeshIndex;

describe('Stelvio road mesh (M16)', () => {
	it('index describes both meshes and a spawn pose', () => {
		expect(index.widthM).toBeGreaterThan(4);
		expect(index.widthM).toBeLessThan(9);
		expect(index.surface.indexCount % 3).toBe(0);
		expect(index.collision.indexCount % 3).toBe(0);
		expect(Number.isFinite(index.spawn.x)).toBe(true);
		expect(Number.isFinite(index.spawn.headingRad)).toBe(true);
	});

	it('surface binary matches the index and has valid, finite geometry', () => {
		const m = parseSurfaceMesh(readAB(index.surface.file));
		expect(m.positions.length).toBe(index.surface.vertexCount * 3);
		expect(m.normals.length).toBe(index.surface.vertexCount * 3);
		expect(m.uvs.length).toBe(index.surface.vertexCount * 2);
		expect(m.indices.length).toBe(index.surface.indexCount);
		expect([...m.positions].every(Number.isFinite)).toBe(true);
		expect(Math.max(...m.indices)).toBeLessThan(index.surface.vertexCount);
	});

	it('surface triangles wind so the road faces up (THREE FrontSide would cull it otherwise)', () => {
		const m = parseSurfaceMesh(readAB(index.surface.file));
		const p = m.positions;
		let up = 0;
		for (let t = 0; t < m.indices.length; t += 3) {
			const a = m.indices[t] * 3;
			const b = m.indices[t + 1] * 3;
			const c = m.indices[t + 2] * 3;
			// y of (v1 - v0) × (v2 - v0)
			const ux = p[b] - p[a];
			const uz = p[b + 2] - p[a + 2];
			const vx = p[c] - p[a];
			const vz = p[c + 2] - p[a + 2];
			if (uz * vx - ux * vz > 0) up++;
		}
		expect(up).toBe(m.indices.length / 3); // every triangle
	});

	it('collision binary is a valid trimesh, wider than the visual surface', () => {
		const s = parseSurfaceMesh(readAB(index.surface.file));
		const c = parseCollisionMesh(readAB(index.collision.file));
		expect(c.positions.length).toBe(index.collision.vertexCount * 3);
		expect(Math.max(...c.indices)).toBeLessThan(index.collision.vertexCount);

		// Cross-ribbon span of the first station: collision ⊃ surface.
		const span = (p: Float32Array) => Math.hypot(p[0] - p[3], p[1] - p[4], p[2] - p[5]);
		expect(span(c.positions)).toBeGreaterThan(span(s.positions));
	});

	it('the ribbon climbs (spawn is at the low end)', () => {
		const c = parseCollisionMesh(readAB(index.collision.file));
		const firstY = c.positions[1];
		const lastY = c.positions[c.positions.length - 2];
		expect(Math.abs(lastY - firstY)).toBeGreaterThan(400);
		expect(index.spawn.y).toBeLessThan(Math.max(firstY, lastY));
	});
});
