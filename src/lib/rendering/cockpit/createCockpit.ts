import * as THREE from 'three';

/**
 * A placeholder first-person adventure-motorcycle cockpit (milestone M20,
 * OPENRIDE-BLUEPRINT.md §25). Built from primitives — no brand assets, no
 * logos (AGENTS.md §11). The instrument cluster is a blank shell here; live
 * gauges are M21.
 *
 * All geometry is in the chassis body frame: origin at the CG, +x right,
 * +y up, +z forward. The returned group is parented to the interpolated
 * chassis object so it rides with the bike.
 */
export interface Cockpit {
	group: THREE.Group;
	/** The dark cluster face — M21 draws instruments onto / in front of this. */
	clusterFace: THREE.Mesh;
	dispose: () => void;
}

export function createCockpit(): Cockpit {
	const group = new THREE.Group();
	group.name = 'cockpit';

	const disposables: Array<{ dispose: () => void }> = [];
	const track = <T extends { dispose: () => void }>(x: T): T => {
		disposables.push(x);
		return x;
	};

	const plastic = track(
		new THREE.MeshStandardMaterial({
			color: 0x3c4048,
			roughness: 0.78,
			metalness: 0.05,
			// A touch of self-illumination so the cockpit still reads in shadow.
			emissive: 0x0e1013,
			emissiveIntensity: 1
		})
	);
	const metal = track(
		new THREE.MeshStandardMaterial({
			color: 0x9aa0a8,
			roughness: 0.32,
			metalness: 0.65,
			emissive: 0x0c0d10,
			emissiveIntensity: 1
		})
	);
	const glass = track(
		new THREE.MeshStandardMaterial({
			color: 0x33454f,
			roughness: 0.1,
			transparent: true,
			opacity: 0.12,
			depthWrite: false,
			side: THREE.DoubleSide
		})
	);
	// The cluster face gets its own material so M21 can attach a live texture map.
	const clusterFaceMat = track(new THREE.MeshBasicMaterial({ color: 0x0a0c0e }));

	const add = (
		geom: THREE.BufferGeometry,
		mat: THREE.Material,
		place: (m: THREE.Mesh) => void
	): THREE.Mesh => {
		const mesh = new THREE.Mesh(track(geom), mat);
		place(mesh);
		group.add(mesh);
		return mesh;
	};

	// Fuel tank / centre console hint between the rider and the bars.
	add(new THREE.BoxGeometry(0.34, 0.18, 0.42), plastic, (m) => m.position.set(0, 0.15, 0.12));

	// Riser stem up from the triple clamp.
	add(new THREE.BoxGeometry(0.06, 0.16, 0.06), metal, (m) => m.position.set(0, 0.28, 0.38));

	// Handlebar with a slight rise/sweep back toward the rider.
	add(new THREE.CylinderGeometry(0.014, 0.014, 0.72, 16), metal, (m) => {
		m.rotation.z = Math.PI / 2;
		m.rotation.x = -0.16;
		m.position.set(0, 0.35, 0.44);
	});
	for (const side of [-1, 1]) {
		add(new THREE.CylinderGeometry(0.019, 0.019, 0.12, 12), plastic, (m) => {
			m.rotation.z = Math.PI / 2;
			m.position.set(side * 0.3, 0.35, 0.4);
		});
	}

	// Instrument cluster: a shallow housing behind/below the screen so it never
	// occludes it, and the live face angled up toward the rider's eye.
	add(new THREE.BoxGeometry(0.24, 0.07, 0.14), plastic, (m) => {
		m.rotation.x = 0.5;
		m.position.set(0, 0.45, 0.33);
	});
	const clusterFace = add(new THREE.PlaneGeometry(0.22, 0.115), clusterFaceMat, (m) => {
		// Normal points up-and-back at the eye; Rz(pi) keeps the readout upright.
		m.rotation.set(Math.PI + 0.42, 0, Math.PI);
		m.position.set(0, 0.5, 0.36);
	});
	clusterFace.name = 'cluster-face';

	// Low windscreen leaning forward — you look over it, not through it.
	add(new THREE.PlaneGeometry(0.44, 0.24, 1, 1), glass, (m) => {
		m.rotation.x = -0.5;
		m.position.set(0, 0.52, 0.56);
	});

	// Mirror stalks + heads at the bar ends, angled outward.
	for (const side of [-1, 1]) {
		add(new THREE.CylinderGeometry(0.009, 0.009, 0.18, 10), plastic, (m) => {
			m.rotation.z = side * -0.4;
			m.position.set(side * 0.32, 0.44, 0.39);
		});
		add(new THREE.BoxGeometry(0.12, 0.07, 0.02), metal, (m) => {
			m.rotation.y = side * 0.5;
			m.position.set(side * 0.38, 0.52, 0.38);
		});
	}

	// Fork tubes disappearing below the screen — a sense of the front end.
	for (const side of [-1, 1]) {
		add(new THREE.CylinderGeometry(0.018, 0.018, 0.5, 12), metal, (m) => {
			m.rotation.x = 0.32;
			m.position.set(side * 0.1, 0.06, 0.46);
		});
	}

	return {
		group,
		clusterFace,
		dispose: () => {
			for (const d of disposables) d.dispose();
		}
	};
}
