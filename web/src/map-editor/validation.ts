/**
 * Custom-map validation, mirroring the Java {@code soc.server.CustomMapValidator}
 * (`validateAndParse`) rule-for-rule so the web editor flags exactly what the
 * server would reject at load time — before the user ever exports the file.
 *
 * The Java validator throws a {@code CustomMapException} on the FIRST problem.
 * For an interactive editor we instead collect ALL issues so the user can see
 * everything at once. Each issue carries the same actionable message the Java
 * code produces (kept close to verbatim) plus a machine-usable `field`/`coord`
 * so the UI can jump to the offending element.
 *
 * SEVERITY:
 *  - "error"   — a rule the Java {@code CustomMapValidator} enforces; the server
 *                would reject the map. Exporting is unsafe.
 *  - "warning" — a heuristic the Java validator explicitly does NOT check
 *                (documented in its "What is NOT validated" javadoc and
 *                `doc/Custom-Maps.md`): land-hex/land-area connectivity, and the
 *                deeper port-coastline consistency that only runs at game start.
 *                These never block export but help authors build sane maps.
 *
 * Geometry helpers ({@link facingForEdge}, {@link adjacentHexToEdge}) are ports of
 * the corresponding private methods in the Java validator, kept independent of any
 * board instance exactly as the Java code does.
 */

import {
  type CustomMap,
  type MapLandHex,
  parseCoord,
  rowOf,
  colOf,
  HEX_TYPE_NAMES,
  PORT_TYPE_NAMES,
  FACING_NAMES,
  SUPPORTED_PLAYER_COUNTS,
} from './mapSchema';

/**
 * Maximum hex/edge row coordinate. The Java validator uses the 6-player fallback
 * board (height 0x16 = 22); valid coords are strictly inside it, so max row = 21.
 * ({@code CustomMapValidator.MAX_ROW}.)
 */
export const MAX_ROW = 21;

/**
 * Maximum hex/edge column coordinate. 6-player fallback width is 0x17 = 23; valid
 * coords are strictly inside it, so max col = 22. ({@code CustomMapValidator.MAX_COL}.)
 */
export const MAX_COL = 22;

/** Severity of a {@link ValidationIssue}. */
export type Severity = 'error' | 'warning';

/** One validation finding. */
export interface ValidationIssue {
  severity: Severity;
  /** Human-readable, actionable message (mirrors the Java exception text). */
  message: string;
  /**
   * Dotted path to the offending field, e.g. `"landHexes[3].diceNum"` or `"name"`,
   * when the problem is tied to a specific field.
   */
  field?: string;
  /** Integer 0xRRCC coordinate the problem refers to, when applicable. */
  coord?: number;
}

// --- Facing constants, matching soc.game.SOCBoard FACING_* (1..6). ----------
const FACING_NE = 1;
const FACING_E = 2;
const FACING_SE = 3;
const FACING_SW = 4;
const FACING_W = 5;
const FACING_NW = 6;

const FACING_BY_NAME: Readonly<Record<string, number>> = {
  NE: FACING_NE,
  E: FACING_E,
  SE: FACING_SE,
  SW: FACING_SW,
  W: FACING_W,
  NW: FACING_NW,
};

/** Hex-type names that have NO number slot (the Java DESERT_HEX / WATER_HEX cases). */
const NO_NUMBER_TYPES: ReadonlySet<string> = new Set(['desert', 'water']);

/**
 * Validate a custom map, returning every issue found (errors + warnings).
 * Mirrors {@code CustomMapValidator.validateAndParse}; see the file header for
 * the error-vs-warning policy. An empty result (or one with only warnings) means
 * the Java server would accept this map.
 *
 * @param map  the map to validate (coords are still `"0xRRCC"` strings)
 * @returns all validation issues; empty if fully valid with no warnings
 */
export function validate(map: CustomMap): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  validateName(map, issues);
  validateDescription(map, issues);
  validatePlayerCounts(map, issues);

  // Land hexes — also builds the coord sets the later checks reuse.
  const seenCoords = new Set<number>();
  const seenNonWaterCoords = new Set<number>();
  const nHex = validateLandHexes(map, issues, seenCoords, seenNonWaterCoords);

  validateLandAreas(map, issues, nHex);
  validateOptionalHex(map.robberHex, 'robberHex', seenCoords, issues);
  validateOptionalHex(map.pirateHex, 'pirateHex', seenCoords, issues);
  validatePorts(map, issues, seenNonWaterCoords);

  // Warnings: heuristics the Java validator documents as NOT checked.
  warnLandConnectivity(map, issues);
  warnLandAreaContiguity(map, issues);

  return issues;
}

