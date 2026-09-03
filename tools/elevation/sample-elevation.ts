/**
 * Stelvio elevation pipeline (OPENRIDE-BLUEPRINT.md §9, milestone M15).
 *
 * Samples the DEM (tools/data/dem/) along the extracted SS38 centreline,
 * lightly smooths the noise WITHOUT flattening the gradient (AGENTS.md §19),
 * writes the local `y` back onto every centreline point, and emits a road
 * elevation profile CSV for validation.
 *
 *   pnpm world:elevation
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { LocalFrame } from '../../src/lib/world/geo/enu';
import { DemSampler } from './dem-sampler';

const ROAD_PATH = resolve(import.meta.dirname, '../../static/worlds/stelvio/roads/ss38.json');
const DEM_DIR = resolve(import.meta.dirname, '../data/dem');
const PROFILE_CSV = resolve(import.meta.dirname, '../data/stelvio-profile.csv');

interface RoadPoint {
	x: number;
	z: number;
	y?: number;
}
interface Road {
	origin: { latDeg: number; lonDeg: number; altM: number };
	centerline: RoadPoint[];
	elevation?: unknown;
	[k: string]: unknown;
}

/** Centred moving average — removes DEM stair-step noise, keeps the climb. */
function smooth(values: number[], radius: number): number[] {
	return values.map((_, i) => {
		let sum = 0;
		let n = 0;
		for (let j = Math.max(0, i - radius); j <= Math.min(values.length - 1, i + radius); j++) {
			sum += values[j];
			n++;
		}
		return sum / n;
	});
}

/**
 * Limit the per-metre elevation change to a plausible road grade. The DEM
 * (≈ 10 m/px) can't resolve a switchback, so raw samples spike to 30–40 % on
 * hairpins; real alpine passes are engineered to ≲ 12–14 %. A forward + backward
 * clamp pass keeps the sustained climb (the DEM's low-frequency trend) and
 * removes only the noise (AGENTS.md §19).
 */
function limitGrade(elev: number[], runsM: number[], maxGrade: number): number[] {
	const fwd = elev.slice();
	for (let i = 1; i < fwd.length; i++) {
		const cap = maxGrade * runsM[i];
		fwd[i] = Math.max(fwd[i - 1] - cap, Math.min(fwd[i - 1] + cap, fwd[i]));
	}
	const bwd = elev.slice();
	for (let i = bwd.length - 2; i >= 0; i--) {
		const cap = maxGrade * runsM[i + 1];
		bwd[i] = Math.max(bwd[i + 1] - cap, Math.min(bwd[i + 1] + cap, bwd[i]));
	}
	return elev.map((_, i) => (fwd[i] + bwd[i]) / 2);
}

/** Even arc-length resample of the (x, z) centreline. Also collapses OSM node-density variation. */
function resampleXZ(points: RoadPoint[], spacingM: number): RoadPoint[] {
	if (points.length < 2) return points.map((p) => ({ x: p.x, z: p.z }));
	const out: RoadPoint[] = [{ x: points[0].x, z: points[0].z }];
	let carry = 0;
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1];
		const b = points[i];
		const segLen = Math.hypot(b.x - a.x, b.z - a.z);
		for (let s = spacingM - carry; s <= segLen; s += spacingM) {
			const t = s / segLen;
			out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
		}
		carry = (carry + segLen) % spacingM;
	}
	return out;
}

async function main(): Promise<void> {
	const road = JSON.parse(readFileSync(ROAD_PATH, 'utf8')) as Road;
	const frame = new LocalFrame(road.origin);
	const dem = await DemSampler.load(DEM_DIR);

	{
		// Even 8 m spacing: fixes OSM node-density variation and makes the grade
		// series meaningful (no divide-by-tiny-run spikes).
		let centerline = resampleXZ(road.centerline, 8);

		let geo = centerline.map((p) => frame.toGeo({ x: p.x, y: 0, z: p.z }));
		const rawElev = geo.map((g) => dem.elevationAt(g.lonDeg, g.latDeg));
		const missing = rawElev.filter((e) => !Number.isFinite(e)).length;
		if (missing > 0) throw new Error(`${missing} centreline points fell outside the DEM tiles`);

		const runsM = centerline.map((p, i) =>
			i === 0 ? 0 : Math.hypot(p.x - centerline[i - 1].x, p.z - centerline[i - 1].z)
		);
		let elev = limitGrade(smooth(rawElev, 3), runsM, 0.14);

		// Order the ride uphill: reverse if the centreline currently descends.
		if (elev[0] > elev.at(-1)!) {
			centerline = centerline.reverse();
			elev = elev.reverse();
			geo = geo.reverse();
		}

		// Reproject each point through the frame with its real elevation so the
		// local `y` is the true ENU up for that point.
		let distanceM = 0;
		let gainM = 0;
		let maxGradePct = 0;
		const csv = ['distance_m,elevation_m,grade_pct'];
		for (let i = 0; i < centerline.length; i++) {
			const p = centerline[i];
			const local = frame.toLocal({ latDeg: geo[i].latDeg, lonDeg: geo[i].lonDeg, altM: elev[i] });
			p.x = Math.round(p.x * 1000) / 1000;
			p.z = Math.round(p.z * 1000) / 1000;
			p.y = Math.round(local.y * 100) / 100;

			if (i > 0) {
				const prev = centerline[i - 1];
				const run = Math.hypot(p.x - prev.x, p.z - prev.z);
				const rise = elev[i] - elev[i - 1];
				distanceM += run;
				if (rise > 0) gainM += rise;
				const gradePct = run > 1 ? (rise / run) * 100 : 0;
				maxGradePct = Math.max(maxGradePct, Math.abs(gradePct));
				csv.push(`${distanceM.toFixed(1)},${elev[i].toFixed(1)},${gradePct.toFixed(2)}`);
			} else {
				csv.push(`0,${elev[0].toFixed(1)},0`);
			}
		}

		road.centerline = centerline;
		road.lengthM = Math.round(distanceM);
		road.maxSegmentGapM =
			Math.round(
				Math.max(
					...centerline
						.slice(1)
						.map((p, i) => Math.hypot(p.x - centerline[i].x, p.z - centerline[i].z))
				) * 10
			) / 10;
		const minM = Math.min(...elev);
		const maxM = Math.max(...elev);
		road.elevation = {
			source:
				'AWS elevation-tiles-prod (SRTM/GMTED) z13, bilinear, 8 m resample, smooth r=3, grade ≤ 14 %',
			minM: Math.round(minM),
			maxM: Math.round(maxM),
			startM: Math.round(elev[0]),
			endM: Math.round(elev.at(-1)!),
			totalClimbM: Math.round(gainM),
			maxGradePct: Math.round(maxGradePct * 10) / 10,
			sampledAt: new Date().toISOString()
		};

		writeFileSync(ROAD_PATH, JSON.stringify(road, null, '\t') + '\n');
		writeFileSync(PROFILE_CSV, csv.join('\n') + '\n');

		process.stdout.write(
			`Elevation: ${Math.round(elev[0])} m → ${Math.round(elev.at(-1)!)} m ` +
				`(range ${Math.round(minM)}–${Math.round(maxM)} m), climb ${Math.round(gainM)} m, ` +
				`max grade ${maxGradePct.toFixed(1)} %\n` +
				`Wrote ${ROAD_PATH}\n      ${PROFILE_CSV}\n`
		);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
