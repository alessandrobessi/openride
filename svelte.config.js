import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// GitHub Pages serves this project from https://<user>.github.io/openride/, so the
// app must be built with a base path. CI sets BASE_PATH=/openride; local dev and
// the e2e smoke run with no base path (served from /). See AGENTS.md §3.
const base = process.env.BASE_PATH ?? '';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// fallback 404.html doubles as the SPA entry point on GitHub Pages.
		adapter: adapter({ fallback: '404.html' }),
		paths: { base }
	}
};

export default config;