// ---------------------------------------------------------------------------
// name / description / playerCounts
// ---------------------------------------------------------------------------

function validateName(map: CustomMap, issues: ValidationIssue[]): void {
  const name = (map.name ?? '').trim();
  if (name.length === 0) {
    issues.push({ severity: 'error', field: 'name', message: 'missing required field "name"' });
    return;
  }
  if (name.indexOf('|') >= 0 || name.indexOf(',') >= 0) {
    issues.push({
      severity: 'error',
      field: 'name',
      message: '"name" must not contain \'|\' or \',\' characters',
    });
  }
  if (hasControlChar(name)) {
    issues.push({
      severity: 'error',
      field: 'name',
      message: '"name" must not contain control, newline, or line/paragraph separator characters',
    });
  }
  validateSortRankPrefix(name, 'name', issues);
}

/**
 * Regex mirroring {@code SOCVersionedItem.REGEX_SORT_RANK_PREFIX} =
 * {@code "^(\\p{Nd}+) -|\\[(\\p{Nd}[^\\]]*)\\]"}. The {@code "n -"} alternative is
 * anchored at the start; the bracketed {@code "[n]"} alternative is NOT, so (like the
 * Java {@code Matcher.find()}) it can match anywhere in the string. The {@code /u}
 * flag makes {@code \p{Nd}} cover the same Unicode decimal digits Java does.
 */
const REGEX_SORT_RANK_PREFIX = /^(\p{Nd}+) -|\[(\p{Nd}[^\]]*)\]/u;

/**
 * Mirror {@code SOCVersionedItem.setDesc}'s sort-rank handling, which the live server
 * applies to the map name (as the scenario {@code desc}) in
 * {@code CustomMapLoader.loadAndRegisterOne}. The Java {@code CustomMapValidator}
 * never sees this, so the editor must replicate it directly to avoid a false-negative.
 *<P>
 * A leading {@code "n - "} or anywhere-matched {@code "[n] "} prefix is consumed as a
 * localization sort rank, so the registered scenario name differs from what was typed.
 * A malformed prefix (nothing after it, no required trailing space, or a non-numeric
 * bracketed value such as {@code "[5x]"}) makes {@code setDesc} throw
 * {@code IllegalArgumentException}, which {@code loadAndRegisterOne} turns into a
 * {@code CustomMapException} — the server SKIPS the map. We surface the malformed
 * cases as ERRORS (matching the order Java checks them) and the well-formed case as a
 * WARNING. Mirrors {@code SOCVersionedItem.setDesc} lines 244-269.
 */
function validateSortRankPrefix(name: string, field: string, issues: ValidationIssue[]): void {
  const m = REGEX_SORT_RANK_PREFIX.exec(name);
  if (m === null) {
    return; // no prefix; sortRank stays default (matches Java's else branch)
  }

  // rankValue from "n -" (group 1) or "[n]" (group 2), as in setDesc.
  const rankValue = m[1] !== undefined ? m[1] : m[2];
  const idxAfter = m.index + m[0].length;

  // Java checks "nothing after prefix", then "trailing space required", then parseInt.
  if (idxAfter >= name.length) {
    issues.push({
      severity: 'error',
      field,
      message:
        `"${field}" "${name}" starts a sort-rank prefix ("n - " or "[n] ") with nothing after it;` +
        ' the server rejects this and skips the map at load',
    });
    return; // <--- Early return: malformed; mirrors setDesc throwing ---
  }
  if (name.charAt(idxAfter) !== ' ') {
    issues.push({
      severity: 'error',
      field,
      message:
        `"${field}" "${name}" starts a sort-rank prefix ("n - " or "[n] ") but is missing the required` +
        ' trailing space; the server rejects this and skips the map at load',
    });
    return; // <--- Early return: malformed; mirrors setDesc throwing ---
  }
  // Integer.parseInt(rankValue): group 1 is all digits, but group 2 (from "[n...]")
  // can be "5x" etc. Java's parseInt accepts any Unicode decimal digits (\p{Nd}) via
  // Character.digit, and throws NumberFormatException on a non-digit or 32-bit overflow.
  if (!parsesAsJavaInt(rankValue)) {
    issues.push({
      severity: 'error',
      field,
      message:
        `"${field}" "${name}" has a malformed sort-rank prefix ("[${rankValue}]" is not a number);` +
        ' the server rejects this and skips the map at load',
    });
    return; // <--- Early return: parseInt would throw; mirrors setDesc ---
  }

  // Well-formed: the prefix IS consumed as a sort rank, so the displayed name changes.
  const displayed = name.substring(idxAfter + 1);
  issues.push({
    severity: 'warning',
    field,
    message:
      `"${field}" "${name}" begins with a sort-rank prefix ("n - " or "[n] "), which the server` +
      ` strips when registering the scenario; the displayed name will be "${displayed}"`,
  });
}

