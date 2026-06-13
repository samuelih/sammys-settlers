/**
 * Typed model + (de)serialization for the JSettlers custom-map `.map.json`
 * document, mirroring the Java {@code soc.server.CustomMapLoader} schema
 * (its inner `CustomMapJson`/`HexJson`/`PortJson`/`LandAreaJson` classes) and
 * the field documentation in `doc/Custom-Maps.md`.
 *
 * The Java loader deserializes the raw JSON with GSON into integer-keyless POJOs,
 * then {@code CustomMapValidator.validateAndParse} parses the `"0xRRCC"` coord
 * strings into ints. We keep the same two-layer shape:
 *   - {@link CustomMap} is the parsed-but-still-editor-friendly model: coords stay
 *     as strings exactly as they appear on disk, so a round-trip is lossless.
 *   - {@link parseCoord} / {@link encodeCoord} convert the `"0xRRCC"` strings to/from
 *     the integer `(row << 8) | col` form used by the validator and board renderer.
 *
 * No coordinate range/parity/business validation lives here — that is entirely in
 * `validation.ts` (which mirrors `CustomMapValidator`). This module only handles
 * JSON <-> typed model and the hex-string coordinate codec.
 */

/** Hex resource-type names accepted by the Java loader (case-insensitive there). */
export type HexTypeName =
  | 'clay'
  | 'ore'
  | 'sheep'
  | 'wheat'
  | 'wood'
  | 'desert'
  | 'gold'
  | 'water';

/** The recognized hex-type names, in the order the Java {@code parseHexType} lists them. */
export const HEX_TYPE_NAMES: readonly HexTypeName[] = [
  'clay',
  'ore',
  'sheep',
  'wheat',
  'wood',
  'desert',
  'gold',
  'water',
];

/**
 * Port-type names accepted by the Java loader. Note {@code "3:1"} is an accepted
 * alias for {@code "misc"} (both map to MISC_PORT); we keep it as a distinct token
 * so a round-trip preserves whatever the author wrote.
 */
export type PortTypeName = 'misc' | '3:1' | 'clay' | 'ore' | 'sheep' | 'wheat' | 'wood';

/** The recognized port-type names, in the order the Java {@code parsePortType} lists them. */
export const PORT_TYPE_NAMES: readonly PortTypeName[] = [
  'misc',
  '3:1',
  'clay',
  'ore',
  'sheep',
  'wheat',
  'wood',
];

/** Port facing-direction names accepted by the Java loader. */
export type FacingName = 'NE' | 'E' | 'SE' | 'SW' | 'W' | 'NW';

/** The recognized facing names, in the order the Java {@code parseFacing} lists them. */
export const FACING_NAMES: readonly FacingName[] = ['NE', 'E', 'SE', 'SW', 'W', 'NW'];

/** Player counts the Java loader supports (`{2, 3, 4, 6}`). */
export const SUPPORTED_PLAYER_COUNTS: readonly number[] = [2, 3, 4, 6];

/** Legacy/default custom-map board height used by the Java loader (6-player fallback board). */
export const DEFAULT_BOARD_HEIGHT = 0x16;

/** Legacy/default custom-map board width used by the Java loader (6-player fallback board). */
export const DEFAULT_BOARD_WIDTH = 0x17;

/** Compact starter size for new maps in the editor. Existing/imported maps keep their own size. */
export const EDITOR_DEFAULT_BOARD_HEIGHT = 0x10;
export const EDITOR_DEFAULT_BOARD_WIDTH = 0x11;

/** Supported custom board-size range. Coordinates must stay strictly inside these bounds. */
export const MIN_BOARD_HEIGHT = 0x08;
export const MIN_BOARD_WIDTH = 0x09;
export const MAX_BOARD_HEIGHT = DEFAULT_BOARD_HEIGHT;
export const MAX_BOARD_WIDTH = DEFAULT_BOARD_WIDTH;

/**
 * One land (or water) hex. Matches {@code CustomMapLoader.HexJson}.
 * `coord` is kept as the on-disk `"0xRRCC"` string; use {@link parseCoord} for the int.
 */
export interface MapLandHex {
  /** Resource type, e.g. `"clay"`. The Java loader lowercases before matching. */
  type: string;
  /** Hex coordinate as a `"0xRRCC"` string (the `0x` prefix is optional on disk). */
  coord: string;
  /** Dice number 2..12 (not 7); 0/absent for none. Deserts/water must be 0. */
  diceNum: number;
  /**
   * Informational land-area number (not cross-checked by the Java validator; the
   * authoritative assignment comes from {@link CustomMap.landAreas}). Optional.
   */
  landArea?: number;
}

