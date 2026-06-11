import { expect, test, type Page, type TestInfo } from '@playwright/test';

// Cities & Knights mechanics E2E against a LIVE Java SOCServer + bots.
//
// PREREQUISITE (started by the orchestrator, not Playwright):
//   web/scripts/start-test-server.sh   (TCP 8881, WS 8888, 7 bots, debug user)
//
// Flow: create an SC_CK game as the "debug" user -> sit -> start vs 3 bots ->
// drive initial placement -> then on our turns exercise every C&K surface with
// deterministic debug grants:
//   - barbarian strength indicator advances with rolls
//   - buy a knight (1 sheep + 1 ore), activate it (1 wheat)
//   - grant cloth via the ckcomm: debug command, build Trade improvement lvl 1
// Assertions go through both the DOM (ck-* testids) and the window.__jsettlers
// store snapshot's `ck` section.

interface CKSnapshot {
  commodities: { cloth: number; coin: number; paper: number };
  knights: Record<string, { total: number; active: number }>;
  improvements: { trade: number; politics: number; science: number };
  barbarianStrength: number;
  metropolisOwners: number[];
  progressHand: number[];
}

interface GameSnapshot {
  gameName: string;
  gameState: number;
  mySeat: number;
  currentPlayerNumber: number;
  myResources: Record<string, number> | null;
  ck: CKSnapshot | null;
}

async function snapshot(page: Page): Promise<GameSnapshot | null> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __jsettlers?: { gameSnapshot: () => unknown };
    };
    return (w.__jsettlers ? w.__jsettlers.gameSnapshot() : null) as GameSnapshot | null;
  });
}

async function sendDebug(page: Page, text: string): Promise<boolean> {
  return page.evaluate((cmd) => {
    const w = window as unknown as {
      __jsettlers?: { sendDebug: (t: string) => boolean };
    };
    return w.__jsettlers ? w.__jsettlers.sendDebug(cmd) : false;
  }, text);
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

/** Drive initial placement until our first dice roll completes. */
async function driveInitialPlacementAndFirstRoll(page: Page): Promise<void> {
  let rolled = false;
  const tried = new Set<string>();
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline && !rolled) {
    if ((await page.getByTestId('roll-dice').count()) > 0) {
      await page.getByTestId('roll-dice').click();
      await expect
        .poll(async () => page.getByTestId('dice-display').getAttribute('data-total'), {
          timeout: 15_000,
        })
        .toMatch(/^\d+$/);
      rolled = true;
      break;
    }
    const nodes = await page.locator('[data-testid^="node-"]').count();
    const edges = await page.locator('[data-testid^="edge-"]').count();
    if (nodes > 0 || edges > 0) {
      if (!(await tryPlace(page, tried))) await page.waitForTimeout(400);
    } else {
      await page.waitForTimeout(500);
    }
  }
  expect(rolled, 'completed our first normal dice roll').toBe(true);
}

/**
 * Resolve any 7-roll interlude that's blocking us: robber-or-pirate choice,
 * robber placement (click a resource land hex), and victim choice.
 */
async function handleSevenInterludes(page: Page): Promise<void> {
  if ((await page.getByTestId('choose-robber').count()) > 0) {
    await page.getByTestId('choose-robber').click().catch(() => undefined);
    return;
  }
  const s = await snapshot(page);
  const PLACING_ROBBER = 33;
  if (s && s.gameState === PLACING_ROBBER && s.currentPlayerNumber === s.mySeat) {
    const LAND_KINDS = new Set(['clay', 'ore', 'sheep', 'wheat', 'wood']);
    for (const h of await page.locator('[data-testid^="hex-"]').all()) {
      const kind = await h.getAttribute('data-hexkind');
      if (kind === null || !LAND_KINDS.has(kind)) continue;
      await h.click().catch(() => undefined);
      const after = await snapshot(page);
      if (!after || after.gameState !== PLACING_ROBBER) return;
    }
  }
  const victims = await page.locator('[data-testid^="rob-victim-"]').all();
  if (victims.length > 0) {
    await victims[0].click().catch(() => undefined);
  }
}

