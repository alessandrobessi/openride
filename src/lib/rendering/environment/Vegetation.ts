import * as THREE from 'three';
import type { VegetationData } from '$lib/world/scenery/SceneryPackage';

/**
 * Instances the baked conifers (milestone M26). Two `InstancedMesh`es — trunks
 * and foliage cones — sharing one per-instance transform, so the whole forest
 * is two draw calls. Geometry is translated so its local origin is the ground
 * contact point.
 */
export interface Vegetation {
	group: THREE.Group;
	dispose: () => void;
}

export function createVegetation(data: VegetationData): Vegetation {
	const group = new THREE.Group();
	group.name = 'vegetation';
	const disposables: Array<{ dispose: () => void }> = [];

	const trunkGeom = new THREE.CylinderGeometry(0.1, 0.16, 0.9, 6);
	trunkGeom.translate(0, 0.45, 0);
	const foliageGeom = new THREE.ConeGeometry(1.4, 3.8, 7);
	foliageGeom.translate(0, 0.8 + 1.9, 0);
	disposables.push(trunkGeom, foliageGeom);

	const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3726, roughness: 0.9 });
	const foliageMat = new THREE.MeshStandardMaterial({
		color: 0x33492f,
		roughness: 1,
		flatShading: true
	});
	disposables.push(trunkMat, foliageMat);

	const n = data.count;
	const trunks = new THREE.InstancedMesh(trunkGeom, trunkMat, n);
	const foliage = new THREE.InstancedMesh(foliageGeom, foliageMat, n);
	trunks.frustumCulled = false;
	foliage.frustumCulled = false;

	const dummy = new THREE.Object3D();
	for (let i = 0; i < n; i++) {
		const o = i * 5;
		dummy.position.set(data.instances[o], data.instances[o + 1], data.instances[o + 2]);
		dummy.rotation.set(0, data.instances[o + 4], 0);
		dummy.scale.setScalar(data.instances[o + 3]);
		dummy.updateMatrix();
		trunks.setMatrixAt(i, dummy.matrix);
		foliage.setMatrixAt(i, dummy.matrix);
	}
	trunks.instanceMatrix.needsUpdate = true;
	foliage.instanceMatrix.needsUpdate = true;
	group.add(trunks, foliage);
	disposables.push({ dispose: () => trunks.dispose() }, { dispose: () => foliage.dispose() });

	return {
		group,
		dispose: () => {
			for (const d of disposables) d.dispose();
		}
	};
}
