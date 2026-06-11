// Test-only helpers shared by the map-editor unit tests. Loads the REAL on-disk
// sample-island.map.json (the .map.json schema source of truth) so the tests
// validate against the actual file the Java server ships, not a hand-copy.
//
// Vitest runs with the `web/` directory as cwd, so we resolve the sample relative
// to the repo root one level up. (import.meta.url is rewritten by Vite to a non-
// file URL under jsdom, so we use process.cwd() instead.)

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Absolute path to the shipped sample custom map. */
export const SAMPLE_MAP_PATH = resolve(
  process.cwd(),
  '..',
  'src/main/bin/custommaps/sample-island.map.json',
);

/** Raw JSON text of the shipped sample custom map. */
export const sampleMapText = readFileSync(SAMPLE_MAP_PATH, 'utf-8');
