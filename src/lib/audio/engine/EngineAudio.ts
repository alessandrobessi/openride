import type { EngineAudioParams } from './engineAudioParams';

/**
 * Layered procedural engine voice (milestone M23, AGENTS.md §21). Two detuned
 * sawtooth oscillators plus a sub sine form the firing tone bed through a
 * rev-tracking low-pass; a looped noise buffer through a band-pass is the
 * intake / mechanical bed. Everything is driven continuously from
 * {@link EngineAudioParams} — there is no pitched engine loop sample.
 *
 * Browser-only. The `AudioContext` is created lazily on {@link resume} so it can
 * be tied to a user gesture (autoplay policy).
 */
export interface EngineAudio {
	/** Create + resume the context and build the graph. Idempotent; needs a gesture. */
	resume: () => Promise<void>;
	/** Glide the voice toward `params`. No-op until resumed. */
	update: (params: EngineAudioParams) => void;
	dispose: () => void;
}

/** Pink-ish noise (Paul Kellet's economy filter) for the intake bed. */
function fillNoise(data: Float32Array<ArrayBufferLike>): void {
	let b0 = 0,
		b1 = 0,
		b2 = 0;
	for (let i = 0; i < data.length; i++) {
		const white = Math.random() * 2 - 1;
		b0 = 0.99765 * b0 + white * 0.099046;
		b1 = 0.963 * b1 + white * 0.2965164;
		b2 = 0.57 * b2 + white * 1.0526913;
		data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.25;
	}
}

/** Gentle odd-symmetric saturation for the master bus. */
function softClipCurve(n = 1024): Float32Array<ArrayBuffer> {
	const curve = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const x = (i / (n - 1)) * 2 - 1;
		curve[i] = Math.tanh(x * 1.8);
	}
	return curve;
}

export function createEngineAudio(): EngineAudio {
	let ctx: AudioContext | undefined;
	let master: GainNode | undefined;
	let sawA: OscillatorNode | undefined;
	let sawB: OscillatorNode | undefined;
	let sub: OscillatorNode | undefined;
	let toneFilter: BiquadFilterNode | undefined;
	let toneGain: GainNode | undefined;
	let subGain: GainNode | undefined;
	let noiseFilter: BiquadFilterNode | undefined;
	let noiseGain: GainNode | undefined;
	let noiseSrc: AudioBufferSourceNode | undefined;

	const glide = (p: AudioParam | undefined, value: number, tau = 0.05): void => {
		if (p && ctx) p.setTargetAtTime(value, ctx.currentTime, tau);
	};

	const build = (): void => {
		const AC: typeof AudioContext =
			window.AudioContext ??
			(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		ctx = new AC();

		master = ctx.createGain();
		master.gain.value = 0;
		const shaper = ctx.createWaveShaper();
		shaper.curve = softClipCurve();
		const comp = ctx.createDynamicsCompressor();
		master.connect(shaper).connect(comp).connect(ctx.destination);

		toneFilter = ctx.createBiquadFilter();
		toneFilter.type = 'lowpass';
		toneFilter.Q.value = 0.9;
		toneGain = ctx.createGain();
		toneGain.gain.value = 0;
		toneFilter.connect(toneGain).connect(master);

		sawA = ctx.createOscillator();
		sawA.type = 'sawtooth';
		sawB = ctx.createOscillator();
		sawB.type = 'sawtooth';
		sawA.connect(toneFilter);
		sawB.connect(toneFilter);

		subGain = ctx.createGain();
		subGain.gain.value = 0;
		sub = ctx.createOscillator();
		sub.type = 'sine';
		sub.connect(subGain).connect(master);

		const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
		fillNoise(noiseBuf.getChannelData(0));
		noiseSrc = ctx.createBufferSource();
		noiseSrc.buffer = noiseBuf;
		noiseSrc.loop = true;
		noiseFilter = ctx.createBiquadFilter();
		noiseFilter.type = 'bandpass';
		noiseFilter.Q.value = 0.7;
		noiseGain = ctx.createGain();
		noiseGain.gain.value = 0;
		noiseSrc.connect(noiseFilter).connect(noiseGain).connect(master);

		for (const o of [sawA, sawB, sub]) o.start();
		noiseSrc.start();
	};

	return {
		resume: async () => {
			if (!ctx) build();
			if (ctx && ctx.state !== 'running') await ctx.resume();
		},

		update: (p) => {
			if (!ctx) return;
			glide(sawA?.frequency, p.fundamentalHz);
			glide(sawB?.frequency, p.fundamentalHz);
			glide(sub?.frequency, p.fundamentalHz / 2);
			if (sawB) glide(sawB.detune, p.detuneCents);
			glide(toneFilter?.frequency, p.brightnessHz, 0.04);
			glide(toneGain?.gain, p.toneGain);
			glide(subGain?.gain, p.subGain);
			glide(noiseFilter?.frequency, p.noiseCenterHz, 0.04);
			glide(noiseGain?.gain, p.noiseGain);
			glide(master?.gain, p.masterGain, 0.08);
		},

		dispose: () => {
			try {
				for (const o of [sawA, sawB, sub, noiseSrc]) o?.stop();
			} catch {
				/* already stopped */
			}
			void ctx?.close();
			ctx = undefined;
		}
	};
}
