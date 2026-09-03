import {
	assertFurnitureData,
	assertSceneryIndex,
	type FurnitureData,
	type SceneryIndex
} from './SceneryPackage';

export interface LoadedScenery {
	index: SceneryIndex;
	furniture?: FurnitureData;
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

	return loaded;
}
