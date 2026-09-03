import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * A perspective camera with orbit controls for inspecting the test stage. The
 * ride camera (first-person cockpit with head stabilisation) is a later
 * milestone (OPENRIDE-BLUEPRINT.md §33 M20); this exists so M1 has a usable view.
 */
export interface InspectionCamera {
	camera: THREE.PerspectiveCamera;
	controls: OrbitControls;
	/** Call on viewport resize. */
	setViewportSize: (widthPx: number, heightPx: number) => void;
	/** Slew the orbit target (and the camera with it) toward a world point. */
	follow: (worldPoint: THREE.Vector3) => void;
	/** Call once per rendered frame. */
	update: () => void;
	dispose: () => void;
}

export function createCamera(canvas: HTMLElement): InspectionCamera {
	const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
	camera.position.set(8, 6, 12);

	const controls = new OrbitControls(camera, canvas);
	controls.target.set(0, 1, 0);
	controls.enableDamping = true;
	controls.dampingFactor = 0.08;
	controls.maxPolarAngle = Math.PI / 2 - 0.02; // stay above the ground
	controls.update();

	const setViewportSize = (widthPx: number, heightPx: number): void => {
		camera.aspect = widthPx / Math.max(heightPx, 1);
		camera.updateProjectionMatrix();
	};

	const followDelta = new THREE.Vector3();
	const follow = (worldPoint: THREE.Vector3): void => {
		followDelta.subVectors(worldPoint, controls.target).multiplyScalar(0.08);
		controls.target.add(followDelta);
		camera.position.add(followDelta);
	};

	return {
		camera,
		controls,
		setViewportSize,
		follow,
		update: () => controls.update(),
		dispose: () => controls.dispose()
	};
}
