import * as THREE from 'three';
import type { BuildingsData } from '$lib/world/scenery/SceneryPackage';

/**
 * Extrudes the OSM building footprints (milestone M27) — recognizable
 * silhouettes, not architecture. One extruded mesh per footprint, sharing a
 * stucco-ish material; a handful of buildings, a handful of draw calls.
 */
export interface Buildings {
	group: THREE.Group;
	dispose: () => void;
}

export function createBuildings(data: BuildingsData): Buildings {
	const group = new THREE.Group();
	group.name = 'buildings';
	const disposables: Array<{ dispose: () => void }> = [];

	const wallMat = new THREE.MeshStandardMaterial({ color: 0xcbc1b0, roughness: 0.85 });
	const roofMat = new THREE.MeshStandardMaterial({ color: 0x6b4a3a, roughness: 0.9 });
	disposables.push(wallMat, roofMat);

	const extrudeUp = (shape: THREE.Shape, depth: number, atY: number): THREE.ExtrudeGeometry => {
		const geom = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
		geom.rotateX(-Math.PI / 2);
		geom.translate(0, atY, 0);
		geom.computeVertexNormals();
		geom.computeBoundingSphere();
		return geom;
	};

	for (const b of data.buildings) {
		if (b.footprint.length < 3) continue;
		try {
			const shape = new THREE.Shape();
			b.footprint.forEach((p, i) => {
				// Shape (x, -z); after rotateX(-90°) the -z becomes +z and the
				// extrude depth (was +z) becomes +y.
				if (i === 0) shape.moveTo(p.x, -p.z);
				else shape.lineTo(p.x, -p.z);
			});
			shape.closePath();

			const geom = extrudeUp(shape, b.heightM, b.baseY);
			// Skip a footprint that failed to triangulate into anything sane.
			if (geom.index === null || geom.index.count === 0 || !geom.boundingSphere) continue;
			if (!Number.isFinite(geom.boundingSphere.radius)) continue;
			disposables.push(geom);

			const mesh = new THREE.Mesh(geom, wallMat);
			mesh.name = b.name ? `building-${b.name}` : 'building';
			group.add(mesh);

			// A thin dark cap so the roofline reads against the mountain.
			const capGeom = extrudeUp(shape, 0.4, b.baseY + b.heightM);
			disposables.push(capGeom);
			group.add(new THREE.Mesh(capGeom, roofMat));
		} catch (err) {
			console.warn(`building "${b.name ?? '(unnamed)'}" failed to extrude — skipping:`, err);
		}
	}

	return {
		group,
		dispose: () => {
			for (const d of disposables) d.dispose();
		}
	};
}
