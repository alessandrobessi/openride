import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { skyStateForHour } from './skyState';

/**
 * Physically-plausible sky, sun, ambient fill and exponential mountain haze,
 * with a configurable time of day (milestone M28). Drop-in for the M1
 * `createLighting` — same `{ group, sun, dispose }` shape plus `setTimeOfDay`.
 * Owns `scene.fog` and `scene.background`.
 */
export interface SkyAndLighting {
	group: THREE.Group;
	sun: THREE.DirectionalLight;
	sky: Sky;
	/** Current time of day, hours 0–24. */
	hour: number;
	setTimeOfDay: (hour: number) => void;
	dispose: () => void;
}

export function createSkyAndLighting(scene: THREE.Scene, initialHour = 10): SkyAndLighting {
	const group = new THREE.Group();
	group.name = 'sky-lighting';

	const sky = new Sky();
	sky.scale.setScalar(20000);
	const u = sky.material.uniforms;
	u.rayleigh.value = 2.2;
	u.mieCoefficient.value = 0.005;
	u.mieDirectionalG.value = 0.8;
	group.add(sky);

	const hemisphere = new THREE.HemisphereLight(0xbcd8ff, 0x40382c, 1);
	group.add(hemisphere);

	const sun = new THREE.DirectionalLight(0xfff3e0, 2.2);
	sun.target.position.set(0, 0, 0);
	group.add(sun, sun.target);

	const fog = new THREE.FogExp2(0xaebdc9, 0.0006);
	scene.fog = fog;
	const bg = new THREE.Color(0xaebdc9);
	scene.background = bg;

	const sunDir = new THREE.Vector3();
	const state = { hour: initialHour };

	const setTimeOfDay = (hour: number): void => {
		state.hour = ((hour % 24) + 24) % 24;
		const s = skyStateForHour(state.hour);

		sunDir.setFromSphericalCoords(1, Math.PI / 2 - s.sunElevationRad, s.sunAzimuthRad);
		u.sunPosition.value.copy(sunDir);
		u.turbidity.value = s.turbidity;

		sun.position.copy(sunDir).multiplyScalar(1200);
		sun.intensity = s.lightIntensity;
		sun.color.setHex(s.lightColor);

		hemisphere.intensity = s.ambientIntensity;

		fog.color.setHex(s.fogColor);
		fog.density = s.fogDensity;
		bg.setHex(s.fogColor);
	};
	setTimeOfDay(initialHour);

	return {
		group,
		sun,
		sky,
		get hour() {
			return state.hour;
		},
		setTimeOfDay,
		dispose: () => {
			hemisphere.dispose();
			sun.dispose();
			sky.geometry.dispose();
			(sky.material as THREE.Material).dispose();
		}
	};
}
