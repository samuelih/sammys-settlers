import { expect, test, type Page } from '@playwright/test';

// Cities & Knights bot-survival E2E against a LIVE Java SOCServer + bots.
//
// PREREQUISITE (started by the orchestrator, not Playwright):
//   web/scripts/start-test-server.sh   (TCP 8881, WS 8888, 7 bots)
//
// Flow: connect -> create a game with the SC_CK scenario -> sit -> start with 3
// bots -> drive the human's initial placement -> then play many rounds (roll +
// end turn on our turn) and assert the game keeps progressing: bots in a C&K
// game must never hang on the new mechanics (barbarians resolve automatically,
// progress draws and commodity production are server-side).

function uniqueGameName(workerIndex: number): string {
  const ts = Date.now().toString().slice(-7);
  return `ckbot${workerIndex}_${ts}`;
}

async function actions(page: Page): Promise<{ nodes: number; edges: number; roll: number; end: number }> {
  const [nodes, edges, roll, end] = await Promise.all([
    page.locator('[data-testid^="node-"]').count(),
    page.locator('[data-testid^="edge-"]').count(),
    page.getByTestId('roll-dice').count(),
    page.getByTestId('end-turn').count(),
  ]);
  return { nodes, edges, roll, end };
}

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

test('SC_CK game vs bots: bots survive many C&K rounds without stalling', async ({ page }, testInfo) => {
  test.setTimeout(300_000);

  // Surface any client-side crash that would freeze message processing.
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => {
    pageErrors.push(e.message);
    console.log('PAGEERROR:', e.message);
  });
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('CONSOLE-ERROR:', m.text().slice(0, 400));
  });

  await page.goto('/');
  await page.getByTestId('host-input').fill('localhost');
  await page.getByTestId('port-input').fill('8888');
  await page.getByTestId('connect-button').click();
  await expect(page.getByTestId('lobby-screen')).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('new-game-button').click();
  await expect(page.getByTestId('newgame-name')).toBeVisible();

  const gameName = uniqueGameName(testInfo.workerIndex);
  await page.getByTestId('newgame-name').fill(gameName);

  // Pick the Cities & Knights scenario; its option string brings in
  // _SC_CK, all _CK_* rules, SBL=t and VP=t13 server-side.
  const scenarioSelect = page.getByTestId('newgame-scenario');
  await expect(scenarioSelect).toBeVisible({ timeout: 15_000 });
  await scenarioSelect.selectOption('SC_CK');

  await page.getByTestId('newgame-create').click();

  await expect(page.getByTestId('game-room')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('sit-0').click();
  await expect(page.getByTestId('seat-occupant-0')).toBeVisible({ timeout: 10_000 });
  const start = page.getByTestId('start-game');
  await expect(start).toBeEnabled();
  await start.click();

  await expect(page.getByTestId('game-started')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('board-svg')).toBeVisible({ timeout: 30_000 });

  // Drive initial placement, then keep the game moving for many rounds.
  // The loop is driven by the store snapshot's (currentPlayer, gameState):
  // on our turn we roll then end the turn; everything else (discard, trade
  // offers, robber interludes) is resolved as it appears. "Progress" is any
  // change of the (player, state, dice) signature; 45s without one = a stall,
  // which is what this test guards against (a bot hanging on C&K mechanics).
  let placements = 0;
  let rolls = 0;
  const wantRolls = 12; // 4 players x 12 of our turns ~= 48 total rolls > several barbarian attacks
  const tried = new Set<string>();
  let lastProgress = Date.now();
  let lastSig = '';
  const deadline = Date.now() + 280_000;

  type Snap = { gameState: number; mySeat: number; currentPlayerNumber: number } | null;
  const snap = async (): Promise<Snap> =>
    page.evaluate(() => {
      const w = window as unknown as { __jsettlers?: { gameSnapshot: () => unknown } };
      return (w.__jsettlers ? w.__jsettlers.gameSnapshot() : null) as {
        gameState: number;
        mySeat: number;
        currentPlayerNumber: number;
      } | null;
    });

  while (Date.now() < deadline && rolls < wantRolls) {
    const s = await snap();
    if (!s) {
      await page.waitForTimeout(400);
      continue;
    }

    const sig = `${s.currentPlayerNumber}:${s.gameState}`;
    if (sig !== lastSig) {
      lastSig = sig;
      lastProgress = Date.now();
    }
    const myTurn = s.mySeat >= 0 && s.mySeat === s.currentPlayerNumber;

    // Discards can be required even on others' turns:
    const discard = page.getByTestId('discard-confirm');
    if (await discard.count()) {
      for (let guard = 0; guard < 20 && !(await discard.isEnabled()); ++guard) {
        let bumped = false;
        for (const p of await page.locator('[data-testid^="pick-"][data-testid$="-plus"]').all()) {
          if (await discard.isEnabled()) break;
          if (await p.isEnabled().catch(() => false)) {
            await p.click().catch(() => undefined);
            bumped = true;
          }
        }
        if (!bumped) break;
      }
      await discard.click().catch(() => undefined);
      await page.waitForTimeout(300);
      continue;
    }

    // Reject incoming trade offers: the offering bot waits for our answer.
    const rejects = await page.locator('[data-testid^="reject-offer-"]').all();
    if (rejects.length > 0) {
      for (const r of rejects) await r.click().catch(() => undefined);
      await page.waitForTimeout(200);
      continue;
    }

    if (myTurn) {
      if (s.gameState === 15) {
        // ROLL_OR_CARD
        const roll = page.getByTestId('roll-dice');
        if (await roll.count()) {
          await roll.click().catch(() => undefined);
          rolls++;
        }
        await page.waitForTimeout(400);
        continue;
      }
      if (s.gameState === 20) {
        // PLAY1: end our turn
        await page.getByTestId('end-turn').first().click().catch(() => undefined);
        await page.waitForTimeout(400);
        continue;
      }
      if (s.gameState >= 5 && s.gameState <= 13) {
        // Initial placement
        if (await tryPlace(page, tried)) placements++;
        else await page.waitForTimeout(400);
        continue;
      }
      if (s.gameState === 54) {
        // WAITING_FOR_ROBBER_OR_PIRATE
        await page.getByTestId('choose-robber').click().catch(() => undefined);
        await page.waitForTimeout(300);
        continue;
      }
      if (s.gameState === 33 || s.gameState === 34) {
        // PLACING_ROBBER / PLACING_PIRATE: click a resource land hex
        const LAND_KINDS = new Set(['clay', 'ore', 'sheep', 'wheat', 'wood']);
        for (const h of await page.locator('[data-testid^="hex-"]').all()) {
          const kind = await h.getAttribute('data-hexkind');
          if (kind === null || !LAND_KINDS.has(kind)) continue;
          await h.click().catch(() => undefined);
          break;
        }
        await page.waitForTimeout(300);
        continue;
      }
      if (s.gameState === 51 || s.gameState === 55) {
        // Choosing a robbery victim
        const victims = await page.locator('[data-testid^="rob-victim-"]').all();
        if (victims.length > 0) await victims[0].click().catch(() => undefined);
        await page.waitForTimeout(300);
        continue;
      }
    }

    // Bots' turn (or a state we don't drive): watch for progress.
    if (Date.now() - lastProgress >= 45_000) {
      console.log('STALL SNAPSHOT:', JSON.stringify(await snap()));
      console.log('PAGE ERRORS:', JSON.stringify(pageErrors));
    }
    expect(Date.now() - lastProgress, `game progressed within 45s (sig ${sig})`).toBeLessThan(45_000);
    await page.waitForTimeout(500);
  }

  expect(placements).toBeGreaterThanOrEqual(4);
  expect(rolls).toBeGreaterThanOrEqual(wantRolls);
});
