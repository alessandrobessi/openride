import { expect, test } from '@playwright/test';

test('ride test stage renders a live WebGL viewport', async ({ page }) => {
	const consoleErrors: string[] = [];
	page.on('console', (msg) => {
		if (msg.type() === 'error') consoleErrors.push(msg.text());
	});
	page.on('pageerror', (err) => consoleErrors.push(err.message));

	await page.goto('/ride');

	const canvas = page.getByTestId('viewport');
	await expect(canvas).toBeVisible();

	// The render loop must actually be running: the frame counter advances.
	const stats = page.getByTestId('render-stats');
	await expect.poll(() => stats.getAttribute('data-frames').then(Number)).toBeGreaterThan(5);

	expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});
