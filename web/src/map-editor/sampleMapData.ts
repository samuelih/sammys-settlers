/**
 * A bundled, byte-for-byte copy of the shipped sample custom map
 * (`src/main/bin/custommaps/sample-island.map.json`), so the web map editor can
 * offer a one-click "Load sample" in the browser WITHOUT a network fetch or a
 * Node `fs` read (those only work in the build/test harness, not the running app).
 *
 * Keep this in sync with the on-disk sample. The map-editor unit/e2e tests load
 * the REAL file via `testFixtures.ts`; this constant is purely a UI convenience.
 * (If they ever drift, the validation/round-trip tests still gate the real file.)
 */

/** Raw `.map.json` text of the shipped "Sample Two Islands" custom map. */
export const SAMPLE_MAP_JSON = `{
  "name": "Sample Two Islands",
  "description": "A small two-island variant demonstrating the custom-map format. Start on the main island; build out to the small island for more victory points.",
  "playerCounts": [3, 4],
  "shuffle": false,
  "landHexes": [
    { "type": "clay",  "coord": "0x0309", "diceNum": 5,  "landArea": 1 },
    { "type": "ore",   "coord": "0x030B", "diceNum": 6,  "landArea": 1 },
    { "type": "sheep", "coord": "0x0508", "diceNum": 8,  "landArea": 1 },
    { "type": "wheat", "coord": "0x050A", "diceNum": 4,  "landArea": 1 },
    { "type": "wood",  "coord": "0x050C", "diceNum": 9,  "landArea": 1 },
    { "type": "clay",  "coord": "0x0709", "diceNum": 10, "landArea": 1 },
    { "type": "sheep", "coord": "0x070B", "diceNum": 3,  "landArea": 1 },
    { "type": "wheat", "coord": "0x0908", "diceNum": 11, "landArea": 1 },

    { "type": "wood",  "coord": "0x0B0B", "diceNum": 5,  "landArea": 2 },
    { "type": "ore",   "coord": "0x0B0D", "diceNum": 9,  "landArea": 2 },
    { "type": "sheep", "coord": "0x0D0C", "diceNum": 4,  "landArea": 2 },
    { "type": "wheat", "coord": "0x0F0B", "diceNum": 8,  "landArea": 2 }
  ],
  "landAreas": [
    { "area": 1, "count": 8 },
    { "area": 2, "count": 4 }
  ],
  "ports": [
    { "type": "misc",  "edge": "0x0807", "facing": "SE" },
    { "type": "wood",  "edge": "0x060C", "facing": "NW" },
    { "type": "ore",   "edge": "0x0A0C", "facing": "SE" },
    { "type": "misc",  "edge": "0x0C0D", "facing": "NW" }
  ],
  "robberHex": "0x0709",
  "pirateHex": "0x0D0C"
}
`;
