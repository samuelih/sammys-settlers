// Tests for validation.ts — mirrors soc.server.CustomMapValidator rule-for-rule.
// The sample-island map must validate with ZERO errors; each invalid mutation must
// produce its specific error. Warnings (connectivity/contiguity heuristics the Java
// validator does NOT enforce) are kept separate so they never block a valid map.

import { describe, it, expect } from 'vitest';
import { parseMapJson, type CustomMap } from './mapSchema';
import {
  validate,
  isValid,
  adjacentHexToEdge,
  facingForEdge,
  type ValidationIssue,
} from './validation';
import { sampleMapText as sampleText } from './testFixtures';

/** Fresh deep copy of the sample map, for mutation tests. */
function sample(): CustomMap {
  return parseMapJson(sampleText);
}

function errors(issues: ValidationIssue[]): ValidationIssue[] {
  return issues.filter((i) => i.severity === 'error');
}
function messages(issues: ValidationIssue[]): string[] {
  return issues.map((i) => i.message);
}

describe('validate — the sample map is fully valid', () => {
  it('produces zero errors', () => {
    const issues = validate(sample());
    expect(errors(issues)).toEqual([]);
    expect(isValid(issues)).toBe(true);
  });

  it('produces zero warnings (each island is one contiguous area)', () => {
    const issues = validate(sample());
    expect(issues).toEqual([]);
  });
});

describe('validate — name', () => {
  it('flags a missing name', () => {
    const m = sample();
    m.name = '   ';
    const errs = errors(validate(m));
    expect(messages(errs)).toContain('missing required field "name"');
  });

  it('flags name containing | or ,', () => {
    const m = sample();
    m.name = 'bad|name';
    expect(messages(errors(validate(m)))).toContain(
      '"name" must not contain \'|\' or \',\' characters',
    );
    const m2 = sample();
    m2.name = 'bad,name';
    expect(messages(errors(validate(m2)))).toContain(
      '"name" must not contain \'|\' or \',\' characters',
    );
  });

  it('flags a name with control/newline characters', () => {
    const m = sample();
    m.name = 'line1\nline2';
    expect(messages(errors(validate(m)))).toContain(
      '"name" must not contain control or newline characters',
    );
  });
});

describe('validate — description', () => {
  it('flags a | in description', () => {
    const m = sample();
    m.description = 'has | pipe';
    expect(messages(errors(validate(m)))).toContain(
      '"description" must not contain \'|\' characters',
    );
  });

  it('allows commas in description (unlike name)', () => {
    const m = sample();
    m.description = 'commas, are, fine, here';
    expect(errors(validate(m))).toEqual([]);
  });
});

describe('validate — playerCounts', () => {
  it('flags an empty playerCounts', () => {
    const m = sample();
    m.playerCounts = [];
    expect(messages(errors(validate(m)))).toContain('missing required field "playerCounts"');
  });

  it('flags an unsupported player count', () => {
    const m = sample();
    m.playerCounts = [3, 5];
    expect(messages(errors(validate(m)))).toContain(
      '"playerCounts" entry 5 unsupported; must be 2, 3, 4, or 6',
    );
  });

  it('accepts 2, 3, 4, 6', () => {
    const m = sample();
    m.playerCounts = [2, 3, 4, 6];
    expect(errors(validate(m))).toEqual([]);
  });
});

