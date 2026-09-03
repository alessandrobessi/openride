<script lang="ts">
	import { base } from '$app/paths';
</script>

<svelte:head>
	<title>OpenRide</title>
	<meta
		name="description"
		content="A browser-based, first-person motorcycle touring simulation built from real geographic data."
	/>
</svelte:head>

<main>
	<h1>OpenRide</h1>
	<p class="tagline">The Earth is the map. The ride is the game.</p>
	<p>
		A browser-based, first-person, simulation-oriented motorcycle touring experience built from
		real-world geographic data. The first ride is <strong>Passo dello Stelvio</strong>.
	</p>
	<p><a href="{base}/ride">Open the test stage →</a></p>
	<p class="status">Status: rendering scene (M1). No motorcycle or physics yet.</p>
</main>

<style>
	:global(body) {
		margin: 0;
		background: #0d0f12;
		color: #e8e8e8;
		font-family:
			system-ui,
			-apple-system,
			'Segoe UI',
			Roboto,
			sans-serif;
		line-height: 1.6;
	}

	main {
		max-width: 42rem;
		margin: 0 auto;
		padding: 5rem 1.5rem;
	}

	h1 {
		font-size: 2.75rem;
		margin: 0 0 0.25rem;
		letter-spacing: -0.02em;
	}

	.tagline {
		font-size: 1.15rem;
		color: #9fb2c4;
		margin: 0 0 2rem;
	}

	a {
		color: #6cc0ff;
	}

	.status {
		margin-top: 2rem;
		font-size: 0.9rem;
		color: #6b7785;
	}
</style>
