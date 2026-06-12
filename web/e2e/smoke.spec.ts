import { expect, test } from '@playwright/test';

// Minimal smoke test proving the built web app serves and the design-system
// AppFrame mounts. The Java SOCServer does NOT need to be running for this
// test — it only checks the static shell. (See playwright.config.ts for the
// command to start the Java server for protocol/E2E tests.)
test('app shell renders', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle("Sammy's Settlers");
  await expect(page.getByTestId('app-shell')).toBeVisible();
  await expect(page.getByTestId('theme-toggle')).toBeVisible();
});