describe('validate — land hexes', () => {
  it('flags an empty landHexes', () => {
    const m = sample();
    m.landHexes = [];
    m.landAreas = undefined;
    expect(messages(errors(validate(m)))).toContain('missing required field "landHexes"');
  });

  it('flags an unknown hex type', () => {
    const m = sample();
    m.landHexes[0].type = 'lava';
    expect(messages(errors(validate(m)))).toContain(
      'landHexes[0] unknown type "lava"; use clay/ore/sheep/wheat/wood/desert/gold/water',
    );
  });

  it('flags a missing hex type', () => {
    const m = sample();
    m.landHexes[0].type = '';
    expect(messages(errors(validate(m)))).toContain('landHexes[0] missing "type"');
  });

  it('flags an out-of-range coordinate (col > 22)', () => {
    const m = sample();
    m.landHexes[0].coord = '0x0317'; // col 0x17 = 23 > MAX_COL(22)
    expect(messages(errors(validate(m)))).toContain(
      'landHexes[0].coord 0x317 is out of board range (row 1..21, col 1..22)',
    );
  });

  it('flags an even-row land hex', () => {
    const m = sample();
    m.landHexes[0].coord = '0x0409'; // row 4 = even
    expect(messages(errors(validate(m)))).toContain(
      'landHexes[0].coord 0x409 is on an even row; land hexes must be on odd rows',
    );
  });

  it('flags a non-hex coordinate string', () => {
    const m = sample();
    m.landHexes[0].coord = 'ZZZ';
    expect(messages(errors(validate(m)))).toContain(
      'landHexes[0].coord "ZZZ" isn\'t a valid hex coordinate (example: "0x0504")',
    );
  });

  it('matches Java: "-0x10" is unparseable (0x not stripped), not "negative"', () => {
    // Java parseCoord only strips 0x when the first char is "0"; here it's "-",
    // so Integer.parseInt("-0x10",16) throws -> "isn't a valid hex coordinate".
    const m = sample();
    m.landHexes[0].coord = '-0x10';
    expect(messages(errors(validate(m)))).toContain(
      'landHexes[0].coord "-0x10" isn\'t a valid hex coordinate (example: "0x0504")',
    );
  });

  it('matches Java: a bare "-10" parses negative -> "must not be negative"', () => {
    const m = sample();
    m.landHexes[0].coord = '-10';
    expect(messages(errors(validate(m)))).toContain(
      'landHexes[0].coord "-10" must not be negative',
    );
  });

  it('flags a duplicate hex coordinate', () => {
    const m = sample();
    m.landHexes[1].coord = m.landHexes[0].coord; // 0x0309
    expect(messages(errors(validate(m)))).toContain(
      'duplicate hex coordinate 0x309 at landHexes[1]',
    );
  });

  it('flags a dice number out of range', () => {
    const m = sample();
    m.landHexes[0].diceNum = 7;
    expect(messages(errors(validate(m)))).toContain(
      'landHexes[0].diceNum 7 out of range; must be 2..12 except 7',
    );
    const m2 = sample();
    m2.landHexes[0].diceNum = 13;
    expect(messages(errors(validate(m2)))).toContain(
      'landHexes[0].diceNum 13 out of range; must be 2..12 except 7',
    );
  });

  it('allows dice number 0 (no number) on a resource hex', () => {
    const m = sample();
    m.landHexes[0].diceNum = 0;
    expect(errors(validate(m))).toEqual([]);
  });

  it('flags a desert/water hex carrying a dice number', () => {
    const m = sample();
    m.landHexes[0].type = 'desert';
    m.landHexes[0].diceNum = 5;
    expect(messages(errors(validate(m)))).toContain(
      'landHexes[0] is desert but has diceNum 5; deserts and water must have no dice number',
    );
  });

  it('allows desert/water with diceNum 0', () => {
    const m = sample();
    // Replace a hex with a desert (diceNum 0); keep land-area counts consistent.
    m.landHexes[0] = { type: 'desert', coord: '0x0309', diceNum: 0, landArea: 1 };
    expect(errors(validate(m))).toEqual([]);
  });
});

