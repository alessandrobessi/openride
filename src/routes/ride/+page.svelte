<script lang="ts">
	import { onMount } from 'svelte';
	import { Viewport, type ViewportStats } from '$lib/rendering/Viewport';
	import { attachKeyboardControls } from '$lib/controls/keyboard/KeyboardControls';
	import { GamepadControls, type GamepadReading } from '$lib/controls/gamepad/GamepadControls';

	let canvas: HTMLCanvasElement;
	let stats = $state<ViewportStats>({
		fps: 0,
		physicsHz: 0,
		drawCalls: 0,
		triangles: 0,
		speedKmh: 0,
		rpm: 0,
		gear: 0,
		stalled: false,
		rollDeg: 0,
		targetLeanDeg: 0,
		frontLoadN: 0,
		rearLoadN: 0,
		frontGrip: 0,
		rearGrip: 0,
		absActive: false,
		tcActive: false,
		absOn: true,
		tcOn: true,
		latDeg: 0,
		lonDeg: 0,
		activeChunks: 0,
		chunkId: '—',
		view: 'cockpit'
	});
	let frames = $state(0);
	let startError = $state<string | null>(null);

	onMount(() => {
		const viewport = new Viewport(canvas);
		viewport
			.start((s) => {
				stats = s;
				frames = viewport.frames;
			})
			.catch((err: unknown) => {
				startError = err instanceof Error ? (err.stack ?? err.message) : String(err);
				console.error('Viewport.start failed:', err);
			});

		// The engine voice (M23) can only start from a user gesture (autoplay policy).
		const enableAudio = () => viewport.resumeAudio();
		window.addEventListener('keydown', enableAudio, { once: true });
		window.addEventListener('pointerdown', enableAudio, { once: true });

		// Keyboard (OPENRIDE-BLUEPRINT.md §27) and gamepad (M22) both stay wired.
		const detachKeyboard = attachKeyboardControls({
			setAnalog: (c) => viewport.setControls(c),
			setClutchEngaged: (engaged) => viewport.setClutchEngaged(engaged),
			shiftUp: () => viewport.shiftUp(),
			shiftDown: () => viewport.shiftDown(),
			restartEngine: () => viewport.restartEngine(),
			toggleAssist: (a) => viewport.toggleAssist(a),
			toggleView: () => viewport.toggleView()
		});

		// Poll the gamepad each frame; it takes over once actually touched so a
		// connected-but-idle pad never fights the keyboard.
		const pad = new GamepadControls();
		let padRaf = 0;
		const pollPad = () => {
			const gp = navigator.getGamepads?.().find((g): g is Gamepad => g != null) ?? null;
			const reading: GamepadReading | null = gp
				? {
						axes: gp.axes,
						buttons: gp.buttons.map((b) => ({ pressed: b.pressed, value: b.value }))
					}
				: null;
			const tick = pad.poll(reading);
			if (tick.owning) {
				viewport.setControls({
					throttle: tick.controls.throttle,
					frontBrake: tick.controls.frontBrake,
					rearBrake: tick.controls.rearBrake,
					steeringInput: tick.controls.steeringInput
				});
				viewport.setClutchInput(tick.controls.clutch);
				if (tick.events.gearUp) viewport.shiftUp();
				if (tick.events.gearDown) viewport.shiftDown();
				if (tick.events.restart) viewport.restartEngine();
				if (tick.events.toggleView) viewport.toggleView();
			}
			padRaf = requestAnimationFrame(pollPad);
		};
		padRaf = requestAnimationFrame(pollPad);

		return () => {
			window.removeEventListener('keydown', enableAudio);
			window.removeEventListener('pointerdown', enableAudio);
			detachKeyboard();
			cancelAnimationFrame(padRaf);
			viewport.dispose();
		};
	});
</script>

<svelte:head>
	<title>OpenRide — Ride</title>
</svelte:head>

<div class="stage">
	<canvas bind:this={canvas} data-testid="viewport"></canvas>
	<div class="hud" data-testid="render-stats" data-frames={frames}>
		<span>{stats.fps.toFixed(0)} fps</span>
		<span>{stats.physicsHz.toFixed(0)} Hz phys</span>
		<span>{stats.drawCalls} draws</span>
		<span>{stats.speedKmh.toFixed(0)} km/h</span>
		<span>{stats.rpm.toFixed(0)} rpm</span>
		<span>gear {stats.gear === 0 ? 'N' : stats.gear}</span>
		<span>lean {stats.rollDeg.toFixed(0)}° / {stats.targetLeanDeg.toFixed(0)}°</span>
		{#if stats.stalled}<span class="warn">STALLED</span>{/if}
		<span>Fz {(stats.frontLoadN / 1000).toFixed(2)}/{(stats.rearLoadN / 1000).toFixed(2)} kN</span>
		<span
			>grip {Math.min(stats.frontGrip, 2).toFixed(2)}/{Math.min(stats.rearGrip, 2).toFixed(2)}</span
		>
		<span class:muted={!stats.absOn} class:live={stats.absActive}>ABS</span>
		<span class:muted={!stats.tcOn} class:live={stats.tcActive}>TC</span>
		<span>{stats.latDeg.toFixed(5)}, {stats.lonDeg.toFixed(5)}</span>
		<span>chunks {stats.activeChunks} @ {stats.chunkId}</span>
		<span>view {stats.view}</span>
	</div>
	{#if startError}
		<pre class="error" data-testid="start-error">{startError}</pre>
	{/if}
	<div class="help">
		Keyboard: W/↑ throttle · S/↓ brake · A/D steer · Shift/C clutch · Q/E gear · R restart · 1/2/3
		ABS/TC/wheelie · V view — or a gamepad: RT/LT throttle+brake, left stick steer, LB clutch, RB
		rear brake, A/B gear, Start restart, Back view
	</div>
</div>

<style>
	:global(body) {
		margin: 0;
		overflow: hidden;
		background: #0d0f12;
	}

	.stage {
		position: fixed;
		inset: 0;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}

	.hud {
		position: absolute;
		top: 0.75rem;
		left: 0.75rem;
		display: flex;
		gap: 1rem;
		padding: 0.4rem 0.7rem;
		border-radius: 0.35rem;
		background: rgba(0, 0, 0, 0.55);
		color: #9fe8b0;
		font:
			12px/1.4 ui-monospace,
			SFMono-Regular,
			Menlo,
			monospace;
		pointer-events: none;
	}

	.warn {
		color: #ffb454;
		font-weight: 700;
	}

	.muted {
		opacity: 0.3;
	}

	.live {
		color: #ffb454;
		font-weight: 700;
	}

	.error {
		position: absolute;
		top: 3rem;
		left: 0.75rem;
		max-width: 60ch;
		margin: 0;
		padding: 0.5rem 0.7rem;
		border-radius: 0.35rem;
		background: rgba(120, 20, 20, 0.85);
		color: #ffd7d7;
		font:
			11px/1.4 ui-monospace,
			SFMono-Regular,
			Menlo,
			monospace;
		white-space: pre-wrap;
	}

	.help {
		position: absolute;
		bottom: 0.75rem;
		left: 0.75rem;
		color: #6b7785;
		font:
			12px/1.4 ui-monospace,
			SFMono-Regular,
			Menlo,
			monospace;
		pointer-events: none;
	}
</style>
