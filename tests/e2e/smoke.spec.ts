import { expect, test } from '@playwright/test';

test('landing page renders without console errors', async ({ page }) => {
	const consoleErrors: string[] = [];
	page.on('console', (msg) => {
		if (msg.type() === 'error') consoleErrors.push(msg.text());
	});
	page.on('pageerror', (err) => consoleErrors.push(err.message));

	await page.goto('/');

	await expect(page.getByRole('heading', { level: 1, name: 'OpenRide' })).toBeVisible();
	expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});
