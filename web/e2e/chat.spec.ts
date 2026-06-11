import { expect, test } from '@playwright/test';

// End-to-end test for in-game human chat + the leave-game confirmation, against
// a LIVE Java SOCServer + bots (WS 8888; see web/scripts/start-test-server.sh).
//
// Flow: connect -> create a 4-player game -> sit seat 0 -> start (bots fill the
// other seats) -> send a chat message from the log panel's input (the server
// echoes it back as GAMETEXTMSG, which renders as a chat line with the speaker
// nickname) -> leave via the header button, which now asks for confirmation.

function uniqueGameName(workerIndex: number): string {
  const ts = Date.now().toString().slice(-7);
  return `chat${workerIndex}_${ts}`;
}

test('send chat in a live game and leave with confirmation', async ({ page }, testInfo) => {
  test.setTimeout(90_000);

  await page.goto('/');
  await page.getByTestId('host-input').fill('localhost');
  await page.getByTestId('port-input').fill('8888');
  await page.getByTestId('connect-button').click();
  await expect(page.getByTestId('lobby-screen')).toBeVisible({ timeout: 15_000 });

  // Create a plain 4-player game.
  await page.getByTestId('new-game-button').click();
  await expect(page.getByTestId('newgame-name')).toBeVisible();
  const gameName = uniqueGameName(testInfo.workerIndex);
  await page.getByTestId('newgame-name').fill(gameName);
  // Wait for option discovery to finish (spinner gone) so create uses real opts.
  await expect(page.getByTestId('newgame-options-loading')).toHaveCount(0, {
    timeout: 15_000,
  });
  await page.getByTestId('newgame-create').click();

  // GameRoom -> sit -> start (button shows its pending state once clicked).
  await expect(page.getByTestId('game-room')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('sit-0').click();
  await expect(page.getByTestId('seat-occupant-0')).toBeVisible({ timeout: 10_000 });
  const start = page.getByTestId('start-game');
  await expect(start).toBeEnabled();
  await start.click();

  // In-game view.
  await expect(page.getByTestId('game-started')).toBeVisible({ timeout: 30_000 });

  // Send a chat message with Enter; the server echo renders it as a chat line
  // with our nickname.
  const chatText = `hello from e2e ${Date.now()}`;
  await page.getByTestId('chat-input').fill(chatText);
  await page.getByTestId('chat-input').press('Enter');
  await expect(page.getByTestId('chat-input')).toHaveValue('');
  const chatLine = page
    .getByTestId('game-log')
    .locator('p[data-kind="chat"]', { hasText: chatText });
  await expect(chatLine).toBeVisible({ timeout: 10_000 });
  await expect(chatLine).toContainText('WebPlayer');

  // Whitespace-only chat cannot be sent (Send button stays disabled).
  await page.getByTestId('chat-input').fill('   ');
  await expect(page.getByTestId('chat-send')).toBeDisabled();
  await page.getByTestId('chat-input').fill('');

  // Leave: the header button asks for confirmation first; cancel keeps playing.
  await page.getByTestId('leave-game').click();
  await expect(page.getByTestId('leave-confirm-dialog')).toBeVisible();
  await page.getByTestId('leave-cancel').click();
  await expect(page.getByTestId('leave-confirm-dialog')).toHaveCount(0);
  await expect(page.getByTestId('game-started')).toBeVisible();

  // Confirming actually leaves, returning to the lobby.
  await page.getByTestId('leave-game').click();
  await page.getByTestId('leave-confirm').click();
  await expect(page.getByTestId('lobby-screen')).toBeVisible({ timeout: 15_000 });
});
