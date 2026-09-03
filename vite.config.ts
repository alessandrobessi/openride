import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		// Headless-first simulation core: unit + scenario tests run in Node with no
		// DOM. See MOTORCYCLE-PHYSICS.md §66 and the plan's "Determinism & scenario
		// harness" section.
		include: ['src/**/*.{test,spec}.{js,ts}', 'tests/{unit,scenario}/**/*.{test,spec}.{js,ts}'],
		environment: 'node'
	}
});