/**
 * True if {@code s} would parse via Java's {@code Integer.parseInt(s)} without throwing.
 * Java accepts any Unicode decimal digits ({@code \p{Nd}}) via {@code Character.digit} and
 * throws on a non-digit or 32-bit overflow. Used to mirror the {@code parseInt} step in
 * {@code SOCVersionedItem.setDesc}.
 *<P>
 * Any non-{@code \p{Nd}} character makes it fail. For pure-ASCII digit strings we also
 * apply the signed-32-bit overflow check (the realistic case). A string of non-ASCII
 * Unicode digits is treated as parseable (Java would parse it); JS has no built-in
 * digit-value mapping for every {@code Nd} block, and such a map name is implausible, so
 * we accept it rather than risk a false-positive error on an otherwise valid map.
 */
function parsesAsJavaInt(s: string): boolean {
  if (s.length === 0) {
    return false;
  }
  // Reject any character that is not a Unicode decimal digit.
  for (const ch of s) {
    if (!/^\p{Nd}$/u.test(ch)) {
      return false;
    }
  }
  // For ASCII digits, enforce Java's signed 32-bit int range (0 .. 2147483647).
  if (/^[0-9]+$/.test(s)) {
    const v = Number.parseInt(s, 10);
    return Number.isFinite(v) && v <= 2147483647;
  }
  // All-Unicode-digit (non-ASCII) value: Java's parseInt would accept it.
  return true;
}

function validateDescription(map: CustomMap, issues: ValidationIssue[]): void {
  if (map.description === undefined || map.description === null) {
    return;
  }
  const description = map.description.trim();
  if (description.indexOf('|') >= 0) {
    issues.push({
      severity: 'error',
      field: 'description',
      message: '"description" must not contain \'|\' characters',
    });
  }
  if (hasControlChar(description)) {
    issues.push({
      severity: 'error',
      field: 'description',
      message:
        '"description" must not contain control, newline, or line/paragraph separator characters',
    });
  }
}