/** One trade port. Matches {@code CustomMapLoader.PortJson}. */
export interface MapPort {
  /** Port type, e.g. `"misc"`/`"3:1"`/`"wheat"`. */
  type: string;
  /** Edge coordinate as a `"0xRRCC"` string. */
  edge: string;
  /** Facing direction toward land: `NE`/`E`/`SE`/`SW`/`W`/`NW`. */
  facing: string;
}

/**
 * One land-area definition: a run of consecutive {@link MapLandHex} entries (in
 * file order) belonging to a land area. Matches {@code CustomMapLoader.LandAreaJson}.
 */
export interface MapLandArea {
  /** Land-area number (>= 1, unique within the map). Area 1 must be present. */
  area: number;
  /** Count of consecutive `landHexes` (file order) in this area. */
  count: number;
}

/**
 * A complete custom-map document. Matches {@code CustomMapLoader.CustomMapJson}.
 * Coordinates remain strings here so import → edit → export is lossless.
 */
export interface CustomMap {
  /** Display name (required). */
  name: string;
  /** Optional longer description. */
  description?: string;
  /** Supported max-player counts, e.g. `[3, 4]` (required, non-empty). */
  playerCounts: number[];
  /** If true, the server shuffles hex types + dice numbers each game. */
  shuffle: boolean;
  /** Optional board height in large-board coordinate units; absent = default 0x16. */
  boardHeight?: number;
  /** Optional board width in large-board coordinate units; absent = default 0x17. */
  boardWidth?: number;
  /** Land (and any water) hexes (required, non-empty). */
  landHexes: MapLandHex[];
  /** Land-area definitions; if absent, all hexes are land area 1. */
  landAreas?: MapLandArea[];
  /** Trade ports (optional). */
  ports?: MapPort[];
  /** Optional robber start hex coord string. */
  robberHex?: string;
  /** Optional pirate start hex coord string. */
  pirateHex?: string;
}

/**
 * Return a copy whose per-hex `landArea` hints reflect the authoritative
 * `landAreas` ranges. Useful immediately after import because the server ignores
 * stale/missing per-hex hints and consumes `landAreas` by file order.
 *
 * @param map  imported or edited map
 * @returns a map with hex `landArea` tags inferred from `landAreas` when present
 */
export function mapWithInferredLandAreas(map: CustomMap): CustomMap {
  if (!map.landAreas || map.landAreas.length === 0) {
    return map;
  }

  const hexes = [...(map.landHexes ?? [])];
  let start = 0;
  for (const area of map.landAreas) {
    const count = Number.isFinite(area.count) ? Math.max(0, Math.floor(area.count)) : 0;
    for (let i = start; i < Math.min(hexes.length, start + count); ++i) {
      hexes[i] = { ...hexes[i], landArea: area.area };
    }
    start += count;
  }
  return { ...map, landHexes: hexes };
}

/**
 * Canonicalize land-area intent before validation/export:
 *   - positive integer per-hex `landArea` tags are treated as the user's intent;
 *   - hexes are grouped by area in ascending order, preserving order within an area;
 *   - `landAreas` ranges are rebuilt from those groups.
 *
 * If a map has no area tags and no `landAreas`, it is left as a single implicit
 * area 1. This keeps tiny one-island maps concise while making multi-island maps
 * server-authoritative instead of merely decorative.
 *
 * @param map  editor model
 * @returns canonical map ready for validation or serialization
 */
export function mapWithCanonicalLandAreas(map: CustomMap): CustomMap {
  const hexes = map.landHexes ?? [];
  if (hexes.length === 0) {
    const next: CustomMap = { ...map, landHexes: [] };
    delete next.landAreas;
    return next;
  }

  const areaByIndex = inferAreaByHexIndex(map);
  const hasExplicitArea =
    areaByIndex.some((area) => area !== 1) ||
    hexes.some((hex) => isPositiveInteger(hex.landArea)) ||
    (map.landAreas !== undefined && map.landAreas.length > 0);

  if (!hasExplicitArea) {
    const next: CustomMap = { ...map, landHexes: [...hexes] };
    delete next.landAreas;
    return next;
  }

  const entries = hexes.map((hex, index) => ({ hex, index, area: areaByIndex[index] }));
  entries.sort((a, b) => (a.area === b.area ? a.index - b.index : a.area - b.area));

  const nextHexes = entries.map(({ hex, area }) => ({ ...hex, landArea: area }));
  const nextAreas: MapLandArea[] = [];
  for (const entry of entries) {
    const last = nextAreas[nextAreas.length - 1];
    if (last && last.area === entry.area) {
      last.count += 1;
    } else {
      nextAreas.push({ area: entry.area, count: 1 });
    }
  }

  const next: CustomMap = { ...map, landHexes: nextHexes };
  if (nextAreas.length > 1 || nextAreas[0]?.area !== 1) {
    next.landAreas = nextAreas;
  } else {
    delete next.landAreas;
  }
  return next;
}

