import * as THREE from 'three';
import type { FurnitureData } from '$lib/world/scenery/SceneryPackage';

/**
 * Instances the baked road furniture (milestone M25): guardrail posts, marker
 * (delineator) posts, and continuous rail bands along both edges. One
 * `InstancedMesh` per post kind and one merged mesh for the rails — a handful
 * of draw calls for the whole pass.
 */
export interface RoadFurniture {
	group: THREE.Group;
	dispose: () => void;
}

const RAIL_BOTTOM = 0.34;
const RAIL_TOP = 0.62;

export function createRoadFurniture(data: FurnitureData): RoadFurniture {
	const group = new THREE.Group();
	group.name = 'road-furniture';
	const disposables: Array<{ dispose: () => void }> = [];
	const track = <T extends { dispose: () => void }>(x: T): T => (disposables.push(x), x);

	const postGeom = track(new THREE.BoxGeometry(0.08, 1, 0.08));
	const guardMat = track(
		new THREE.MeshStandardMaterial({ color: 0x9a9ea3, roughness: 0.5, metalness: 0.5 })
	);
	const markerMat = track(
		new THREE.MeshStandardMaterial({
			color: 0xd8dde2,
			roughness: 0.6,
			emissive: 0x20242a,
			emissiveIntensity: 1
		})
	);

	const guardPosts = data.posts.filter((p) => p.kind === 'guardrail');
	const markerPosts = data.posts.filter((p) => p.kind === 'delineator');
	const dummy = new THREE.Object3D();

	const addPosts = (posts: typeof data.posts, mat: THREE.Material) => {
		if (posts.length === 0) return;
		const mesh = new THREE.InstancedMesh(postGeom, mat, posts.length);
		mesh.frustumCulled = false; // instances span the whole route
		posts.forEach((p, i) => {
			dummy.position.set(p.x, p.y + p.h / 2, p.z);
			dummy.rotation.set(0, p.ry, 0);
			dummy.scale.set(1, p.h, 1);
			dummy.updateMatrix();
			mesh.setMatrixAt(i, dummy.matrix);
		});
		mesh.instanceMatrix.needsUpdate = true;
		group.add(mesh);
		disposables.push({ dispose: () => mesh.dispose() });
	};
	addPosts(guardPosts, guardMat);
	addPosts(markerPosts, markerMat);

	// Rail bands: a vertical quad per polyline segment, all merged into one mesh.
	const railMat = track(
		new THREE.MeshStandardMaterial({
			color: 0xb7bcc2,
			roughness: 0.4,
			metalness: 0.6,
			side: THREE.DoubleSide
		})
	);
	const positions: number[] = [];
	const indices: number[] = [];
	for (const rail of data.rails) {
		for (let i = 0; i < rail.length - 1; i++) {
			const a = rail[i];
			const b = rail[i + 1];
			const base = positions.length / 3;
			positions.push(
				a.x,
				a.y + RAIL_BOTTOM,
				a.z,
				b.x,
				b.y + RAIL_BOTTOM,
				b.z,
				b.x,
				b.y + RAIL_TOP,
				b.z,
				a.x,
				a.y + RAIL_TOP,
				a.z
			);
			indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
		}
	}
	if (indices.length > 0) {
		const geom = track(new THREE.BufferGeometry());
		geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
		geom.setIndex(indices);
		geom.computeVertexNormals();
		const railMesh = new THREE.Mesh(geom, railMat);
		railMesh.name = 'guardrails';
		railMesh.frustumCulled = false;
		group.add(railMesh);
	}

	return {
		group,
		dispose: () => {
			for (const d of disposables) d.dispose();
		}
	};
}
