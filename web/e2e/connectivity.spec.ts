import { expect, test } from '@playwright/test';

// End-to-end connectivity test against a LIVE Java SOCServer.
//
// PREREQUISITE: the orchestrator starts the Java server with the WebSocket
// transport and bots, e.g.:
//   JAVA_HOME=/opt/homebrew/opt/openjdk@17 \
//     gradle runServer -Djsettlers.websocket.port=8888 -Djsettlers.startrobots=7
//
// The web app is served by Playwright's webServer (npm run preview, port 5173).
// This test drives the ConnectScreen, connects to ws://localhost:8888, and
// asserts the LobbyScreen renders with the server version. The games list may
// legitimately be empty (bots don't create lobby games on their own), so the
// assertions tolerate an empty list.
test('connects to the live server and shows the lobby', async ({ page }) => {
  await page.goto('/');

  // Fill in host/port (defaults already match, but set explicitly for clarity).
  await page.getByTestId('host-input').fill('localhost');
  await page.getByTestId('port-input').fill('8888');

  await page.getByTestId('connect-button').click();

  // Once connected, the lobby renders the server version.
  const version = page.getByTestId('server-version');
  await expect(version).toBeVisible({ timeout: 15_000 });
  await expect(version).not.toHaveText('unknown');
  // The Java server reports 2.7.00 (vernum 2700).
  await expect(version).toContainText(/2\.7\.\d+|2700/);

  // The lobby screen itself is present.
  await expect(page.getByTestId('lobby-screen')).toBeVisible();

  // The games area renders: either a populated list (game-list) or the empty
  // state (game-list-empty). Both are acceptable this phase.
  const list = page.getByTestId('game-list');
  const empty = page.getByTestId('game-list-empty');
  await expect(list.or(empty)).toBeVisible();

  // If there are games, each is a game-item with a visible name.
  const itemCount = await page.getByTestId('game-item').count();
  if (itemCount > 0) {
    await expect(page.getByTestId('game-item').first()).toBeVisible();
  }
});
