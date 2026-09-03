import { defineConfig } from '@playwright/test';

// One smoke test that the built static shell loads and renders. Runs with no
// BASE_PATH so `vite preview` serves from /. The production build with
// BASE_PATH=/openride is exercised separately in CI.
export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	use: {
		baseURL: 'http://localhost:4173'
	},
	webServer: {
		command: 'pnpm build && pnpm preview --port 4173',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	}
});