/**
 * Decode a `"0xRRCC"` coordinate string into its integer `(row << 8) | col` form,
 * mirroring the Java {@code CustomMapValidator.parseCoord}: an optional `0x`/`0X`
 * prefix is stripped and the rest is read as hexadecimal. Returns null when the
 * string is null/blank or not valid hex (validation reports that as an error;
 * this codec stays non-throwing so callers can probe).
 *
 * @param s  coordinate string such as `"0x0309"` or `"0309"`
 * @returns the integer coord, or null if unparseable
 */
export function parseCoord(s: string | null | undefined): number | null {
  if (s === null || s === undefined) {
    return null;
  }
  let t = s.trim();
  if (t.length === 0) {
    return null;
  }
  if (t.length > 2 && t.charAt(0) === '0' && (t.charAt(1) === 'x' || t.charAt(1) === 'X')) {
    t = t.slice(2);
  }
  // Java uses Integer.parseInt(t, 16): reject anything that isn't pure hex digits
  // (with an optional leading sign — but a negative coord is then rejected).
  if (!/^[+-]?[0-9a-fA-F]+$/.test(t)) {
    return null;
  }
  const v = Number.parseInt(t, 16);
  if (!Number.isFinite(v) || v < 0) {
    return null;
  }
  return v;
}

/** Row (high byte) of an integer 0xRRCC coordinate. */
export function rowOf(coord: number): number {
  return coord >> 8;
}

/** Column (low byte) of an integer 0xRRCC coordinate. */
export function colOf(coord: number): number {
  return coord & 0xff;
}

/** Build an integer 0xRRCC coordinate from a row and column. */
export function coordOf(row: number, col: number): number {
  return ((row << 8) | col) & 0xffff;
}

/**
 * Encode an integer `(row << 8) | col` coordinate into the canonical
 * `"0xRRCC"` string the sample map uses: lowercase `0x`, uppercase 4-digit hex.
 * (Matches the style of `sample-island.map.json`, e.g. `0x0309`.)
 *
 * @param coord  integer coord
 * @returns canonical `"0xRRCC"` string
 */
export function encodeCoord(coord: number): string {
  const hex = (coord & 0xffff).toString(16).toUpperCase().padStart(4, '0');
  return `0x${hex}`;
}

/**
 * Parse a JSON string (the on-disk `.map.json` text) into a {@link CustomMap}.
 * Performs only structural/JSON-shape coercion — no business validation. Throws
 * if the text isn't a JSON object; missing optional fields are filled with sane
 * defaults so the editor always has a usable model.
 *
 * @param text  the raw JSON text
 * @returns the typed map model
 * @throws Error if `text` isn't valid JSON or isn't a JSON object
 */
export function parseMapJson(text: string): CustomMap {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error(`JSON parse error: ${(e as Error).message}`);
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Map file must be a JSON object');
  }
  return fromRaw(raw as Record<string, unknown>);
}

/**
 * Coerce an already-parsed JSON object into a {@link CustomMap}, mirroring how
 * GSON populates {@code CustomMapJson}: unknown fields are ignored, absent fields
 * become their Java defaults (null for objects/arrays, false for `shuffle`).
 * Arrays of the wrong element shape are passed through loosely; `validation.ts`
 * surfaces any resulting problems.
 *
 * @param raw  a parsed JSON object
 * @returns the typed map model
 */
export function fromRaw(raw: Record<string, unknown>): CustomMap {
  const map: CustomMap = {
    name: typeof raw.name === 'string' ? raw.name : '',
    playerCounts: toNumberArray(raw.playerCounts),
    shuffle: raw.shuffle === true,
    landHexes: toHexArray(raw.landHexes),
  };
  if (typeof raw.description === 'string') {
    map.description = raw.description;
  }
  if (Array.isArray(raw.landAreas)) {
    map.landAreas = toLandAreaArray(raw.landAreas);
  }
  if (typeof raw.boardHeight === 'number') {
    map.boardHeight = raw.boardHeight;
  }
  if (typeof raw.boardWidth === 'number') {
    map.boardWidth = raw.boardWidth;
  }
  if (Array.isArray(raw.ports)) {
    map.ports = toPortArray(raw.ports);
  }
  if (typeof raw.robberHex === 'string') {
    map.robberHex = raw.robberHex;
  }
  if (typeof raw.pirateHex === 'string') {
    map.pirateHex = raw.pirateHex;
  }
  return map;
}

