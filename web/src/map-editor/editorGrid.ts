/**
 * Geometry + cell enumeration for the interactive editor canvas.
 *
 * The editor renders a fixed grid of placeable HEX cells (every valid odd-row
 * coordinate within the board range the Java validator accepts) so the author can
 * click empty cells to place hexes, plus the EDGE positions around placed hexes so
 * ports can be dropped on a coastline. All pixel mapping reuses the read-only
 * board {@link coords} module (the same geometry the in-game board uses), so the
 * editor and the live preview line up exactly.
 */

import {
  rowOf,
  colOf,
  coordOf,
  hexToPixel,
  edgeToPixel,
  type Point,
} from '../board/coords';
import { MAX_ROW, MAX_COL } from './validation';

export { rowOf, colOf, coordOf, hexToPixel, edgeToPixel };
export type { Point };

/** A placeable hex cell on the editor grid. */
export interface GridHexCell {
  coord: number;
  row: number;
  col: number;
  center: Point;
}

/** A candidate port edge on the editor grid. */
export interface GridEdgeCell {
  coord: number;
  /** Midpoint pixel of the edge, for placing the port hit-target. */
  mid: Point;
  /** Pixel endpoints, for drawing the edge segment. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The smallest interesting grid window: large enough to author a normal sea-board
 * map without scrolling, capped at the validator's max range. Rows are 1..ROW_MAX
 * (odd only); columns 1..COL_MAX. (The validator caps at MAX_ROW=21, MAX_COL=22,
 * but a full 21x22 grid is overwhelming; 15x16 comfortably holds the sample + room
 * to grow, and never exceeds the legal range.)
 */
const ROW_MAX = Math.min(15, MAX_ROW);
const COL_MAX = Math.min(16, MAX_COL);

/**
 * Enumerate every placeable hex cell in the editor window. Hexes live on ODD rows
 * (the validator's parity rule). A cell exists at (row, col) when row is odd and
 * (row, col) is within the legal range; the column parity that yields real sea-board
 * hex centers alternates with the row, matching {@code SOCBoardLarge}'s layout
 * (a hex at row r exists at columns sharing r's "(r/2) parity").
 */
export function enumerateHexCells(): GridHexCell[] {
  const cells: GridHexCell[] = [];
  for (let row = 1; row <= ROW_MAX; row += 2) {
    // On the large board, hex columns in a row share parity with floor(row/2):
    // even half-row -> even columns, odd half-row -> odd columns. This produces
    // the staggered honeycomb the in-game board uses.
    const colParity = Math.floor(row / 2) % 2;
    for (let col = 1; col <= COL_MAX; col += 1) {
      if (col % 2 !== colParity) {
        continue;
      }
      const coord = coordOf(row, col);
      cells.push({ coord, row, col, center: hexToPixel(coord) });
    }
  }
  return cells;
}

/**
 * The six edge coordinates surrounding a hex (one per side), ported from the
 * {@code SOCBoardLarge} hex→edge adjacency. A hex at (r, c) touches edges:
 *   N "/" or "\" pair at (r-1, c-1) and (r-1, c)  [the two top slopes],
 *   W "|" at (r, c-1), E "|" at (r, c+1),
 *   S pair at (r+1, c-1) and (r+1, c).
 * (Vertical "|" edges sit on odd rows; sloped edges on even rows.)
 */
export function edgesAroundHex(hexCoord: number): number[] {
  const r = rowOf(hexCoord);
  const c = colOf(hexCoord);
  return [
    coordOf(r - 1, c - 1),
    coordOf(r - 1, c),
    coordOf(r, c - 1),
    coordOf(r, c + 1),
    coordOf(r + 1, c - 1),
    coordOf(r + 1, c),
  ];
}

/**
 * Collect the candidate port edges for the current placed hexes: every edge that
 * borders at least one placed hex, deduplicated. These are the only edges the
 * editor offers as port slots (a port must sit on a coastline edge of the map).
 *
 * @param placedHexCoords  integer coords of all placed land hexes
 * @returns one {@link GridEdgeCell} per unique bordering edge, with pixel geometry
 */
export function candidatePortEdges(placedHexCoords: Iterable<number>): GridEdgeCell[] {
  const seen = new Set<number>();
  const out: GridEdgeCell[] = [];
  for (const hex of placedHexCoords) {
    for (const e of edgesAroundHex(hex)) {
      if (e <= 0 || seen.has(e)) {
        continue;
      }
      seen.add(e);
      const px = edgeToPixel(e);
      out.push({
        coord: e,
        mid: { x: px.cx, y: px.cy },
        x1: px.x1,
        y1: px.y1,
        x2: px.x2,
        y2: px.y2,
      });
    }
  }
  return out;
}

/**
 * The valid FACINGS for a given edge, mirroring the validator's
 * {@code checkPortFacingGeometry}: "|" edges face E/W, "/" edges face NW/SE,
 * "\" edges face NE/SW. Returned as facing NAMES so the UI can offer only the two
 * legal choices and the export round-trips a valid port.
 */
export function legalFacingsForEdge(edge: number): readonly ['E' | 'NW' | 'NE', 'W' | 'SE' | 'SW'] {
  const r = rowOf(edge);
  const c = colOf(edge);
  if (r % 2 === 1) {
    return ['E', 'W'];
  }
  if (c % 2 !== Math.floor(r / 2) % 2) {
    return ['NW', 'SE'];
  }
  return ['NE', 'SW'];
}