describe('validate — land areas', () => {
  it('accepts an absent landAreas (implicit single area 1)', () => {
    const m = sample();
    m.landAreas = undefined;
    expect(errors(validate(m))).toEqual([]);
  });

  it('flags counts that do not sum to the hex count', () => {
    const m = sample();
    m.landAreas = [
      { area: 1, count: 8 },
      { area: 2, count: 3 }, // should be 4; total 11 != 12
    ];
    expect(messages(errors(validate(m)))).toContain(
      'landAreas counts sum to 11 but there are 12 landHexes',
    );
  });

  it('flags a missing area 1', () => {
    const m = sample();
    m.landAreas = [
      { area: 2, count: 8 },
      { area: 3, count: 4 },
    ];
    const msgs = messages(errors(validate(m)));
    expect(msgs).toContain("landAreas must include area 1 (players' starting land area)");
  });

  it('flags a non-contiguous area numbering (gap)', () => {
    const m = sample();
    m.landAreas = [
      { area: 1, count: 8 },
      { area: 3, count: 4 }, // area 2 missing -> not contiguous
    ];
    expect(messages(errors(validate(m)))).toContain(
      'landAreas numbers must be contiguous starting at 1; missing area 2',
    );
  });

  it('flags a duplicate area number', () => {
    const m = sample();
    m.landAreas = [
      { area: 1, count: 8 },
      { area: 1, count: 4 },
    ];
    expect(messages(errors(validate(m)))).toContain('duplicate land area number 1');
  });

  it('flags area < 1', () => {
    const m = sample();
    m.landAreas = [
      { area: 0, count: 8 },
      { area: 1, count: 4 },
    ];
    expect(messages(errors(validate(m)))).toContain('landAreas[0].area 0 must be >= 1');
  });

  it('flags count < 1', () => {
    const m = sample();
    m.landAreas = [
      { area: 1, count: 12 },
      { area: 2, count: 0 },
    ];
    expect(messages(errors(validate(m)))).toContain('landAreas[1].count 0 must be >= 1');
  });
});

describe('validate — robber / pirate', () => {
  it('accepts an absent robber/pirate', () => {
    const m = sample();
    m.robberHex = undefined;
    m.pirateHex = undefined;
    expect(errors(validate(m))).toEqual([]);
  });

  it('flags a robber hex that is not a declared land hex', () => {
    const m = sample();
    m.robberHex = '0x0101'; // not in landHexes
    expect(messages(errors(validate(m)))).toContain(
      "robberHex 0x101 isn't one of the declared land hexes",
    );
  });

  it('flags a pirate hex that is not a declared land hex', () => {
    const m = sample();
    m.pirateHex = '0x1515';
    expect(messages(errors(validate(m)))).toContain(
      "pirateHex 0x1515 isn't one of the declared land hexes",
    );
  });
});

