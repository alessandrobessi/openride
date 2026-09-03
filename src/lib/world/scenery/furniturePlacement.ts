/**
 * Procedural road-furniture placement (milestone M25): guardrail posts + rails
 * and reflective delineator posts along both edges of the road, closer-spaced
 * through tight curves. Pure geometry over the semantic centerline — the
 * offline baker (`tools/world-builder/build-scenery.ts`) writes the result and
 * the runtime just instances it.
 *
 * OPENRIDE-BLUEPRINT.md §34 M25: "Use geographic metadata when available; do
 * not fabricate real-world claims from absent data." Guardrails on a high alpine
 * pass are structural, not a claimed fact about signage.
 */

export interface CenterlinePoint {
	x: number;
	z: number;
	y?: number;
}

export interface FurnitureOptions {
	roadWidthM: number;
	/** Rail line sits this far outside the road edge. */
	railMarginM?: number;
	/** Spacing of guardrail posts along the road. */
	postSpacingM?: number;
	/** Guardrail post height above the road. */
	postHeightM?: number;
	/** Delineator (marker) post height. */
	delineatorHeightM?: number;
	/** Delineator spacing on straights / through hairpins. */
	delineatorSpacingM?: number;
	hairpinDelineatorSpacingM?: number;
	/** Curvature (1/radius, 1/m) above which a section counts as a hairpin. */
	hairpinCurvature?: number;
}

export type PostKind = 'guardrail' | 'delineator';

export interface FurniturePost {
	x: number;
	y: number;
	z: number;
	/** Heading about +y, radians — posts align with the road tangent. */
	ry: number;
	h: number;
	kind: PostKind;
}

export interface FurniturePlacement {
	posts: FurniturePost[];
	/** Two edge polylines (left, right) at road level; the rail mesh adds height. */
	rails: Array<Array<{ x: number; y: number; z: number }>>;
}

const DEFAULTS = {
	railMarginM: 0.7,
	postSpacingM: 4,
	postHeightM: 0.75,
	delineatorHeightM: 1,
	delineatorSpacingM: 16,
	hairpinDelineatorSpacingM: 6,
	hairpinCurvature: 1 / 26
};

function resampleByArc(cl: CenterlinePoint[], stepM: number): CenterlinePoint[] {
	if (cl.length < 2) return cl.slice();
	const out: CenterlinePoint[] = [{ ...cl[0] }];
	let carry = 0;
	for (let i = 1; i < cl.length; i++) {
		const a = cl[i - 1];
		const b = cl[i];
		const segLen = Math.hypot(b.x - a.x, b.z - a.z);
		if (segLen < 1e-6) continue;
		let d = stepM - carry;
		while (d < segLen) {
			const t = d / segLen;
			out.push({
				x: a.x + (b.x - a.x) * t,
				z: a.z + (b.z - a.z) * t,
				y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t
			});
			d += stepM;
		}
		carry = segLen - (d - stepM);
	}
	const last = cl[cl.length - 1];
	const tail = out[out.length - 1];
	if (Math.hypot(last.x - tail.x, last.z - tail.z) > stepM * 0.25) out.push({ ...last });
	return out;
}

/** Unit left-normal (rotate the tangent +90° about +y) at sample `i`. */
function leftNormalAt(pts: CenterlinePoint[], i: number): [number, number] {
	const prev = pts[Math.max(0, i - 1)];
	const next = pts[Math.min(pts.length - 1, i + 1)];
	const tx = next.x - prev.x;
	const tz = next.z - prev.z;
	const len = Math.hypot(tx, tz) || 1;
	return [-tz / len, tx / len];
}

/** Approximate curvature |dθ/ds| at sample `i` from the turn between segments. */
function curvatureAt(pts: CenterlinePoint[], i: number): number {
	if (i <= 0 || i >= pts.length - 1) return 0;
	const a = pts[i - 1];
	const b = pts[i];
	const c = pts[i + 1];
	const h1 = Math.atan2(b.x - a.x, b.z - a.z);
	const h2 = Math.atan2(c.x - b.x, c.z - b.z);
	let dTheta = Math.abs(h2 - h1);
	if (dTheta > Math.PI) dTheta = 2 * Math.PI - dTheta;
	const ds = 0.5 * (Math.hypot(b.x - a.x, b.z - a.z) + Math.hypot(c.x - b.x, c.z - b.z));
	return ds > 1e-6 ? dTheta / ds : 0;
}

export function placeFurniture(
	centerline: CenterlinePoint[],
	options: FurnitureOptions
): FurniturePlacement {
	const o = { ...DEFAULTS, ...options };
	const half = options.roadWidthM / 2;
	const railOffset = half + o.railMarginM;
	const delOffset = railOffset + 0.35;

	const pts = resampleByArc(centerline, o.postSpacingM);
	const rails: FurniturePlacement['rails'] = [[], []];
	const posts: FurniturePost[] = [];

	let sinceDelineator = Number.POSITIVE_INFINITY;

	for (let i = 0; i < pts.length; i++) {
		const p = pts[i];
		const y = p.y ?? 0;
		const [nlx, nlz] = leftNormalAt(pts, i);
		const heading = Math.atan2(nlz, -nlx); // along the road (tangent), for post yaw
		const kappa = curvatureAt(pts, i);
		const hairpin = kappa > o.hairpinCurvature;

		for (const side of [1, -1]) {
			const rx = p.x + nlx * railOffset * side;
			const rz = p.z + nlz * railOffset * side;
			rails[side === 1 ? 0 : 1].push({ x: rx, y, z: rz });
			posts.push({ x: rx, y, z: rz, ry: heading, h: o.postHeightM, kind: 'guardrail' });
		}

		sinceDelineator += o.postSpacingM;
		const wantEvery = hairpin ? o.hairpinDelineatorSpacingM : o.delineatorSpacingM;
		if (sinceDelineator >= wantEvery) {
			sinceDelineator = 0;
			for (const side of [1, -1]) {
				posts.push({
					x: p.x + nlx * delOffset * side,
					y,
					z: p.z + nlz * delOffset * side,
					ry: heading,
					h: o.delineatorHeightM,
					kind: 'delineator'
				});
			}
		}
	}

	return { posts, rails };
}