function validatePlayerCounts(map: CustomMap, issues: ValidationIssue[]): void {
  if (!map.playerCounts || map.playerCounts.length === 0) {
    issues.push({
      severity: 'error',
      field: 'playerCounts',
      message: 'missing required field "playerCounts"',
    });
    return;
  }
  for (const pc of map.playerCounts) {
    if (!SUPPORTED_PLAYER_COUNTS.includes(pc)) {
      issues.push({
        severity: 'error',
        field: 'playerCounts',
        message: `"playerCounts" entry ${pc} unsupported; must be 2, 3, 4, or 6`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// land hexes
// ---------------------------------------------------------------------------

/**
 * Validate `landHexes`, filling `seenCoords` and `seenNonWaterCoords` (the latter
 * for the ports' faces-land check). Returns the number of land hexes, used by the
 * land-area count check.
 */
function validateLandHexes(
  map: CustomMap,
  issues: ValidationIssue[],
  seenCoords: Set<number>,
  seenNonWaterCoords: Set<number>,
): number {
  const hexes = map.landHexes ?? [];
  if (hexes.length === 0) {
    issues.push({
      severity: 'error',
      field: 'landHexes',
      message: 'missing required field "landHexes"',
    });
    return 0;
  }

  for (let i = 0; i < hexes.length; ++i) {
    const h = hexes[i];
    const base = `landHexes[${i}]`;
    if (h === null || h === undefined) {
      issues.push({ severity: 'error', field: base, message: `${base} is null` });
      continue;
    }

    const typeName = parseHexType(h.type, i, issues);
    const coord = parseCoordChecked(h.coord, `${base}.coord`, issues);

    if (coord !== null) {
      checkHexCoordInRange(coord, `${base}.coord`, issues);
      if (!seenCoords.has(coord)) {
        seenCoords.add(coord);
        if (typeName !== null && typeName !== 'water') {
          seenNonWaterCoords.add(coord);
        }
      } else {
        issues.push({
          severity: 'error',
          field: base,
          coord,
          message: `duplicate hex coordinate 0x${coord.toString(16)} at ${base}`,
        });
      }
    }

    validateHexDiceNum(h, typeName, i, issues);
  }

  return hexes.length;
}

/**
 * Mirror the Java dice-number branch: resource hexes accept 0 (no number) or
 * 2..12 except 7; desert/water must have diceNum 0.
 */
function validateHexDiceNum(
  h: MapLandHex,
  typeName: string | null,
  i: number,
  issues: ValidationIssue[],
): void {
  // The Java code keys off the parsed type; mirror only when the type is recognized.
  if (typeName === null) {
    return;
  }
  const hasNumberSlot = !NO_NUMBER_TYPES.has(typeName);
  const dice = h.diceNum ?? 0;

  if (hasNumberSlot) {
    if (dice !== 0) {
      if (dice < 2 || dice > 12 || dice === 7) {
        issues.push({
          severity: 'error',
          field: `landHexes[${i}].diceNum`,
          message: `landHexes[${i}].diceNum ${dice} out of range; must be 2..12 except 7`,
        });
      }
    }
  } else if (dice !== 0) {
    issues.push({
      severity: 'error',
      field: `landHexes[${i}].diceNum`,
      message: `landHexes[${i}] is ${h.type} but has diceNum ${dice}; deserts and water must have no dice number`,
    });
  }
}

// ---------------------------------------------------------------------------
// land areas
// ---------------------------------------------------------------------------

/**
 * Mirror the Java land-area block: if `landAreas` is absent, the implicit single
 * area 1 covers all hexes (no checks). Otherwise validate area numbers (>=1,
 * unique), counts (>=1), that counts sum to the hex count, that area 1 is present,
 * and that area numbers are contiguous 1..maxArea.
 */
function validateLandAreas(map: CustomMap, issues: ValidationIssue[], nHex: number): void {
  const areas = map.landAreas;
  if (!areas || areas.length === 0) {
    return; // implicit single land area 1; nothing to check (matches Java)
  }

  const seenAreas = new Set<number>();
  let total = 0;
  let maxA = 0;

  for (let i = 0; i < areas.length; ++i) {
    const la = areas[i];
    const base = `landAreas[${i}]`;
    if (la === null || la === undefined) {
      issues.push({ severity: 'error', field: base, message: `${base} is null` });
      continue;
    }
    if (!Number.isFinite(la.area) || la.area < 1) {
      issues.push({
        severity: 'error',
        field: `${base}.area`,
        message: `${base}.area ${la.area} must be >= 1`,
      });
    } else if (seenAreas.has(la.area)) {
      issues.push({
        severity: 'error',
        field: `${base}.area`,
        message: `duplicate land area number ${la.area}`,
      });
    } else {
      seenAreas.add(la.area);
      if (la.area > maxA) {
        maxA = la.area;
      }
    }
    if (!Number.isFinite(la.count) || la.count < 1) {
      issues.push({
        severity: 'error',
        field: `${base}.count`,
        message: `${base}.count ${la.count} must be >= 1`,
      });
    } else {
      total += la.count;
    }
  }

  if (total !== nHex) {
    issues.push({
      severity: 'error',
      field: 'landAreas',
      message: `landAreas counts sum to ${total} but there are ${nHex} landHexes`,
    });
  }
  if (!seenAreas.has(1)) {
    issues.push({
      severity: 'error',
      field: 'landAreas',
      message: "landAreas must include area 1 (players' starting land area)",
    });
  }
  // Area numbers must be contiguous 1..maxA, or board generation fails at start.
  for (let a = 1; a <= maxA; ++a) {
    if (!seenAreas.has(a)) {
      issues.push({
        severity: 'error',
        field: 'landAreas',
        message: `landAreas numbers must be contiguous starting at 1; missing area ${a}`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// robber / pirate
// ---------------------------------------------------------------------------

/**
 * Mirror {@code parseOptionalDeclaredHex}: an absent robber/pirate is fine; if
 * present it must parse and name one of the declared land hexes.
 */
function validateOptionalHex(
  s: string | undefined,
  field: string,
  declaredCoords: Set<number>,
  issues: ValidationIssue[],
): void {
  if (s === undefined || s === null || s.trim().length === 0) {
    return; // optional field absent
  }
  const coord = parseCoordChecked(s, field, issues);
  if (coord === null) {
    return;
  }
  if (!declaredCoords.has(coord)) {
    issues.push({
      severity: 'error',
      field,
      coord,
      message: `${field} 0x${coord.toString(16)} isn't one of the declared land hexes`,
    });
  }
}

// ---------------------------------------------------------------------------
// ports
// ---------------------------------------------------------------------------

function validatePorts(
  map: CustomMap,
  issues: ValidationIssue[],
  seenNonWaterCoords: Set<number>,
): void {
  const ports = map.ports;
  if (!ports || ports.length === 0) {
    return;
  }

  const seenEdges = new Set<number>();
  for (let i = 0; i < ports.length; ++i) {
    const p = ports[i];
    const base = `ports[${i}]`;
    if (p === null || p === undefined) {
      issues.push({ severity: 'error', field: base, message: `${base} is null` });
      continue;
    }

    parsePortType(p.type, i, issues);
    const edge = parseCoordChecked(p.edge, `${base}.edge`, issues);
    const facing = parseFacing(p.facing, i, issues);

    if (edge === null) {
      continue;
    }
    checkEdgeCoordInRange(edge, `${base}.edge`, issues);
    if (seenEdges.has(edge)) {
      issues.push({
        severity: 'error',
        field: base,
        coord: edge,
        message: `duplicate port edge 0x${edge.toString(16)} at ${base}`,
      });
    } else {
      seenEdges.add(edge);
    }

    if (facing === null) {
      continue;
    }
    const geomOk = checkPortFacingGeometry(edge, facing, i, issues);
    // Java runs the faces-land check after the geometry check; it computes the
    // adjacent hex regardless, but a perpendicular facing yields no useful hex.
    if (geomOk) {
      checkPortFacesLand(edge, facing, seenNonWaterCoords, i, issues);
    }
  }
}

/**
 * Mirror {@code checkPortFacingGeometry}: `|` edges face E/W, `/` edges face
 * NW/SE, `\` edges face NE/SW. Returns true if the facing is valid for the edge.
 */
function checkPortFacingGeometry(
  edge: number,
  facing: number,
  idx: number,
  issues: ValidationIssue[],
): boolean {
  const r = rowOf(edge);
  const c = colOf(edge);
  let err: string | null = null;

  if (r % 2 === 1) {
    // "|" vertical edge
    if (facing !== FACING_E && facing !== FACING_W) {
      err = 'E or W';
    }
  } else if (c % 2 !== Math.floor(r / 2) % 2) {
    // "/" edge
    if (facing !== FACING_NW && facing !== FACING_SE) {
      err = 'NW or SE';
    }
  } else {
    // "\" edge
    if (facing !== FACING_NE && facing !== FACING_SW) {
      err = 'NE or SW';
    }
  }

  if (err !== null) {
    issues.push({
      severity: 'error',
      field: `ports[${idx}].facing`,
      coord: edge,
      message: `ports[${idx}] edge 0x${edge.toString(16)} facing should be ${err} for this edge`,
    });
    return false;
  }
  return true;
}

/**
 * Mirror {@code checkPortFacesLand}: the hex in the facing direction (per
 * {@link adjacentHexToEdge}) must be one of the declared non-water land hexes.
 */
function checkPortFacesLand(
  edge: number,
  facing: number,
  declaredNonWaterCoords: Set<number>,
  idx: number,
  issues: ValidationIssue[],
): void {
  const landHex = adjacentHexToEdge(edge, facing);
  if (landHex === 0 || !declaredNonWaterCoords.has(landHex)) {
    issues.push({
      severity: 'error',
      field: `ports[${idx}]`,
      coord: edge,
      message:
        `ports[${idx}] edge 0x${edge.toString(16)} facing ${facing} doesn't face a declared non-water land hex` +
        ` (computed hex 0x${landHex.toString(16)})`,
    });
  }
}

/**
 * Compute the hex coordinate adjacent to an edge in a facing direction. A direct
 * port of {@code CustomMapValidator.adjacentHexToEdge} (itself a standalone copy of
 * {@code SOCBoardLarge.getAdjacentHexToEdge}). Returns 0 if off the validated range.
 */
export function adjacentHexToEdge(edgeCoord: number, facing: number): number {
  let r = rowOf(edgeCoord);
  let c = colOf(edgeCoord);

  if (r % 2 === 1) {
    // "|" vertical edge
    switch (facing) {
      case FACING_E:
        ++c;
        break;
      case FACING_W:
        --c;
        break;
      case FACING_NE:
      case FACING_NW:
        r = r - 2;
        break;
      case FACING_SE:
      case FACING_SW:
        r = r + 2;
        break;
      default:
        break;
    }
  } else if (c % 2 !== Math.floor(r / 2) % 2) {
    // "/" edge
    switch (facing) {
      case FACING_NW:
        --r;
        break;
      case FACING_SE:
        ++r;
        ++c;
        break;
      case FACING_NE:
      case FACING_E:
        --r;
        c = c + 2;
        break;
      case FACING_SW:
      case FACING_W:
        ++r;
        --c;
        break;
      default:
        break;
    }
  } else {
    // "\" edge
    switch (facing) {
      case FACING_NE:
        --r;
        ++c;
        break;
      case FACING_SW:
        ++r;
        break;
      case FACING_E:
      case FACING_SE:
        ++r;
        c = c + 2;
        break;
      case FACING_W:
      case FACING_NW:
        --r;
        --c;
        break;
      default:
        break;
    }
  }

  if (r > 0 && c > 0 && r <= MAX_ROW && c <= MAX_COL) {
    return ((r << 8) | c) & 0xffff;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// coordinate range / parity checks
// ---------------------------------------------------------------------------

/**
 * Mirror {@code checkHexCoordInRange}: rows 1..MAX_ROW, cols 1..MAX_COL, and the
 * hex must be on an odd row.
 */
function checkHexCoordInRange(coord: number, field: string, issues: ValidationIssue[]): void {
  const r = rowOf(coord);
  const c = colOf(coord);
  if (r < 1 || r > MAX_ROW || c < 1 || c > MAX_COL) {
    issues.push({
      severity: 'error',
      field,
      coord,
      message: `${field} 0x${coord.toString(16)} is out of board range (row 1..${MAX_ROW}, col 1..${MAX_COL})`,
    });
    return;
  }
  if (r % 2 === 0) {
    issues.push({
      severity: 'error',
      field,
      coord,
      message: `${field} 0x${coord.toString(16)} is on an even row; land hexes must be on odd rows`,
    });
  }
}

/**
 * Mirror {@code checkEdgeCoordInRange}: rows 0..MAX_ROW, cols 0..MAX_COL (edges
 * can be on even or odd rows, so no parity check here).
 */
function checkEdgeCoordInRange(coord: number, field: string, issues: ValidationIssue[]): void {
  const r = rowOf(coord);
  const c = colOf(coord);
  if (r < 0 || r > MAX_ROW || c < 0 || c > MAX_COL) {
    issues.push({
      severity: 'error',
      field,
      coord,
      message: `${field} 0x${coord.toString(16)} is out of board range (row 0..${MAX_ROW}, col 0..${MAX_COL})`,
    });
  }
}

// ---------------------------------------------------------------------------
// token parsers (push the same errors Java throws, return null on failure)
// ---------------------------------------------------------------------------

/** Mirror {@code parseHexType}: return the lowercased recognized type name or null. */
function parseHexType(typeName: string, idx: number, issues: ValidationIssue[]): string | null {
  if (typeName === null || typeName === undefined || typeName === '') {
    issues.push({
      severity: 'error',
      field: `landHexes[${idx}].type`,
      message: `landHexes[${idx}] missing "type"`,
    });
    return null;
  }
  const lc = typeName.toLowerCase();
  if ((HEX_TYPE_NAMES as readonly string[]).includes(lc)) {
    return lc;
  }
  issues.push({
    severity: 'error',
    field: `landHexes[${idx}].type`,
    message: `landHexes[${idx}] unknown type "${typeName}"; use clay/ore/sheep/wheat/wood/desert/gold/water`,
  });
  return null;
}

/** Mirror {@code parsePortType}: validate the port type ("misc"/"3:1"/resources). */
function parsePortType(typeName: string, idx: number, issues: ValidationIssue[]): string | null {
  if (typeName === null || typeName === undefined || typeName === '') {
    issues.push({
      severity: 'error',
      field: `ports[${idx}].type`,
      message: `ports[${idx}] missing "type"`,
    });
    return null;
  }
  const lc = typeName.toLowerCase();
  if ((PORT_TYPE_NAMES as readonly string[]).includes(lc)) {
    return lc;
  }
  issues.push({
    severity: 'error',
    field: `ports[${idx}].type`,
    message: `ports[${idx}] unknown type "${typeName}"; use misc/clay/ore/sheep/wheat/wood`,
  });
  return null;
}

/** Mirror {@code parseFacing}: validate the facing name, returning its 1..6 code or null. */
function parseFacing(facingName: string, idx: number, issues: ValidationIssue[]): number | null {
  if (facingName === null || facingName === undefined || facingName === '') {
    issues.push({
      severity: 'error',
      field: `ports[${idx}].facing`,
      message: `ports[${idx}] missing "facing"`,
    });
    return null;
  }
  const uc = facingName.toUpperCase();
  if ((FACING_NAMES as readonly string[]).includes(uc)) {
    return FACING_BY_NAME[uc];
  }
  issues.push({
    severity: 'error',
    field: `ports[${idx}].facing`,
    message: `ports[${idx}] unknown facing "${facingName}"; use NE/E/SE/SW/W/NW`,
  });
  return null;
}

/**
 * Parse a coord string, pushing the Java {@code parseCoord} errors on failure.
 * Faithfully replicates the Java two-branch behavior of {@code Integer.parseInt(t, 16)}
 * after stripping an optional `0x`/`0X` prefix (only when the first char is `'0'`):
 *  - blank/null            -> `missing coordinate "<field>"`
 *  - parses to a negative  -> `<field> "<s>" must not be negative`  (e.g. bare `"-10"`)
 *  - otherwise unparseable -> `<field> "<s>" isn't a valid hex coordinate (...)`
 *    (e.g. `"-0x10"`, where the `0x` is NOT stripped, so the whole token is non-hex)
 * Returns the int coord or null.
 */
function parseCoordChecked(
  s: string,
  field: string,
  issues: ValidationIssue[],
): number | null {
  if (s === null || s === undefined || s.trim().length === 0) {
    issues.push({ severity: 'error', field, message: `missing coordinate "${field}"` });
    return null;
  }

  // Strip the 0x/0X prefix exactly as Java does (only when t starts with '0').
  let t = s.trim();
  if (t.length > 2 && t.charAt(0) === '0' && (t.charAt(1) === 'x' || t.charAt(1) === 'X')) {
    t = t.slice(2);
  }

  // Integer.parseInt(t, 16): a leading sign is allowed, then pure hex digits.
  if (!/^[+-]?[0-9a-fA-F]+$/.test(t)) {
    issues.push({
      severity: 'error',
      field,
      message: `${field} "${s}" isn't a valid hex coordinate (example: "0x0504")`,
    });
    return null;
  }
  const v = Number.parseInt(t, 16);
  if (v < 0) {
    issues.push({
      severity: 'error',
      field,
      message: `${field} "${s}" must not be negative`,
    });
    return null;
  }
  return v;
}

/**
 * Reject characters the server's {@code SOCMessage.isSingleLineAndSafe} gate rejects.
 * This is strictly broader than the Java {@code CustomMapValidator.hasControlChar}
 * (which only checks {@code Character.isISOControl}), and intentionally so: the live
 * load path is {@code CustomMapLoader.loadAndRegisterOne}, which feeds the map name
 * into {@code SOCScenario}'s {@code desc} (via {@code SOCVersionedItem.setDesc} →
 * {@code isSingleLineAndSafe(desc)}) and the description into its {@code longDesc}
 * (via {@code isSingleLineAndSafe(longDesc, true)}). {@code isSingleLineAndSafe} also
 * rejects {@code Character.isSpaceChar(c) && getType(c) != SPACE_SEPARATOR}, i.e. the
 * only such code points not already ISO-control: U+2028 LINE SEPARATOR (Zl) and
 * U+2029 PARAGRAPH SEPARATOR (Zp). So a name/description containing those would pass
 * {@code CustomMapValidator} but be SKIPPED by the running server at registration —
 * matching them here keeps the editor's "exactly what the server would reject at load
 * time" guarantee.
 */
function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; ++i) {
    const code = s.charCodeAt(i);
    // ISO control: U+0000..U+001F or U+007F..U+009F (matches Character.isISOControl).
    if ((code >= 0x00 && code <= 0x1f) || (code >= 0x7f && code <= 0x9f)) {
      return true;
    }
    // SOCMessage.isSingleLineAndSafe also rejects non-SPACE_SEPARATOR space chars:
    // U+2028 LINE SEPARATOR and U+2029 PARAGRAPH SEPARATOR.
    if (code === 0x2028 || code === 0x2029) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// WARNINGS — heuristics the Java validator documents as NOT validated
// ---------------------------------------------------------------------------

/**
 * Build adjacency between two land hexes. Two large-board hexes are neighbors
 * when one is reachable from the other by a hex-to-hex step. On the 0xRRCC grid a
 * hex's 6 neighbors are at (r, c±2), (r±2, c±1). (Derived from SOCBoardLarge hex
 * geometry — hexes sit two columns apart in a row, and a row up/down shifts the
 * column by one. Used only for the connectivity WARNING.)
 */
function hexNeighbors(coord: number): number[] {
  const r = rowOf(coord);
  const c = colOf(coord);
  return [
    coordOfRC(r, c - 2),
    coordOfRC(r, c + 2),
    coordOfRC(r - 2, c - 1),
    coordOfRC(r - 2, c + 1),
    coordOfRC(r + 2, c - 1),
    coordOfRC(r + 2, c + 1),
  ];
}

function coordOfRC(row: number, col: number): number {
  return ((row << 8) | col) & 0xffff;
}

/**
 * WARNING: the Java validator does NOT check that land hexes form connected
 * islands. We surface a single warning if the non-water hexes split into more
 * connected components than there are land areas — a strong hint of a typo'd
 * coordinate (since each land area is meant to be its own island).
 */
function warnLandConnectivity(map: CustomMap, issues: ValidationIssue[]): void {
  const coords: number[] = [];
  for (const h of map.landHexes ?? []) {
    if (!h || (h.type ?? '').toLowerCase() === 'water') {
      continue;
    }
    const v = parseCoord(h.coord);
    if (v !== null) {
      coords.push(v);
    }
  }
  if (coords.length < 2) {
    return;
  }

  const components = countComponents(coords);
  const nAreas =
    map.landAreas && map.landAreas.length > 0 ? map.landAreas.length : 1;
  if (components > nAreas) {
    issues.push({
      severity: 'warning',
      field: 'landHexes',
      message:
        `land hexes form ${components} disconnected group(s) but there are ${nAreas} land area(s);` +
        ' check for a mistyped coordinate (connectivity is not enforced by the server)',
    });
  }
}

/**
 * WARNING: the Java validator does NOT check that each land area's hexes are
 * spatially contiguous. We flag any area whose hexes (consumed in file order, per
 * the land-area `count` ranges) split into more than one connected component.
 */
function warnLandAreaContiguity(map: CustomMap, issues: ValidationIssue[]): void {
  const areas = map.landAreas;
  if (!areas || areas.length === 0) {
    return; // single implicit area; connectivity handled by warnLandConnectivity
  }
  // Only meaningful if counts line up with the hexes; if not, the error path
  // already reported it, so skip to avoid noisy/incorrect range slicing.
  let total = 0;
  for (const a of areas) {
    total += Number.isFinite(a.count) ? a.count : 0;
  }
  const hexes = map.landHexes ?? [];
  if (total !== hexes.length) {
    return;
  }

  let start = 0;
  for (const a of areas) {
    const slice = hexes.slice(start, start + a.count);
    start += a.count;
    const coords: number[] = [];
    for (const h of slice) {
      if (!h || (h.type ?? '').toLowerCase() === 'water') {
        continue;
      }
      const v = parseCoord(h.coord);
      if (v !== null) {
        coords.push(v);
      }
    }
    if (coords.length >= 2 && countComponents(coords) > 1) {
      issues.push({
        severity: 'warning',
        field: 'landAreas',
        message:
          `land area ${a.area} is not spatially contiguous (its hexes split into` +
          ` ${countComponents(coords)} groups); contiguity is not enforced by the server`,
      });
    }
  }
}

/** Count connected components of a hex-coordinate set using {@link hexNeighbors}. */
function countComponents(coords: number[]): number {
  const set = new Set(coords);
  const visited = new Set<number>();
  let components = 0;
  for (const start of coords) {
    if (visited.has(start)) {
      continue;
    }
    components += 1;
    const stack = [start];
    visited.add(start);
    while (stack.length > 0) {
      const cur = stack.pop() as number;
      for (const nb of hexNeighbors(cur)) {
        if (set.has(nb) && !visited.has(nb)) {
          visited.add(nb);
          stack.push(nb);
        }
      }
    }
  }
  return components;
}

/**
 * Compute the FACING_* code (1..6) that a port on `edge` would need to point at
 * `hex`, or null if `hex` isn't adjacent to `edge` in any facing. Convenience for
 * editor tooling (e.g. auto-filling a port's facing). Not part of the Java rules.
 */
export function facingForEdge(edge: number, hex: number): number | null {
  for (const f of [FACING_NE, FACING_E, FACING_SE, FACING_SW, FACING_W, FACING_NW]) {
    if (adjacentHexToEdge(edge, f) === hex) {
      return f;
    }
  }
  return null;
}

/** True if the map has no error-severity issues (warnings are allowed). */
export function isValid(issues: ValidationIssue[]): boolean {
  return !issues.some((it) => it.severity === 'error');
}
