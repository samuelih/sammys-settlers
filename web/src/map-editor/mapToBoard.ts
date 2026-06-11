/**
 * Convert an in-progress {@link CustomMap} edit into the read-only
 * {@link BoardModel} consumed by the existing `BoardSVG` renderer, so the editor
 * can live-preview a map with the exact same geometry the in-game board uses.
 *
 * This is a one-way, best-effort projection: it tolerates partially-invalid maps
 * (skipping hexes/ports whose coords don't parse) so the preview keeps rendering
 * while the author is mid-edit. Run {@link validate} separately for correctness.
 *
 * IMPORTANT — hex-type numbering. The `.map.json` uses NAME strings; the Java
 * server's `SOCBoard` constants number them WATER=0..GOLD=7, but the web board
 * renderer (`web/src/board/types.ts`, the v3 "LH" encoding) numbers them
 * DESERT=0, CLAY=1, ORE=2, SHEEP=3, WHEAT=4, WOOD=5, WATER=6, GOLD=7. We map the
 * NAME directly to the *web* HEX_* constants — NOT the Java numeric values — so
 * the preview colors match the in-game board.
 *
 * Port types and facings DO share numbering with the renderer:
 *   ptype: misc=0, clay=1, ore=2, sheep=3, wheat=4, wood=5 (SOCBoard.*_PORT)
 *   facing: NE=1, E=2, SE=3, SW=4, W=5, NW=6 (SOCBoard.FACING_*)
 */

import {
  type BoardModel,
  type BoardHex,
  type BoardPort,
  HEX_DESERT,
  HEX_CLAY,
  HEX_ORE,
  HEX_SHEEP,
  HEX_WHEAT,
  HEX_WOOD,
  HEX_WATER,
  HEX_GOLD,
} from '../board/types';
import { type CustomMap, parseCoord, rowOf, colOf } from './mapSchema';

/** BOARD_ENCODING_LARGE / sea board, the only encoding custom maps use. */
const BOARD_ENCODING_LARGE = 3;

/** Map a `.map.json` hex-type NAME to the web renderer's HEX_* number. */
function hexTypeNumberFromName(name: string): number | null {
  switch ((name ?? '').toLowerCase()) {
    case 'desert':
      return HEX_DESERT;
    case 'clay':
      return HEX_CLAY;
    case 'ore':
      return HEX_ORE;
    case 'sheep':
      return HEX_SHEEP;
    case 'wheat':
      return HEX_WHEAT;
    case 'wood':
      return HEX_WOOD;
    case 'water':
      return HEX_WATER;
    case 'gold':
      return HEX_GOLD;
    default:
      return null;
  }
}

/** Map a `.map.json` port-type NAME to a SOCBoard port-type number (misc=0..wood=5). */
function portTypeNumberFromName(name: string): number | null {
  switch ((name ?? '').toLowerCase()) {
    case 'misc':
    case '3:1':
      return 0;
    case 'clay':
      return 1;
    case 'ore':
      return 2;
    case 'sheep':
      return 3;
    case 'wheat':
      return 4;
    case 'wood':
      return 5;
    default:
      return null;
  }
}

/** Map a `.map.json` facing NAME to a SOCBoard FACING_* number (NE=1..NW=6). */
function facingNumberFromName(name: string): number | null {
  switch ((name ?? '').toUpperCase()) {
    case 'NE':
      return 1;
    case 'E':
      return 2;
    case 'SE':
      return 3;
    case 'SW':
      return 4;
    case 'W':
      return 5;
    case 'NW':
      return 6;
    default:
      return null;
  }
}

/**
 * Project a {@link CustomMap} onto a {@link BoardModel} for preview rendering.
 * Hexes/ports with unparseable coords or unknown type/facing names are skipped
 * (the preview stays useful mid-edit). The board extent is sized to contain every
 * placed coordinate, falling back to the standard large-board size when sparse.
 *
 * @param map  the (possibly in-progress) map model
 * @returns a render-ready board model
 */
export function mapToBoard(map: CustomMap): BoardModel {
  const hexes: BoardHex[] = [];
  for (const h of map.landHexes ?? []) {
    if (!h) {
      continue;
    }
    const coord = parseCoord(h.coord);
    const hexType = hexTypeNumberFromName(h.type);
    if (coord === null || hexType === null) {
      continue;
    }
    hexes.push({
      coord,
      row: rowOf(coord),
      col: colOf(coord),
      hexType,
      diceNum: typeof h.diceNum === 'number' ? h.diceNum : 0,
    });
  }

  const ports: BoardPort[] = [];
  for (const p of map.ports ?? []) {
    if (!p) {
      continue;
    }
    const edge = parseCoord(p.edge);
    const ptype = portTypeNumberFromName(p.type);
    const facing = facingNumberFromName(p.facing);
    if (edge === null || ptype === null || facing === null) {
      continue;
    }
    ports.push({ edge, ptype, facing });
  }

  const robberHex = parseCoord(map.robberHex) ?? 0;
  const pirateHex = parseCoord(map.pirateHex) ?? 0;

  const { width, height } = boardExtent(hexes, ports);

  return {
    encoding: BOARD_ENCODING_LARGE,
    width,
    height,
    hexes,
    ports,
    robberHex,
    pirateHex,
  };
}

/** Default large-board (SOCBoardLarge) visual size in half-hex units (0x10). */
const DEFAULT_LARGE_BOARD_SIZE = 0x10;

/**
 * Size the preview viewport to contain every placed hex/port coordinate, never
 * smaller than the standard large-board size. Mirrors `boardModel.ts`'s extent
 * logic so the editor preview and the in-game board frame consistently.
 */
function boardExtent(
  hexes: BoardHex[],
  ports: BoardPort[],
): { width: number; height: number } {
  let maxRow = 0;
  let maxCol = 0;
  for (const h of hexes) {
    if (h.row > maxRow) maxRow = h.row;
    if (h.col > maxCol) maxCol = h.col;
  }
  for (const p of ports) {
    const r = rowOf(p.edge);
    const c = colOf(p.edge);
    if (r > maxRow) maxRow = r;
    if (c > maxCol) maxCol = c;
  }
  return {
    width: Math.max(DEFAULT_LARGE_BOARD_SIZE, maxCol + 1),
    height: Math.max(DEFAULT_LARGE_BOARD_SIZE, maxRow + 1),
  };
}