/**
 * Serialize a {@link CustomMap} to pretty-printed JSON text suitable for export
 * as a `.map.json` file. Omits empty optional fields the way the sample map does:
 * an absent `description`, `landAreas`, `ports`, `robberHex`, or `pirateHex` is
 * not written. Field order matches the sample map for readable diffs.
 *
 * @param map  the map model to serialize
 * @returns pretty JSON text (2-space indent, trailing newline)
 */
export function serializeMapJson(map: CustomMap): string {
  const canonical = mapWithCanonicalLandAreas(map);
  const out: Record<string, unknown> = {
    name: canonical.name,
  };
  if (canonical.description !== undefined && canonical.description !== '') {
    out.description = canonical.description;
  }
  out.playerCounts = [...canonical.playerCounts];
  out.shuffle = canonical.shuffle;
  if (canonical.boardHeight !== undefined) {
    out.boardHeight = canonical.boardHeight;
  }
  if (canonical.boardWidth !== undefined) {
    out.boardWidth = canonical.boardWidth;
  }
  out.landHexes = canonical.landHexes.map((h) => {
    const o: Record<string, unknown> = { type: h.type, coord: h.coord, diceNum: h.diceNum };
    if (h.landArea !== undefined) {
      o.landArea = h.landArea;
    }
    return o;
  });
  if (canonical.landAreas !== undefined && canonical.landAreas.length > 0) {
    out.landAreas = canonical.landAreas.map((a) => ({ area: a.area, count: a.count }));
  }
  if (canonical.ports !== undefined && canonical.ports.length > 0) {
    out.ports = canonical.ports.map((p) => ({ type: p.type, edge: p.edge, facing: p.facing }));
  }
  if (canonical.robberHex !== undefined && canonical.robberHex !== '') {
    out.robberHex = canonical.robberHex;
  }
  if (canonical.pirateHex !== undefined && canonical.pirateHex !== '') {
    out.pirateHex = canonical.pirateHex;
  }
  return `${JSON.stringify(out, null, 2)}\n`;
}

/** Create an empty starter map model (used by the editor's "New map" action). */
export function emptyMap(): CustomMap {
  return {
    name: '',
    playerCounts: [4],
    shuffle: false,
    boardHeight: EDITOR_DEFAULT_BOARD_HEIGHT,
    boardWidth: EDITOR_DEFAULT_BOARD_WIDTH,
    landHexes: [],
  };
}

// ---------------------------------------------------------------------------
// Internal loose coercions (mirror GSON's permissive deserialization)
// ---------------------------------------------------------------------------

function toNumberArray(v: unknown): number[] {
  if (!Array.isArray(v)) {
    return [];
  }
  return v.map((x) => (typeof x === 'number' ? x : Number(x))).filter((x) => Number.isFinite(x));
}

function toHexArray(v: unknown): MapLandHex[] {
  if (!Array.isArray(v)) {
    return [];
  }
  return v.map((item): MapLandHex => {
    const o = (item ?? {}) as Record<string, unknown>;
    const hex: MapLandHex = {
      type: typeof o.type === 'string' ? o.type : '',
      coord: typeof o.coord === 'string' ? o.coord : '',
      diceNum: typeof o.diceNum === 'number' ? o.diceNum : 0,
    };
    if (typeof o.landArea === 'number') {
      hex.landArea = o.landArea;
    }
    return hex;
  });
}

function toPortArray(v: unknown): MapPort[] {
  if (!Array.isArray(v)) {
    return [];
  }
  return v.map((item): MapPort => {
    const o = (item ?? {}) as Record<string, unknown>;
    return {
      type: typeof o.type === 'string' ? o.type : '',
      edge: typeof o.edge === 'string' ? o.edge : '',
      facing: typeof o.facing === 'string' ? o.facing : '',
    };
  });
}

function toLandAreaArray(v: unknown): MapLandArea[] {
  if (!Array.isArray(v)) {
    return [];
  }
  return v.map((item): MapLandArea => {
    const o = (item ?? {}) as Record<string, unknown>;
    return {
      area: typeof o.area === 'number' ? o.area : Number(o.area),
      count: typeof o.count === 'number' ? o.count : Number(o.count),
    };
  });
}

function inferAreaByHexIndex(map: CustomMap): number[] {
  const hexes = map.landHexes ?? [];
  const out = hexes.map((hex) =>
    isPositiveInteger(hex.landArea) ? Math.floor(hex.landArea as number) : 1,
  );

  if (map.landAreas && map.landAreas.length > 0) {
    let start = 0;
    for (const area of map.landAreas) {
      const count = Number.isFinite(area.count) ? Math.max(0, Math.floor(area.count)) : 0;
      for (let i = start; i < Math.min(hexes.length, start + count); ++i) {
        if (!isPositiveInteger(hexes[i].landArea)) {
          out[i] = area.area;
        }
      }
      start += count;
    }
  }

  return out;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.floor(value) === value && value >= 1;
}