describe('validate — ports', () => {
  it('flags an unknown port type', () => {
    const m = sample();
    m.ports![0].type = 'brick';
    expect(messages(errors(validate(m)))).toContain(
      'ports[0] unknown type "brick"; use misc/clay/ore/sheep/wheat/wood',
    );
  });

  it('accepts the "3:1" misc alias', () => {
    const m = sample();
    m.ports![0].type = '3:1';
    expect(errors(validate(m))).toEqual([]);
  });

  it('flags an unknown facing', () => {
    const m = sample();
    m.ports![0].facing = 'UP';
    expect(messages(errors(validate(m)))).toContain(
      'ports[0] unknown facing "UP"; use NE/E/SE/SW/W/NW',
    );
  });

  it('flags a duplicate port edge', () => {
    const m = sample();
    m.ports![1].edge = m.ports![0].edge; // 0x0807
    expect(messages(errors(validate(m)))).toContain('duplicate port edge 0x807 at ports[1]');
  });

  it('flags a facing geometrically invalid for the edge', () => {
    const m = sample();
    // ports[0] edge 0x0807 (row 8 even, "/" or "\"); SE/NW vs NE/SW depend on parity.
    // 0x0807: r=8, c=7; (c%2=1) !== ((r/2=4)%2=0) -> "/" edge -> must be NW or SE.
    // Set facing to E (invalid) and expect the NW-or-SE message.
    m.ports![0].facing = 'E';
    expect(messages(errors(validate(m)))).toContain(
      'ports[0] edge 0x807 facing should be NW or SE for this edge',
    );
  });

  it('flags a vertical "|" edge that does not face E/W', () => {
    const m = sample();
    // Use a known vertical edge (odd row). 0x0709 is a hex; an odd-row edge is "|".
    m.ports![0].edge = '0x0709';
    m.ports![0].facing = 'NE';
    const msgs = messages(errors(validate(m)));
    expect(msgs).toContain('ports[0] edge 0x709 facing should be E or W for this edge');
  });

  it('flags a port not facing a declared non-water land hex', () => {
    const m = sample();
    // Keep facing geometrically valid but point it at an undeclared hex.
    // Edge 0x0403 is a "/" edge (row 4 even, col 3); NW faces hex 0x0303, which
    // is not one of the sample's declared land hexes.
    m.ports![0].edge = '0x0403';
    m.ports![0].facing = 'NW';
    const msgs = messages(errors(validate(m)));
    expect(msgs.some((s) => /doesn't face a declared non-water land hex/.test(s))).toBe(true);
  });

  it('flags a port that faces a declared WATER hex (not a land hex)', () => {
    const m = sample();
    // Make hex 0x0309 water; the wood port at 0x060C / NW faces 0x050B... pick the
    // misc port[0] at 0x0807 SE -> faces 0x0908 (declared). Change 0x0908 to water.
    const faced = adjacentHexToEdge(0x0807, /* SE */ 3);
    const idx = m.landHexes.findIndex((h) => h.coord.toUpperCase().endsWith('0908'));
    expect(faced).toBe(0x0908);
    expect(idx).toBeGreaterThanOrEqual(0);
    m.landHexes[idx].type = 'water';
    m.landHexes[idx].diceNum = 0;
    const msgs = messages(errors(validate(m)));
    expect(msgs.some((s) => /doesn't face a declared non-water land hex/.test(s))).toBe(true);
  });

  it('accepts a map with no ports', () => {
    const m = sample();
    m.ports = undefined;
    expect(errors(validate(m))).toEqual([]);
  });
});

describe('validate — multiple errors collected at once', () => {
  it('returns every error, not just the first (unlike the Java first-throw)', () => {
    const m = sample();
    m.name = '';
    m.playerCounts = [5];
    m.landHexes[0].diceNum = 7;
    const errs = errors(validate(m));
    expect(errs.length).toBeGreaterThanOrEqual(3);
    const msgs = messages(errs);
    expect(msgs).toContain('missing required field "name"');
    expect(msgs).toContain('"playerCounts" entry 5 unsupported; must be 2, 3, 4, or 6');
    expect(msgs).toContain('landHexes[0].diceNum 7 out of range; must be 2..12 except 7');
  });
});

describe('warnings — heuristics the Java validator does NOT enforce', () => {
  it('warns (not errors) when land hexes are disconnected beyond the area count', () => {
    const m = sample();
    m.landAreas = undefined; // single implicit area -> 2 islands is 2 components > 1
    const issues = validate(m);
    expect(isValid(issues)).toBe(true); // still exports — warning only
    const warns = issues.filter((i) => i.severity === 'warning');
    expect(warns.length).toBeGreaterThanOrEqual(1);
    expect(warns[0].message).toMatch(/disconnected group/);
  });

  it('warns when a land area is not spatially contiguous', () => {
    const m = sample();
    // Move one hex of area 1 far away so area 1 splits into 2 groups.
    m.landHexes[0].coord = '0x1503'; // distant odd-row hex still in range
    // robber points at 0x0709 (still present), pirate at 0x0D0C (still present)
    const issues = validate(m);
    const warns = issues.filter((i) => i.severity === 'warning');
    expect(warns.some((w) => /not spatially contiguous/.test(w.message))).toBe(true);
    // It must remain valid (no errors) — contiguity is advisory.
    expect(isValid(issues)).toBe(true);
  });
});

describe('geometry helpers (ports of the Java private methods)', () => {
  it('adjacentHexToEdge matches the validator geometry for the sample ports', () => {
    // misc port edge 0x0807 facing SE(3) -> hex 0x0908 (a declared land hex).
    expect(adjacentHexToEdge(0x0807, 3)).toBe(0x0908);
    // wood port edge 0x060C facing NW(6) -> a declared hex on the main island.
    const woodFaced = adjacentHexToEdge(0x060c, 6);
    expect(woodFaced).not.toBe(0);
  });

  it('returns 0 when stepping off the validated coordinate range', () => {
    expect(adjacentHexToEdge(0x0101, 5 /* W */)).toBe(0); // c-1 -> 0, off range
  });

  it('facingForEdge inverts adjacentHexToEdge', () => {
    const f = facingForEdge(0x0807, 0x0908);
    expect(f).toBe(3); // SE
    expect(facingForEdge(0x0807, 0x1515)).toBeNull();
  });
});
