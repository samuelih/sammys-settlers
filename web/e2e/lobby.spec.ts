import { expect, test } from '@playwright/test';

// End-to-end lobby & game-setup test against a LIVE Java SOCServer.
//
// PREREQUISITE (started by the orchestrator, not by Playwright):
//   JAVA_HOME=/opt/homebrew/opt/openjdk@17 \
//     gradle runServer -Djsettlers.websocket.port=8888 -Djsettlers.startrobots=7
//
// Flow exercised (matches web/docs/protocol.md and the live capture):
//   connect -> New Game dialog -> create a unique 4-player game (PL=4)
//   -> server auto-joins us (GameRoom) -> Sit seat 0 -> Start
//   -> server fills 3 unlocked empty seats with bots -> game-started view.
//
// Generous timeouts: bots take a moment to be fetched and seated.

/** A game name unique per worker + timestamp to avoid collisions across runs. */
function uniqueGameName(workerIndex: number): string {
  const ts = Date.now().toString().slice(-7);
  return `e2e${workerIndex}_${ts}`;
}

test('create a 4-player game, sit, start, and get 3 bots', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);

  await page.goto('/');

  // Connect to the live WebSocket server.
  await page.getByTestId('host-input').fill('localhost');
  await page.getByTestId('port-input').fill('8888');
  await page.getByTestId('connect-button').click();

  // Lobby renders once connected.
  await expect(page.getByTestId('lobby-screen')).toBeVisible({
    timeout: 15_000,
  });

  // Open the New Game dialog (also triggers requestGameOptions()).
  await page.getByTestId('new-game-button').click();
  await expect(page.getByTestId('newgame-name')).toBeVisible();

  const gameName = uniqueGameName(testInfo.workerIndex);
  await page.getByTestId('newgame-name').fill(gameName);

  // Ensure PL=4 if the option control is present (it may live in the prominent
  // block). The OptionField renders an int input inside data-testid="opt-PL".
  const plField = page.getByTestId('opt-PL');
  if (await plField.count()) {
    const plInput = plField.locator('input[type="number"]');
    if (await plInput.count()) {
      await plInput.first().fill('4');
    }
  }

  // Create — the server broadcasts the new game and auto-joins us.
  await page.getByTestId('newgame-create').click();

  // We land in the GameRoom for the new game.
  await expect(page.getByTestId('game-room')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('game-room-name')).toHaveText(gameName);

  // Four seats are rendered.
  await expect(page.getByTestId('seat-0')).toBeVisible();
  await expect(page.getByTestId('seat-3')).toBeVisible();

  // Sit at seat 0.
  await page.getByTestId('sit-0').click();
  await expect(page.getByTestId('seat-occupant-0')).toBeVisible({
    timeout: 10_000,
  });

  // Start the game — Start should be enabled once we're seated.
  const start = page.getByTestId('start-game');
  await expect(start).toBeEnabled();
  await start.click();

  // The game starts: Root swaps to the started view. Bots take a moment to be
  // fetched and seated, so allow a generous timeout.
  await expect(page.getByTestId('game-started')).toBeVisible({
    timeout: 30_000,
  });

  // Three bot players become seated (1 human + 3 bots = 4 players). Wait until
  // at least three player panels are flagged as robots.
  const botRows = page.locator(
    '[data-testid^="player-panel-"][data-robot="true"]',
  );
  await expect
    .poll(async () => botRows.count(), { timeout: 30_000 })
    .toBeGreaterThanOrEqual(3);

  // The local player occupies seat 0 (panel 0 is seated and flagged "you").
  await expect(page.getByTestId('player-panel-0')).toHaveAttribute('data-seated', 'true');
  await expect(page.getByTestId('player-name-0')).toContainText('you');
});
