import {
	assertBuildingsData,
	assertFurnitureData,
	assertSceneryIndex,
	parseVegetation,
	type BuildingsData,
	type FurnitureData,
	type SceneryIndex,
	type VegetationData
} from './SceneryPackage';

export interface LoadedScenery {
	index: SceneryIndex;
	furniture?: FurnitureData;
	vegetation?: VegetationData;
	buildings?: BuildingsData;
}

/** Fetch the scenery package (index + whichever layers it declares). */
export async function fetchScenery(baseUrl: string): Promise<LoadedScenery> {
	const dir = baseUrl.replace(/\/$/, '');
	const indexRes = await fetch(`${dir}/index.json`);
	if (!indexRes.ok) throw new Error(`scenery index: HTTP ${indexRes.status}`);
	const index: unknown = await indexRes.json();
	assertSceneryIndex(index);

	const loaded: LoadedScenery = { index };

	if (index.furniture) {
		const res = await fetch(`${dir}/${index.furniture.file}`);
		if (res.ok) {
			const data: unknown = await res.json();
			assertFurnitureData(data);
			loaded.furniture = data;
		} else {
			console.warn(`scenery furniture: HTTP ${res.status}`);
		}
	}

	if (index.vegetation) {
		const res = await fetch(`${dir}/${index.vegetation.file}`);
		if (res.ok) {
			loaded.vegetation = parseVegetation(await res.arrayBuffer());
		} else {
			console.warn(`scenery vegetation: HTTP ${res.status}`);
		}
	}

	if (index.buildings) {
		const res = await fetch(`${dir}/${index.buildings.file}`);
		if (res.ok) {
			const data: unknown = await res.json();
			assertBuildingsData(data);
			loaded.buildings = data;
		} else {
			console.warn(`scenery buildings: HTTP ${res.status}`);
		}
	}

	return loaded;
}
