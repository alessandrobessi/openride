import * as THREE from 'three';

/**
 * The M1 test environment: a flat ground plane on the world X–Z plane with grid
 * and axis helpers. World convention (AGENTS.md §8): X = east, Y = up,
 * Z = north; units are metres.
 *
 * This is a placeholder stage for developing rendering and, later, the
 * motorcycle rig. Real Stelvio terrain arrives in M17.
 */
export interface TestScene {
	scene: THREE.Scene;
	ground: THREE.Mesh;
	dispose: () => void;
}

export function createScene(): TestScene {
	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0x0d0f12);
	scene.fog = new THREE.Fog(0x0d0f12, 60, 400);

	const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
	const groundMaterial = new THREE.MeshStandardMaterial({
		color: 0x2b3138,
		roughness: 0.95,
		metalness: 0
	});
	const ground = new THREE.Mesh(groundGeometry, groundMaterial);
	// PlaneGeometry is in the X–Y plane by default; rotate it flat onto X–Z.
	ground.rotation.x = -Math.PI / 2;
	ground.receiveShadow = true;
	ground.name = 'ground';
	scene.add(ground);

	const grid = new THREE.GridHelper(200, 40, 0x4a5560, 0x353d45);
	grid.position.y = 0.001; // avoid z-fighting with the ground
	scene.add(grid);

	// X red / Y green / Z blue, 5 m long, at the world origin.
	const axes = new THREE.AxesHelper(5);
	axes.position.y = 0.002;
	scene.add(axes);

	const dispose = (): void => {
		groundGeometry.dispose();
		groundMaterial.dispose();
		grid.geometry.dispose();
		(grid.material as THREE.Material).dispose();
		axes.geometry.dispose();
		(axes.material as THREE.Material).dispose();
	};

	return { scene, ground, dispose };
}
