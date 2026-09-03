<script lang="ts">
	import { onMount } from 'svelte';
	import { Viewport, type ViewportStats } from '$lib/rendering/Viewport';

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
		lonDeg: 0
	});
	let frames = $state(0);

	onMount(() => {
		const viewport = new Viewport(canvas);
		void viewport.start((s) => {
			stats = s;
			frames = viewport.frames;
		});

		// Development keyboard mapping (OPENRIDE-BLUEPRINT.md §27). Full gamepad +
		// configurable input is M22.
		const held = new Set<string>();
		const applyAnalog = () => {
			const left = held.has('a') || held.has('arrowleft');
			const right = held.has('d') || held.has('arrowright');
			viewport.setControls({
				throttle: held.has('w') || held.has('arrowup') ? 1 : 0,
				frontBrake: held.has('s') || held.has('arrowdown') ? 1 : 0,
				rearBrake: held.has('s') || held.has('arrowdown') ? 1 : 0,
				steeringInput: (right ? 1 : 0) - (left ? 1 : 0)
			});
			viewport.setClutchEngaged(!(held.has('shift') || held.has('c')));
		};
		const down = (e: KeyboardEvent) => {
			const k = e.key.toLowerCase();
			if (!held.has(k)) {
				if (k === 'e') viewport.shiftUp();
				else if (k === 'q') viewport.shiftDown();
				else if (k === 'r') viewport.restartEngine();
				else if (k === '1') viewport.toggleAssist('abs');
				else if (k === '2') viewport.toggleAssist('tractionControl');
				else if (k === '3') viewport.toggleAssist('wheelieControl');
			}
			held.add(k);
			applyAnalog();
		};
		const up = (e: KeyboardEvent) => {
			held.delete(e.key.toLowerCase());
			applyAnalog();
		};
		window.addEventListener('keydown', down);
		window.addEventListener('keyup', up);

		return () => {
			window.removeEventListener('keydown', down);
			window.removeEventListener('keyup', up);
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
	</div>
	<div class="help">
		W/↑ throttle · S/↓ brake · A/D steer · Shift/C clutch · Q/E gear · R restart · 1/2/3
		ABS/TC/wheelie
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
