import type { WindAudioParams } from '../wind/windAudioParams';
import type { TireAudioParams } from '../tires/tireAudioParams';

/**
 * Speed-dependent wind and surface-dependent tyre roll, plus one-shot bump
 * thumps (milestone M24). Layered filtered noise — no loops with an audible
 * period (AGENTS.md §21). Browser-only; the `AudioContext` is built lazily on
 * {@link resume} so it binds to a user gesture.
 */
export interface AmbientAudio {
	resume: () => Promise<void>;
	updateWind: (params: WindAudioParams) => void;
	updateTire: (params: TireAudioParams) => void;
	/** Fire a suspension bump, `intensity` 0..1. Rate-limited internally. */
	bump: (intensity: number) => void;
	dispose: () => void;
}

function fillWhite(data: Float32Array<ArrayBufferLike>): void {
	for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
}

export function createAmbientAudio(): AmbientAudio {
	let ctx: AudioContext | undefined;
	let master: GainNode | undefined;

	let windSrc: AudioBufferSourceNode | undefined;
	let windHP: BiquadFilterNode | undefined;
	let windGain: GainNode | undefined;
	let buffetLP: BiquadFilterNode | undefined;
	let buffetGain: GainNode | undefined;

	let tireSrc: AudioBufferSourceNode | undefined;
	let tireLP: BiquadFilterNode | undefined;
	let tireGain: GainNode | undefined;
	let grainHP: BiquadFilterNode | undefined;
	let grainGain: GainNode | undefined;

	let bumpBuffer: AudioBuffer | undefined;
	let lastBumpAt = 0;

	const glide = (p: AudioParam | undefined, value: number, tau = 0.06): void => {
		if (p && ctx) p.setTargetAtTime(value, ctx.currentTime, tau);
	};

	const noiseNode = (buf: AudioBuffer): AudioBufferSourceNode => {
		const n = ctx!.createBufferSource();
		n.buffer = buf;
		n.loop = true;
		n.start();
		return n;
	};

	const build = (): void => {
		const AC: typeof AudioContext =
			window.AudioContext ??
			(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		ctx = new AC();

		master = ctx.createGain();
		master.gain.value = 0.9;
		const comp = ctx.createDynamicsCompressor();
		master.connect(comp).connect(ctx.destination);

		const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
		fillWhite(noiseBuf.getChannelData(0));

		// Wind: high-passed rush + a low-passed buffeting layer.
		windHP = ctx.createBiquadFilter();
		windHP.type = 'highpass';
		windHP.Q.value = 0.5;
		windGain = ctx.createGain();
		windGain.gain.value = 0;
		windSrc = noiseNode(noiseBuf);
		windSrc.connect(windHP).connect(windGain).connect(master);

		buffetLP = ctx.createBiquadFilter();
		buffetLP.type = 'lowpass';
		buffetLP.frequency.value = 180;
		buffetGain = ctx.createGain();
		buffetGain.gain.value = 0;
		windSrc.connect(buffetLP).connect(buffetGain).connect(master);

		// Tyre roll: low-passed roar + a high-passed coarse-grain layer.
		tireLP = ctx.createBiquadFilter();
		tireLP.type = 'lowpass';
		tireLP.Q.value = 0.6;
		tireGain = ctx.createGain();
		tireGain.gain.value = 0;
		tireSrc = noiseNode(noiseBuf);
		tireSrc.connect(tireLP).connect(tireGain).connect(master);

		grainHP = ctx.createBiquadFilter();
		grainHP.type = 'highpass';
		grainHP.frequency.value = 1800;
		grainGain = ctx.createGain();
		grainGain.gain.value = 0;
		tireSrc.connect(grainHP).connect(grainGain).connect(master);

		// Bump: a short noise burst shaped by an envelope, created per hit.
		bumpBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.12), ctx.sampleRate);
		fillWhite(bumpBuffer.getChannelData(0));
	};

	return {
		resume: async () => {
			if (!ctx) build();
			if (ctx && ctx.state !== 'running') await ctx.resume();
		},

		updateWind: (p) => {
			if (!ctx) return;
			glide(windGain?.gain, p.level);
			glide(windHP?.frequency, p.cutoffHz, 0.05);
			glide(buffetGain?.gain, p.buffetLevel);
		},

		updateTire: (p) => {
			if (!ctx) return;
			glide(tireGain?.gain, p.level);
			glide(tireLP?.frequency, p.cutoffHz, 0.05);
			glide(grainGain?.gain, p.grainLevel);
		},

		bump: (intensity) => {
			if (!ctx || !bumpBuffer || !master) return;
			const now = ctx.currentTime;
			if (now - lastBumpAt < 0.06) return;
			lastBumpAt = now;
			const amp = Math.min(1, Math.max(0, intensity));
			if (amp <= 0.001) return;

			const src = ctx.createBufferSource();
			src.buffer = bumpBuffer;
			const lp = ctx.createBiquadFilter();
			lp.type = 'lowpass';
			lp.frequency.value = 120 + 200 * amp;
			const env = ctx.createGain();
			env.gain.setValueAtTime(0.0001, now);
			env.gain.exponentialRampToValueAtTime(0.5 * amp, now + 0.008);
			env.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
			src.connect(lp).connect(env).connect(master);
			src.start(now);
			src.stop(now + 0.13);
		},

		dispose: () => {
			try {
				for (const n of [windSrc, tireSrc]) n?.stop();
			} catch {
				/* already stopped */
			}
			void ctx?.close();
			ctx = undefined;
		}
	};
}