/** Poll until it's our turn in PLAY1 (snapshot gameState 20 a.k.a. SOCGame.PLAY1). */
async function waitForMyPlay1(page: Page, timeoutMs = 90_000): Promise<boolean> {
  const PLAY1 = 20;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await snapshot(page);
    if (s && s.mySeat >= 0 && s.currentPlayerNumber === s.mySeat && s.gameState === PLAY1) {
      return true;
    }
    // If a roll is offered it's our ROLL_OR_CARD: roll to get into PLAY1.
    if ((await page.getByTestId('roll-dice').count()) > 0) {
      await page.getByTestId('roll-dice').click().catch(() => undefined);
    }
    await handleSevenInterludes(page);
    await page.waitForTimeout(300);
  }
  return false;
}

async function setupCKGame(page: Page, testInfo: TestInfo): Promise<string> {
  await page.goto('/');
  await page.getByTestId('host-input').fill('localhost');
  await page.getByTestId('port-input').fill('8888');
  await page.getByTestId('connect-button').click();
  await expect(page.getByTestId('lobby-screen')).toBeVisible({ timeout: 15_000 });

  await page.getByTestId('new-game-button').click();
  await expect(page.getByTestId('newgame-name')).toBeVisible();
  const gameName = `ck2e${testInfo.workerIndex}_${Date.now().toString().slice(-7)}`;
  await page.getByTestId('newgame-name').fill(gameName);

  // Connect/seat as the "debug" user so the server runs our debug chat-commands.
  const nick = page.getByTestId('newgame-nick');
  await expect(nick).toBeVisible();
  await nick.fill('debug');

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
  await expect
    .poll(async () => page.locator('[data-testid^="hex-"]').count(), { timeout: 30_000 })
    .toBeGreaterThan(0);
  return gameName;
}

test('Cities & Knights vs bots: barbarians, knights, commodities, improvements', async ({
  page,
}, testInfo) => {
  test.setTimeout(280_000);

  await setupCKGame(page, testInfo);
  await driveInitialPlacementAndFirstRoll(page);

  // The C&K panel renders for SC_CK games, with the barbarian indicator showing
  // a valid strength (someone has rolled by now, but an attack may have reset it).
  await expect(page.getByTestId('ck-panel')).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => page.getByTestId('ck-barbarian').getAttribute('data-strength'), {
      timeout: 15_000,
    })
    .toMatch(/^[0-7]$/);

  await test.step('buy and activate a knight with debug-granted resources', async () => {
    expect(await waitForMyPlay1(page)).toBe(true);

    // 1 sheep + 1 ore for the knight, 1 wheat for the activation.
    expect(await sendDebug(page, 'rsrcs: 0 1 1 1 0 #0')).toBe(true);
    await expect
      .poll(
        async () => {
          const txt = await page.getByTestId('my-res-sheep').innerText();
          const m = /(\d+)/.exec(txt);
          return m ? Number(m[1]) : 0;
        },
        { timeout: 10_000 },
      )
      .toBeGreaterThanOrEqual(1);

    const buy = page.getByTestId('ck-knight-buy');
    await expect(buy).toBeEnabled({ timeout: 10_000 });
    await buy.click();
    await expect
      .poll(async () => (await snapshot(page))?.ck?.knights['level1']?.total ?? 0, {
        timeout: 10_000,
      })
      .toBe(1);

    const activate = page.getByTestId('ck-knight-activate');
    await expect(activate).toBeEnabled({ timeout: 10_000 });
    await activate.click();
    await expect
      .poll(async () => (await snapshot(page))?.ck?.knights['level1']?.active ?? 0, {
        timeout: 10_000,
      })
      .toBe(1);
  });

  await test.step('grant cloth via ckcomm: and build Trade improvement level 1', async () => {
    expect(await waitForMyPlay1(page)).toBe(true);

    expect(await sendDebug(page, 'ckcomm: 1 0 0 #0')).toBe(true);
    await expect
      .poll(async () => (await snapshot(page))?.ck?.commodities.cloth ?? 0, { timeout: 10_000 })
      .toBe(1);
    await expect(page.getByTestId('ck-commodity-cloth')).toContainText('1');

    const build = page.getByTestId('ck-build-trade');
    await expect(build).toBeEnabled({ timeout: 10_000 });
    await build.click();

    await expect
      .poll(async () => (await snapshot(page))?.ck?.improvements.trade ?? 0, { timeout: 10_000 })
      .toBe(1);
    await expect
      .poll(async () => (await snapshot(page))?.ck?.commodities.cloth ?? -1, { timeout: 10_000 })
      .toBe(0);
  });

  await test.step('improvement build is declined without commodities', async () => {
    // Politics costs 1 coin which we don't have; the button should be disabled.
    await expect(page.getByTestId('ck-build-politics')).toBeDisabled();
  });
});
