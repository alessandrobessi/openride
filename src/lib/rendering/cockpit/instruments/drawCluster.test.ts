import { describe, expect, it } from 'vitest';
import { drawCluster, type ClusterContext2D, type ClusterReading } from './drawCluster';

/** A stub 2D context that records the text it was asked to paint. */
function stubCtx() {
	const texts: string[] = [];
	const fillRects: Array<[number, number, number, number]> = [];
	const ctx: ClusterContext2D = {
		save: () => {},
		restore: () => {},
		fillRect: (x, y, w, h) => fillRects.push([x, y, w, h]),
		fillText: (t) => texts.push(t),
		fillStyle: '',
		font: '',
		textAlign: 'left',
		textBaseline: 'alphabetic'
	};
	return { ctx, texts, fillRects };
}

const base: ClusterReading = {
	speedKmh: 0,
	rpm: 1150,
	redlineRpm: 8500,
	gear: 0,
	stalled: false,
	absEnabled: true,
	absActive: false,
	tcEnabled: true,
	tcActive: false
};

describe('drawCluster', () => {
	it('shows N in neutral and the gear number otherwise, verbatim', () => {
		let s = stubCtx();
		drawCluster(s.ctx, { ...base, gear: 0 }, 512, 256);
		expect(s.texts).toContain('N');

		s = stubCtx();
		drawCluster(s.ctx, { ...base, gear: 3 }, 512, 256);
		expect(s.texts).toContain('3');
		expect(s.texts).not.toContain('N');
	});

	it('echoes the sampled speed and rpm without recomputing them', () => {
		const s = stubCtx();
		drawCluster(s.ctx, { ...base, speedKmh: 72.4, rpm: 6410 }, 512, 256);
		expect(s.texts).toContain('72'); // rounded, not transformed
		expect(s.texts.some((t) => t.includes('6410'))).toBe(true);
	});

	it('always paints both tell-tales', () => {
		const s = stubCtx();
		drawCluster(s.ctx, base, 512, 256);
		expect(s.texts).toContain('ABS');
		expect(s.texts).toContain('TC');
	});

	it('marks a stall', () => {
		const s = stubCtx();
		drawCluster(s.ctx, { ...base, stalled: true }, 512, 256);
		expect(s.texts).toContain('STALL');
	});

	it('fills the tacho bar wider as rpm rises, capped at the redline', () => {
		const widthAt = (rpm: number) => {
			const s = stubCtx();
			drawCluster(s.ctx, { ...base, rpm }, 512, 256);
			// The tacho fill is the 2nd fillRect (after background), same x/y/h as the track.
			return s.fillRects[2][2];
		};
		const lo = widthAt(2000);
		const hi = widthAt(7000);
		const over = widthAt(12000);
		expect(hi).toBeGreaterThan(lo);
		expect(over).toBeGreaterThanOrEqual(widthAt(8500) - 1e-6); // clamped at redline
	});

	it('does not throw for extreme or empty readings', () => {
		const s = stubCtx();
		expect(() =>
			drawCluster(s.ctx, { ...base, speedKmh: -5, rpm: 0, redlineRpm: 0, gear: 6 }, 512, 256)
		).not.toThrow();
	});
});
