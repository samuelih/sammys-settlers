import { expect, test, type Page } from '@playwright/test';

// End-to-end in-game core-loop test against a LIVE Java SOCServer + bots.
//
// PREREQUISITE (started by the orchestrator, not Playwright):
//   web/scripts/start-test-server.sh   (TCP 8881, WS 8888, 7 bots)
//
// Flow: connect -> create a SEA-BOARD (SBL=t) 4-player game -> sit -> start ->
// drive the human's INITIAL PLACEMENT (click highlighted settlement/road
// targets whenever it's our turn) -> once it's our normal turn, roll the dice.
// Bots take their turns automatically in between.

function uniqueGameName(workerIndex: number): string {
  const ts = Date.now().toString().slice(-7);
  return `g2e${workerIndex}_${ts}`;
}

/** Counts of the action targets currently offered to the local player. */
async function actions(page: Page): Promise<{ nodes: number; edges: number; roll: number }> {
  const [nodes, edges, roll] = await Promise.all([
    page.locator('[data-testid^="node-"]').count(),
    page.locator('[data-testid^="edge-"]').count(),
    page.getByTestId('roll-dice').count(),
  ]);
  return { nodes, edges, roll };
}

/**
 * Try each currently-offered placement target (node or edge) that we haven't
 * tried yet; a click is "accepted" when that target detaches (the server placed
 * the piece and the highlight set changed). Rejected targets are remembered and
 * skipped. Returns true if a placement was accepted.
 */
async function tryPlace(page: Page, tried: Set<string>): Promise<boolean> {
  const targets = await page.locator('[data-testid^="node-"], [data-testid^="edge-"]').all();
  for (const t of targets) {
    const tid = await t.getAttribute('data-testid');
    if (!tid || tried.has(tid)) continue;
    tried.add(tid);
    await t.click({ timeout: 5_000 }).catch(() => undefined);
    const accepted = await page
      .locator(`[data-testid="${tid}"]`)
      .waitFor({ state: 'detached', timeout: 4_000 })
      .then(() => true)
      .catch(() => false);
    if (accepted) return true;
  }
  return false;
}

test('play a sea-board game vs bots: initial placement + roll', async ({ page }, testInfo) => {
  test.setTimeout(150_000);

  await page.goto('/');
  await page.getByTestId('host-input').fill('localhost');
  await page.getByTestId('port-input').fill('8888');
  await page.getByTestId('connect-button').click();
  await expect(page.getByTestId('lobby-screen')).toBeVisible({ timeout: 15_000 });

  // New Game dialog (triggers option discovery).
  await page.getByTestId('new-game-button').click();
  await expect(page.getByTestId('newgame-name')).toBeVisible();

  const gameName = uniqueGameName(testInfo.workerIndex);
  await page.getByTestId('newgame-name').fill(gameName);

  // Enable the sea board (SBL=t) so the board uses the v3 large-board layout.
  const sbl = page.getByTestId('opt-SBL');
  await expect(sbl).toBeVisible({ timeout: 15_000 });
  await sbl.locator('input[type="checkbox"]').check();

  // Keep PL at 4 if present.
  const plField = page.getByTestId('opt-PL');
  if (await plField.count()) {
    const plInput = plField.locator('input[type="number"]');
    if (await plInput.count()) await plInput.first().fill('4');
  }

  await page.getByTestId('newgame-create').click();

  // GameRoom -> sit -> start.
  await expect(page.getByTestId('game-room')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('sit-0').click();
  await expect(page.getByTestId('seat-occupant-0')).toBeVisible({ timeout: 10_000 });
  const start = page.getByTestId('start-game');
  await expect(start).toBeEnabled();
  await start.click();

  // In-game view with a rendered sea board.
  await expect(page.getByTestId('game-started')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('board-svg')).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => page.locator('[data-testid^="hex-"]').count(), { timeout: 30_000 })
    .toBeGreaterThan(0);

  // Drive initial placement: respond whenever it's our turn with a target,
  // until we reach our normal turn (roll-dice offered).
  let placements = 0;
  let rolled = false;
  const tried = new Set<string>();
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline && !rolled) {
    const a = await actions(page);
    if (a.roll > 0) {
      // Our normal turn: roll the dice and confirm the dice display updates.
      await page.getByTestId('roll-dice').click();
      await expect
        .poll(async () => page.getByTestId('dice-display').getAttribute('data-total'), {
          timeout: 15_000,
        })
        .toMatch(/^\d+$/);
      rolled = true;
      break;
    }
    if (a.nodes > 0 || a.edges > 0) {
      const placed = await tryPlace(page, tried);
      if (placed) placements++;
      else await page.waitForTimeout(400);
    } else {
      // Not our turn — let the bots act.
      await page.waitForTimeout(500);
    }
  }

  // The human drove a full initial placement (2 settlements + 2 roads) ...
  expect(placements).toBeGreaterThanOrEqual(4);
  // ... at least one settlement is rendered on the board ...
  await expect
    .poll(async () => page.locator('[data-testid^="settlement-"]').count())
    .toBeGreaterThanOrEqual(1);
  // ... and we reached and completed a normal dice roll.
  expect(rolled).toBe(true);
});
