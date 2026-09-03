import * as THREE from 'three';

/**
 * Basic outdoor lighting for the M1 test stage: a hemisphere fill plus a
 * directional "sun". Physically plausible sky/sun and time-of-day control are a
 * later visual milestone (OPENRIDE-BLUEPRINT.md §34 M28).
 */
export interface Lighting {
	group: THREE.Group;
	sun: THREE.DirectionalLight;
	dispose: () => void;
}

export function createLighting(): Lighting {
	const group = new THREE.Group();
	group.name = 'lighting';

	const hemisphere = new THREE.HemisphereLight(0xbcd8ff, 0x2b2b25, 1.1);
	group.add(hemisphere);

	const sun = new THREE.DirectionalLight(0xfff3e0, 2.2);
	sun.position.set(60, 90, 30); // up and to the east/north
	sun.target.position.set(0, 0, 0);
	group.add(sun);
	group.add(sun.target);

	const dispose = (): void => {
		hemisphere.dispose();
		sun.dispose();
	};

	return { group, sun, dispose };
}
