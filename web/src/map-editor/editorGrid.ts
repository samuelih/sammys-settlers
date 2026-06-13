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
import {
  type CustomMap,
  parseCoord,
  EDITOR_DEFAULT_BOARD_HEIGHT,
  EDITOR_DEFAULT_BOARD_WIDTH,
  MIN_BOARD_HEIGHT,
  MIN_BOARD_WIDTH,
  MAX_BOARD_HEIGHT,
  MAX_BOARD_WIDTH,
} from './mapSchema';

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

/** Editor-facing board frame size in large-board coordinate units. */
export interface EditorBoardSize {
  height: number;
  width: number;
}

/** Clamp a board frame size to the custom-map range the Java server accepts. */
export function clampBoardSize(height: number, width: number): EditorBoardSize {
  return {
    height: clamp(Math.round(height), MIN_BOARD_HEIGHT, MAX_BOARD_HEIGHT),
    width: clamp(Math.round(width), MIN_BOARD_WIDTH, MAX_BOARD_WIDTH),
  };
}

/**
 * Smallest board frame that still contains every declared hex, port edge, robber,
 * and pirate coordinate. Size is one larger than the largest coordinate because
 * board bounds are strict: valid land rows are 1..height-1.
 */
export function minimumBoardSizeForMap(map: CustomMap): EditorBoardSize {
  let height = MIN_BOARD_HEIGHT;
  let width = MIN_BOARD_WIDTH;

  const absorbCoord = (coord: number | null): void => {
    if (coord === null) {
      return;
    }
    height = Math.max(height, rowOf(coord) + 1);
    width = Math.max(width, colOf(coord) + 1);
  };

  for (const hex of map.landHexes ?? []) {
    absorbCoord(parseCoord(hex.coord));
  }
  for (const port of map.ports ?? []) {
    absorbCoord(parseCoord(port.edge));
  }
  absorbCoord(parseCoord(map.robberHex));
  absorbCoord(parseCoord(map.pirateHex));

  return clampBoardSize(height, width);
}

/** Effective editor frame: requested map size, or the compact starter, expanded to fit content. */
export function boardSizeForMap(map: CustomMap): EditorBoardSize {
  const requested = clampBoardSize(
    map.boardHeight ?? EDITOR_DEFAULT_BOARD_HEIGHT,
    map.boardWidth ?? EDITOR_DEFAULT_BOARD_WIDTH,
  );
  const required = minimumBoardSizeForMap(map);
  return {
    height: Math.max(requested.height, required.height),
    width: Math.max(requested.width, required.width),
  };
}

/**
 * Enumerate every placeable hex cell in the editor window. Hexes live on ODD rows
 * (the validator's parity rule). A cell exists at (row, col) when row is odd and
 * (row, col) is within the legal range; the column parity that yields real sea-board
 * hex centers alternates with the row, matching {@code SOCBoardLarge}'s layout
 * (a hex at row r exists at columns sharing r's "(r/2) parity").
 */
export function enumerateHexCells(
  boardHeight: number = EDITOR_DEFAULT_BOARD_HEIGHT,
  boardWidth: number = EDITOR_DEFAULT_BOARD_WIDTH,
): GridHexCell[] {
  const size = clampBoardSize(boardHeight, boardWidth);
  const rowMax = size.height - 1;
  const colMax = size.width - 1;
  const cells: GridHexCell[] = [];
  for (let row = 1; row <= rowMax; row += 2) {
    // On the large board, hex columns in a row share parity with floor(row/2):
    // even half-row -> even columns, odd half-row -> odd columns. This produces
    // the staggered honeycomb the in-game board uses.
    const colParity = Math.floor(row / 2) % 2;
    for (let col = 1; col <= colMax; col += 1) {
      if (col % 2 !== colParity) {
        continue;
      }
      const coord = coordOf(row, col);
      cells.push({ coord, row, col, center: hexToPixel(coord) });
    }
  }
  return cells;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
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
  return candidatePortEdgesWithin(placedHexCoords);
}

/**
 * Coastline-only port slots for the editor. A valid authoring slot borders
 * exactly one non-water land hex and sits inside the active board frame, which
 * prevents interior-edge ports and out-of-frame bottom/right edge mistakes.
 */
export function candidatePortEdgesWithin(
  placedHexCoords: Iterable<number>,
  boardHeight?: number,
  boardWidth?: number,
): GridEdgeCell[] {
  const edgeCounts = new Map<number, number>();
  const maxRow = boardHeight !== undefined ? boardHeight - 1 : MAX_BOARD_HEIGHT - 1;
  const maxCol = boardWidth !== undefined ? boardWidth - 1 : MAX_BOARD_WIDTH - 1;

  for (const hex of placedHexCoords) {
    for (const e of edgesAroundHex(hex)) {
      const r = rowOf(e);
      const c = colOf(e);
      if (e <= 0 || r < 0 || c < 0 || r > maxRow || c > maxCol) {
        continue;
      }
      edgeCounts.set(e, (edgeCounts.get(e) ?? 0) + 1);
    }
  }

  const out: GridEdgeCell[] = [];
  for (const [e, count] of edgeCounts) {
    if (count === 1) {
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
