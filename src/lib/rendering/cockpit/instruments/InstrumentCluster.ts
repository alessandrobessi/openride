import * as THREE from 'three';
import { drawCluster, type ClusterReading } from './drawCluster';

/**
 * The cockpit instrument cluster (milestone M21): a canvas-backed texture for
 * the cluster face, repainted from sampled `MotorcycleState`. Browser-only —
 * the drawing itself lives in {@link drawCluster} and is tested headlessly.
 */
export interface InstrumentCluster {
	texture: THREE.CanvasTexture;
	update: (reading: ClusterReading) => void;
	dispose: () => void;
}

const WIDTH = 512;
const HEIGHT = 256;

export function createInstrumentCluster(): InstrumentCluster {
	const canvas = document.createElement('canvas');
	canvas.width = WIDTH;
	canvas.height = HEIGHT;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('instrument cluster: 2D canvas context unavailable');

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 4;

	return {
		texture,
		update: (reading) => {
			drawCluster(ctx, reading, WIDTH, HEIGHT);
			texture.needsUpdate = true;
		},
		dispose: () => texture.dispose()
	};
}
