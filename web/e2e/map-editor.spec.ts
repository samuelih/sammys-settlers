import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// E2E for the web map editor (Phase 5).
//
// These tests exercise the editor PURELY through its UI (the testids the editor
// components expose), proving the full author workflow end-to-end:
//
//   open app  ->  header nav "Map Editor" (data-testid="nav-map-editor")
//   ->  load the bundled sample (data-testid="editor-load-sample")
//   ->  it validates clean (data-testid="editor-valid" shown)
//   ->  a small valid edit (rename via data-testid="editor-name")
//   ->  export (data-testid="editor-export") and read the serialized
//       `.map.json` out of data-testid="export-json"
//   ->  WRITE that JSON to web/test-results/exported-map.json (Node fs).
//
// The orchestrator then feeds that exported file through the REAL Java
// `soc.server.CustomMapValidator` (via web/scripts/validate-map.sh) to prove the
// editor's output is byte-compatible with the server. That Java round-trip is
// intentionally NOT run here — this spec only produces the artifact and asserts
// the editor's own live validation UI behaves correctly.
//
// A second case introduces a clearly invalid change (a duplicate hex coordinate)
// and asserts the validation panel surfaces an error while the "valid" badge is
// gone — i.e. the editor would stop the author from exporting a map the server
// would reject.

const here = resolve(fileURLToPath(import.meta.url), '..');
const webDir = resolve(here, '..');

/** Where the exported `.map.json` is written for the Java round-trip step. */
export const EXPORT_PATH = resolve(webDir, 'test-results', 'exported-map.json');

/**
 * Open the app and navigate into the map editor via the header nav, then wait
 * for the editor screen to mount. Shared by both cases.
 */
async function openEditor(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('app-shell')).toBeVisible();

  await page.getByTestId('nav-map-editor').click();
  await expect(page.getByTestId('map-editor-screen')).toBeVisible();
}

test.describe('map editor — UI round-trip (export artifact for the Java validator)', () => {
  test('load sample, validate, make a valid edit, export, and persist the JSON', async ({
    page,
  }) => {
    await openEditor(page);

    // Load the bundled sample map. It is a known-valid `.map.json`.
    await page.getByTestId('editor-load-sample').click();

    // The sample loads into the editor's name field (confirms the import took).
    const nameInput = page.getByTestId('editor-name');
    await expect(nameInput).toHaveValue('Sample Two Islands');

    // Live validation should report the map as valid (no error-severity issues).
    await expect(page.getByTestId('editor-valid')).toBeVisible();
    // No error rows in the validation list.
    await expect(page.getByTestId('editor-issue-error')).toHaveCount(0);

    // --- A valid frame edit: expand the authoring canvas. -----------------
    await expect(page.getByTestId('editor-board-height')).toHaveValue('16');
    await expect(page.getByTestId('editor-board-width')).toHaveValue('17');
    await page.getByTestId('editor-board-height-inc').click();
    await page.getByTestId('editor-board-width-inc').click();
    await expect(page.getByTestId('editor-board-height')).toHaveValue('18');
    await expect(page.getByTestId('editor-board-width')).toHaveValue('19');

    // --- A small VALID edit: rename the map. ------------------------------
    // The new name has no '|' or ',' and no control chars, so it stays valid.
    const newName = 'Sample Two Islands (e2e edit)';
    await nameInput.fill(newName);
    await expect(nameInput).toHaveValue(newName);

    // Still valid after the edit.
    await expect(page.getByTestId('editor-valid')).toBeVisible();
    await expect(page.getByTestId('editor-issue-error')).toHaveCount(0);

    // --- Export and read the serialized `.map.json`. ----------------------
    await page.getByTestId('editor-export').click();
    const exportArea = page.getByTestId('export-json');
    // Wait until the export textarea is populated (non-empty), then read it.
    await expect(exportArea).not.toHaveValue('');
    const exportedJson = await exportArea.inputValue();

    // Sanity-check the exported text in-process before handing it to the
    // external Java validator: it must be parseable JSON carrying our edit.
    const parsed = JSON.parse(exportedJson) as {
      name?: string;
      boardHeight?: number;
      boardWidth?: number;
      landHexes?: unknown[];
    };
    expect(parsed.name).toBe(newName);
    expect(parsed.boardHeight).toBe(18);
    expect(parsed.boardWidth).toBe(19);
    expect(Array.isArray(parsed.landHexes)).toBe(true);
    expect((parsed.landHexes ?? []).length).toBeGreaterThan(0);

    // --- Persist the export for the orchestrator's Java round-trip. --------
    // The serializeMapJson output already ends in a trailing newline; write it
    // verbatim so the file is byte-identical to what the editor produced.
    mkdirSync(dirname(EXPORT_PATH), { recursive: true });
    writeFileSync(EXPORT_PATH, exportedJson, 'utf-8');

    // Confirm the file landed where the validator expects it.
    expect(EXPORT_PATH.endsWith('web/test-results/exported-map.json')).toBe(true);
  });
});

test.describe('map editor — invalid change is caught by live validation', () => {
  test('a duplicate hex coordinate shows an error and hides the valid badge', async ({
    page,
  }) => {
    await openEditor(page);

    // Start from the known-valid sample, confirm it is valid.
    await page.getByTestId('editor-load-sample').click();
    await expect(page.getByTestId('editor-valid')).toBeVisible();

    // Build a clearly-INVALID variant of the sample: duplicate a land-hex
    // coordinate. The schema parser (`parseMapJson`) accepts the JSON
    // structurally, so the duplicate flows into the LIVE validator and is
    // reported in the panel (mirrors CustomMapValidator's "duplicate hex
    // coordinate" rejection). We feed it through the editor's own import box so
    // the whole path runs through real UI controls.
    const invalidJson = JSON.stringify({
      name: 'Invalid Dup Coord',
      playerCounts: [3, 4],
      shuffle: false,
      landHexes: [
        { type: 'clay', coord: '0x0309', diceNum: 5, landArea: 1 },
        // Duplicate of the first hex's coordinate -> validation error.
        { type: 'ore', coord: '0x0309', diceNum: 6, landArea: 1 },
      ],
    });

    await page.getByTestId('editor-import').fill(invalidJson);
    await page.getByTestId('editor-import-apply').click();

    // Confirm the invalid map actually loaded (name reflects the import).
    await expect(page.getByTestId('editor-name')).toHaveValue('Invalid Dup Coord');

    // The validation panel must now show at least one error row, and the
    // "valid" badge must be gone.
    const validationPanel = page.getByTestId('editor-validation');
    await expect(validationPanel).toBeVisible();
    const errorRows = validationPanel.getByTestId('editor-issue-error');
    await expect(errorRows.first()).toBeVisible();
    expect(await errorRows.count()).toBeGreaterThan(0);
    // The duplicate-coordinate message is surfaced verbatim.
    await expect(validationPanel).toContainText('duplicate hex coordinate');

    // editor-valid must NOT be shown while an error exists.
    await expect(page.getByTestId('editor-valid')).toHaveCount(0);
  });
});
