// One-off visual preview: drive a real bot game against the dev server and
// save screenshots of the revamped game UI. Not a test — a dev aid.
//
//   node scripts/ui-preview.mjs
//
// Prereqs: vite dev server on :5173, Java test server WS on :8888.
import { chromium } from '@playwright/test';

const OUT = '/tmp/jsettlers-ui';
const name = `uiprev_${Date.now().toString().slice(-6)}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

async function shot(file) {
  await page.screenshot({ path: `${OUT}/${file}.png` });
  console.log(`saved ${OUT}/${file}.png`);
}

await page.goto('http://localhost:5180/');
await page.getByTestId('host-input').fill('localhost');
await page.getByTestId('port-input').fill('8888');
await page.getByTestId('connect-button').click();
await page.getByTestId('lobby-screen').waitFor({ timeout: 15_000 });

await page.getByTestId('new-game-button').click();
await page.getByTestId('newgame-name').fill(name);
await page.getByTestId('newgame-nick').fill(`prev${Date.now().toString().slice(-5)}`);
const sbl = page.getByTestId('opt-SBL');
await sbl.waitFor({ timeout: 15_000 });
await sbl.locator('input[type="checkbox"]').check();
await page.getByTestId('newgame-create').click();

await page.getByTestId('game-room').waitFor({ timeout: 15_000 }).catch(async (e) => {
  await shot('ERR-no-game-room');
  console.log('body text:', (await page.locator('body').innerText()).slice(0, 2000));
  throw e;
});
await page.getByTestId('sit-0').click();
await page.getByTestId('seat-occupant-0').waitFor({ timeout: 10_000 });
await page.getByTestId('start-game').click();

await page.getByTestId('game-started').waitFor({ timeout: 30_000 });
await page.getByTestId('board-svg').waitFor({ timeout: 30_000 });
await page.waitForTimeout(1500);
await shot('01-initial-placement');

// Drive initial placement until our normal turn (roll button appears).
const tried = new Set();
const deadline = Date.now() + 120_000;
let rolled = false;
while (Date.now() < deadline && !rolled) {
  if (await page.getByTestId('roll-dice').count()) {
    await shot('02-roll-turn');
    await page.getByTestId('roll-dice').click();
    await page.waitForTimeout(1200);
    rolled = true;
    break;
  }
  const targets = await page.locator('[data-testid^="node-"], [data-testid^="edge-"]').all();
  let placed = false;
  for (const t of targets) {
    const tid = await t.getAttribute('data-testid');
    if (!tid || tried.has(tid)) continue;
    tried.add(tid);
    await t.click({ timeout: 5_000 }).catch(() => undefined);
    placed = await page
      .locator(`[data-testid="${tid}"]`)
      .waitFor({ state: 'detached', timeout: 4_000 })
      .then(() => true)
      .catch(() => false);
    if (placed) break;
  }
  if (!placed) await page.waitForTimeout(400);
}

// A discard / robber prompt may be up; just capture whatever state we're in.
await page.waitForTimeout(1000);
await shot('03-after-roll');

// Dark theme via the rail toggle (third rail button).
const railTheme = page.locator('button[aria-label*="theme"]').first();
if (await railTheme.count()) {
  await railTheme.click();
  await page.waitForTimeout(600);
  await shot('04-dark-theme');
  await railTheme.click();
}

await browser.close();
console.log('done');
