<script lang="ts">
	import { onMount } from 'svelte';
	import { Viewport, type ViewportStats } from '$lib/rendering/Viewport';

	let canvas: HTMLCanvasElement;
	let stats = $state<ViewportStats>({ fps: 0, physicsHz: 0, drawCalls: 0, triangles: 0 });
	let frames = $state(0);

	onMount(() => {
		const viewport = new Viewport(canvas);
		void viewport.start((s) => {
			stats = s;
			frames = viewport.frames;
		});
		return () => viewport.dispose();
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
		<span>{stats.triangles.toLocaleString()} tris</span>
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
</style>
