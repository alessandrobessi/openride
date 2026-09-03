/**
 * Draws the instrument cluster face (milestone M21). Pure rendering: it takes a
 * {@link ClusterReading} sampled from `MotorcycleState` and paints it — it never
 * recomputes simulation quantities (AGENTS.md §5, §24). Kept separate from the
 * canvas/texture wrapper so it can be unit-tested with a stub 2D context.
 */

export interface ClusterReading {
	speedKmh: number;
	rpm: number;
	redlineRpm: number;
	/** 0 = neutral. */
	gear: number;
	stalled: boolean;
	absEnabled: boolean;
	absActive: boolean;
	tcEnabled: boolean;
	tcActive: boolean;
}

/** The subset of `CanvasRenderingContext2D` the cluster uses. */
export interface ClusterContext2D {
	save(): void;
	restore(): void;
	fillRect(x: number, y: number, w: number, h: number): void;
	fillText(text: string, x: number, y: number): void;
	fillStyle: string | CanvasGradient | CanvasPattern;
	font: string;
	textAlign: CanvasTextAlign;
	textBaseline: CanvasTextBaseline;
}

const BG = '#0a0c0e';
const TRACK = '#1b1f25';
const DIM = '#3a4048';
const TEXT = '#e7ecef';
const GREEN = '#5bd6a0';
const AMBER = '#ffb454';
const RED = '#ff5a4a';

const gearLabel = (gear: number): string => (gear === 0 ? 'N' : String(gear));

/** Colour for the tacho fill / redline warning at a given rpm fraction. */
function tachoColour(fraction: number): string {
	if (fraction >= 0.97) return RED;
	if (fraction >= 0.85) return AMBER;
	return GREEN;
}

function tellTale(
	ctx: ClusterContext2D,
	label: string,
	x: number,
	y: number,
	w: number,
	h: number,
	enabled: boolean,
	active: boolean
): void {
	if (active) {
		ctx.fillStyle = AMBER;
		ctx.fillRect(x, y, w, h);
		ctx.fillStyle = '#101214';
	} else {
		ctx.fillStyle = enabled ? DIM : '#1b1f25';
		ctx.fillRect(x, y, w, h);
		ctx.fillStyle = enabled ? '#8b95a0' : '#454b53';
	}
	ctx.font = '700 24px system-ui, sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText(label, x + w / 2, y + h / 2 + 1);
}

export function drawCluster(ctx: ClusterContext2D, r: ClusterReading, w: number, h: number): void {
	ctx.save();

	ctx.fillStyle = BG;
	ctx.fillRect(0, 0, w, h);

	// Tacho bar across the top.
	const pad = 22;
	const barW = w - pad * 2;
	const barH = 18;
	const barY = 20;
	const frac = r.redlineRpm > 0 ? Math.max(0, Math.min(1, r.rpm / r.redlineRpm)) : 0;
	ctx.fillStyle = TRACK;
	ctx.fillRect(pad, barY, barW, barH);
	ctx.fillStyle = tachoColour(frac);
	ctx.fillRect(pad, barY, barW * frac, barH);

	ctx.fillStyle = frac >= 0.85 ? ctx.fillStyle : '#9aa4ad';
	ctx.font = '600 22px system-ui, sans-serif';
	ctx.textAlign = 'right';
	ctx.textBaseline = 'alphabetic';
	ctx.fillText(`${Math.round(r.rpm)} rpm`, w - pad, barY + barH + 26);

	// Gear (left) and speed (right).
	const midY = h * 0.58;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.font = '800 92px system-ui, sans-serif';
	ctx.fillStyle = r.stalled ? RED : r.gear === 0 ? GREEN : TEXT;
	ctx.fillText(gearLabel(r.gear), w * 0.28, midY);

	ctx.font = '800 76px system-ui, sans-serif';
	ctx.fillStyle = TEXT;
	ctx.fillText(String(Math.max(0, Math.round(r.speedKmh))), w * 0.68, midY - 6);
	ctx.font = '600 20px system-ui, sans-serif';
	ctx.fillStyle = '#9aa4ad';
	ctx.fillText('km/h', w * 0.68, midY + 40);

	if (r.stalled) {
		ctx.font = '700 20px system-ui, sans-serif';
		ctx.fillStyle = RED;
		ctx.fillText('STALL', w * 0.28, midY + 58);
	}

	// Tell-tales along the bottom.
	const tW = 84;
	const tH = 34;
	const tY = h - tH - 12;
	tellTale(ctx, 'ABS', pad, tY, tW, tH, r.absEnabled, r.absActive);
	tellTale(ctx, 'TC', w - pad - tW, tY, tW, tH, r.tcEnabled, r.tcActive);

	ctx.restore();
}
