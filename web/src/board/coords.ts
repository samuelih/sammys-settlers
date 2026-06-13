/**
 * Coordinate geometry for the LARGE / sea board (SOCBoardLarge, 0xRRCC coords).
 *
 * Pure functions — no React, no store, no network — so they're trivially unit-
 * testable. Two concerns live here:
 *
 *  1. **Topology** (which nodes/edges/hexes touch which) ported directly from
 *     `soc.game.SOCBoardLarge` / `soc.game.SOCBoard`. Hexes, nodes and edges all
 *     share one square (row, col) grid; a coordinate is `(row << 8) | col`.
 *
 *  2. **Pixel mapping** ported from `soc.client.SOCBoardPanel` (the large-board
 *     branch): the base mapping is linear, `x = col * HALFDELTA_X`,
 *     `y = row * HALFDELTA_Y + TOP_MARGIN`, shared by hex centers, node corners
 *     and edge endpoints — which is what keeps pieces aligned to their hexes.
 *     On top of that, "Y"-parity nodes are drawn {@link HEXY_OFF_SLOPE} px
 *     lower (SOCBoardPanel.nodeToXY). That vertical stagger is what makes the
 *     tiles hexagons: a hex's N apex and NE/NW shoulders share grid row r-1,
 *     so without it every tile would collapse into a rectangle. Hexes are
 *     POINTY-TOP: vertical W/E sides, sloped NW/NE/SW/SE sides; a hex spans
 *     2 grid columns wide and 2 grid rows + the slope height tall.
 *
 * Coordinate-direction rules (from SOCBoardLarge javadoc / source):
 *  - Edge direction by (r, c): "|" (vertical) if r is odd; otherwise with
 *    s = r/2, "/" if (s,c) is (even,odd)|(odd,even), else "\".
 *  - Node direction by (r, c): with s = r/2, "Y" if (s,c) is (even,odd)|(odd,even),
 *    else "A" (upside-down Y).
 */

// The SOCBoard FACING_* constants live in ./types (single source of truth);
// import them for the port geometry below and re-export so callers can pull the
// geometry API and the facing constants from this one module. The barrel
// (./index.ts) re-exports types directly, so it intentionally does NOT
// `export *` these again — see ./index.ts.
import { FACING_NE, FACING_E, FACING_SE, FACING_SW, FACING_W, FACING_NW } from './types';

export { FACING_NE, FACING_E, FACING_SE, FACING_SW, FACING_W, FACING_NW };

/** Half a hex's pixel width (one grid column). From SOCBoardPanel.halfdeltaX. */
export const HALFDELTA_X = 27;
/** Half a hex's pixel height (one grid row). From SOCBoardPanel.halfdeltaY. */
export const HALFDELTA_Y = 23;
/** Full hex pixel width (2 columns). */
export const DELTA_X = HALFDELTA_X * 2;
/** Full hex pixel height (2 rows). */
export const DELTA_Y = HALFDELTA_Y * 2;
/**
 * Vertical height of a hex's sloped top/bottom, in board pixels. From
 * SOCBoardPanel.HEXY_OFF_SLOPE_HEIGHT. Nodes whose (row/2, col) parities
 * differ ("Y" nodes) are drawn this much lower than the linear grid mapping;
 * on a hex that staggers the apexes against the shoulders, turning the tile
 * from a rectangle into a pointy-top hexagon. See {@link nodeToPixel}.
 */
export const HEXY_OFF_SLOPE = 16;
/**
 * Top pixel margin so row-0 nodes/edges aren't clipped. SOCBoardPanel uses
 * `halfdeltaY + 9` (HALF_HEXHEIGHT) for the hex slope; we use a clean
 * {@link HALFDELTA_Y}. The exact value only shifts everything uniformly — the
 * relative geometry (and therefore piece alignment) is unaffected.
 */
export const TOP_MARGIN = HALFDELTA_Y;

/** A pixel point. */
export interface Point {
  x: number;
  y: number;
}

/** Split a 0xRRCC coordinate into row and column. */
export function rowOf(coord: number): number {
  return coord >> 8;
}
export function colOf(coord: number): number {
  return coord & 0xff;
}
/** Build a 0xRRCC coordinate from row and column. */
export function coordOf(row: number, col: number): number {
  return ((row << 8) | col) & 0xffff;
}

// ---------------------------------------------------------------------------
// Topology — ported from SOCBoardLarge / SOCBoard
// ---------------------------------------------------------------------------

/**
 * Node offsets for the 6 corners of a hex, clockwise from the north (top)
 * point. Ported from {@code SOCBoardLarge.A_NODE2HEX}:
 * N, NE, SE, S, SW, NW. Each entry is `(rowDelta << 8) | colDelta` folded into
 * the coordinate add.
 *
 * @see getAdjacentNodesToHex
 */
const NODE_DELTAS_TO_HEX: ReadonlyArray<readonly [number, number]> = [
  [-0x100, 0], // N
  [-0x100, +1], // NE
  [+0x100, +1], // SE
  [+0x100, 0], // S
  [+0x100, -1], // SW
  [-0x100, -1], // NW
];

/**
 * The 6 node coordinates at a hex's corners, clockwise from the north point.
 * Ported from {@code SOCBoardLarge.getAdjacentNodesToHex_arr}. All 6 are valid
 * if the hex coordinate is valid.
 */
export function getAdjacentNodesToHex(hexCoord: number): number[] {
  const out: number[] = new Array<number>(6);
  for (let dir = 0; dir < 6; dir += 1) {
    const d = NODE_DELTAS_TO_HEX[dir];
    out[dir] = hexCoord + d[0] + d[1];
  }
  return out;
}

/**
 * The two node coordinates that are the ends of an edge.
 * Ported from {@code SOCBoardLarge.getAdjacentNodesToEdge_arr}:
 *  - "|" vertical edge (r odd): nodes (r-1, c) and (r+1, c).
 *  - "/" or "\" sloped edge (r even): nodes (r, c) and (r, c+1).
 *
 * @returns `[nodeA, nodeB]`
 */
export function getAdjacentNodesToEdge(edgeCoord: number): [number, number] {
  const r = edgeCoord >> 8;
  if ((r & 1) === 1) {
    // "|" vertical edge
    return [edgeCoord - 0x0100, edgeCoord + 0x0100];
  }
  // "/" or "\" sloped edge
  return [edgeCoord, edgeCoord + 0x0001];
}

/**
 * The edge coordinate adjacent to a node in one of three directions.
 * Ported from {@code SOCBoardLarge.getAdjacentEdgeToNode}:
 *  - dir 0: NW or SW edge — (r, c-1)
 *  - dir 1: NE or SE edge — (r, c)
 *  - dir 2: N or S edge — for a "Y" node the S edge (r+1, c), else the N edge (r-1, c)
 *
 * Unlike the Java method this does NOT bounds-check (the renderer has no board
 * bounds); every node has 3 well-defined adjacent edge coordinates.
 *
 * @param nodeDir 0, 1 or 2
 */
export function getAdjacentEdgeToNode(nodeCoord: number, nodeDir: number): number {
  let r = nodeCoord >> 8;
  let c = nodeCoord & 0xff;
  switch (nodeDir) {
    case 0: // NW or SW
      c -= 1;
      break;
    case 1: // NE or SE — (r, c) already correct
      break;
    case 2: {
      // N or S
      const nodeIsY = c % 2 !== Math.floor(r / 2) % 2;
      if (nodeIsY) {
        r += 1; // S
      } else {
        r -= 1; // N
      }
      break;
    }
    default:
      throw new Error(`nodeDir out of range: ${nodeDir}`);
  }
  return ((r << 8) | c) & 0xffff;
}

/**
 * The (up to 3) edge coordinates touching a node.
 * Ported from {@code SOCBoard.getAdjacentEdgesToNode_arr} → reverse-filter, but
 * without bounds-checking: all 3 directional edges are returned.
 */
export function getAdjacentEdgesToNode(nodeCoord: number): number[] {
  return [
    getAdjacentEdgeToNode(nodeCoord, 0),
    getAdjacentEdgeToNode(nodeCoord, 1),
    getAdjacentEdgeToNode(nodeCoord, 2),
  ];
}

/**
 * The node at the end of an edge in a given FACING direction (1..6, the
 * SOCBoard FACING_* constants: NE=1, E=2, SE=3, SW=4, W=5, NW=6). Used to find
 * which land node a port faces. Ported from
 * {@code SOCBoardLarge.getAdjacentNodeToEdge}.
 *
 * @throws Error if facing is out of range or perpendicular to the edge.
 */
export function getAdjacentNodeToEdge(edgeCoord: number, facing: number): number {
  if (facing < 1 || facing > 6) {
    throw new Error('facing out of range');
  }
  let r = edgeCoord >> 8;
  let c = edgeCoord & 0xff;
  let perpendicular = false;

  if ((r & 1) === 1) {
    // "|" vertical edge
    switch (facing) {
      case FACING_NE:
      case FACING_NW:
        r -= 1;
        break;
      case FACING_SE:
      case FACING_SW:
        r += 1;
        break;
      case FACING_E:
      case FACING_W:
        perpendicular = true;
        break;
      default:
        break;
    }
  } else if (c % 2 !== Math.floor(r / 2) % 2) {
    // "/" sloped edge
    switch (facing) {
      case FACING_NE:
      case FACING_E:
        c += 1;
        break;
      case FACING_SW:
      case FACING_W:
        // node coord == edge coord
        break;
      case FACING_NW:
      case FACING_SE:
        perpendicular = true;
        break;
      default:
        break;
    }
  } else {
    // "\" sloped edge
    switch (facing) {
      case FACING_E:
      case FACING_SE:
        c += 1;
        break;
      case FACING_W:
      case FACING_NW:
        // node coord == edge coord
        break;
      case FACING_NE:
      case FACING_SW:
        perpendicular = true;
        break;
      default:
        break;
    }
  }

  if (perpendicular) {
    throw new Error(`facing ${facing} perpendicular from edge 0x${edgeCoord.toString(16)}`);
  }
  return ((r << 8) | c) & 0xffff;
}

/**
 * Pixel offset (dx, dy) to move one hex away from an edge in each port FACING
 * direction (1..6). Ported from {@code SOCBoardPanel.DELTAX_FACING} /
 * {@code DELTAY_FACING}; index 0 is unused. Points from the port edge toward
 * the land hex it serves.
 */
const PORT_FACING_DX: ReadonlyArray<number> = [0, HALFDELTA_X, DELTA_X, HALFDELTA_X, -HALFDELTA_X, -DELTA_X, -HALFDELTA_X];
const PORT_FACING_DY: ReadonlyArray<number> = [0, -DELTA_Y, 0, DELTA_Y, DELTA_Y, 0, -DELTA_Y];

/** The (dx, dy) one-hex offset for a port facing, in board pixels. */
export function portFacingOffset(facing: number): Point {
  return { x: PORT_FACING_DX[facing] ?? 0, y: PORT_FACING_DY[facing] ?? 0 };
}

// ---------------------------------------------------------------------------
// Pixel mapping — ported from SOCBoardPanel (large-board branch)
// ---------------------------------------------------------------------------

/**
 * Pixel center of a hex. Linear mapping shared by hexes, nodes and edges:
 * `x = col * HALFDELTA_X`, `y = row * HALFDELTA_Y + TOP_MARGIN`.
 */
export function hexToPixel(coord: number): Point {
  return gridToPixel(coord >> 8, coord & 0xff);
}

/**
 * Pixel position of a node corner: the linear grid mapping, plus the
 * {@link HEXY_OFF_SLOPE} drop for "Y"-parity nodes. Ported from
 * {@code SOCBoardPanel.nodeToXY} (large-board branch):
 * `if ((r/2) % 2 != c % 2) hy += HEXY_OFF_SLOPE_HEIGHT;`
 *
 * On a hex this lowers the NE/NW shoulders and the S apex relative to the
 * N apex and SE/SW shoulders, producing the pointy-top hexagon shape.
 */
export function nodeToPixel(coord: number): Point {
  const r = coord >> 8;
  const c = coord & 0xff;
  const p = gridToPixel(r, c);
  if (Math.floor(r / 2) % 2 !== c % 2) {
    p.y += HEXY_OFF_SLOPE;
  }
  return p;
}

/** Internal: the one true (row, col) -> pixel mapping. */
function gridToPixel(row: number, col: number): Point {
  return { x: col * HALFDELTA_X, y: row * HALFDELTA_Y + TOP_MARGIN };
}

/** An edge's two endpoints (in pixels) plus its slope angle (degrees). */
export interface EdgePixels {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Angle of the edge line in degrees (atan2 of the endpoints). */
  angle: number;
  /** Midpoint, convenient for placing markers. */
  cx: number;
  cy: number;
}

/**
 * Pixel endpoints of an edge: derive its two end-nodes via
 * {@link getAdjacentNodesToEdge}, map each with {@link nodeToPixel}, and report
 * the slope angle and midpoint.
 */
export function edgeToPixel(coord: number): EdgePixels {
  const [nodeA, nodeB] = getAdjacentNodesToEdge(coord);
  const a = nodeToPixel(nodeA);
  const b = nodeToPixel(nodeB);
  const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  return {
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y,
    angle,
    cx: (a.x + b.x) / 2,
    cy: (a.y + b.y) / 2,
  };
}

/**
 * Vertical offset from a hex's linear grid center ({@link hexToPixel}) to its
 * VISUAL center. The slope drop ({@link HEXY_OFF_SLOPE}) lowers the S apex but
 * not the N apex, so the hexagon's vertical midpoint sits half a slope below
 * the grid center. Add this to `hexToPixel(...).y` when centering decorations
 * (dice token, robber, etc.) inside the tile.
 */
export const HEX_CENTER_DY = HEXY_OFF_SLOPE / 2;

/**
 * SVG `points` attribute string for a hexagon centered at (cx, cy) — the
 * LINEAR grid center from {@link hexToPixel} — matching the EXACT node
 * geometry of the Sammys-Settlers large board.
 *
 * Deriving the corners from the node deltas ({@link NODE_DELTAS_TO_HEX}) mapped
 * through {@link nodeToPixel} (col±1 → ±HALFDELTA_X, row±1 → ±HALFDELTA_Y, plus
 * the "Y"-node {@link HEXY_OFF_SLOPE} drop on the NE/NW shoulders and S apex)
 * gives, relative to the hex grid center:
 *   N  ( 0,            -HALFDELTA_Y)                    (apex)
 *   NE (+HALFDELTA_X,  -HALFDELTA_Y + HEXY_OFF_SLOPE)   (shoulder)
 *   SE (+HALFDELTA_X,  +HALFDELTA_Y)                    (shoulder)
 *   S  ( 0,            +HALFDELTA_Y + HEXY_OFF_SLOPE)   (apex)
 *   SW (-HALFDELTA_X,  +HALFDELTA_Y)                    (shoulder)
 *   NW (-HALFDELTA_X,  -HALFDELTA_Y + HEXY_OFF_SLOPE)   (shoulder)
 *
 * A true "pointy-top" hexagon: single N/S apexes at column c, shoulders one
 * column out and one slope-height toward the middle, with vertical W and E
 * sides (NW→SW and NE→SE). Listed clockwise from the N apex, the six corners
 * are exactly the {@link getAdjacentNodesToHex} order mapped through
 * {@link nodeToPixel}, so a piece drawn at any node lands on a hex corner.
 *
 * @param scale optional radial scale (default 1) about the hex's VISUAL center
 *   (cy + {@link HEX_CENTER_DY}); e.g. 0.9 yields an inset hexagon outline
 *   used for a decorative inner bevel.
 */
export function hexPolygonPoints(cx: number, cy: number, scale = 1): string {
  const yc = cy + HEX_CENTER_DY;
  const hx = HALFDELTA_X * scale;
  const yApex = (HALFDELTA_Y + HEX_CENTER_DY) * scale;
  const yShoulder = (HALFDELTA_Y - HEX_CENTER_DY) * scale;
  const pts: Array<[number, number]> = [
    [cx, yc - yApex], // N
    [cx + hx, yc - yShoulder], // NE
    [cx + hx, yc + yShoulder], // SE
    [cx, yc + yApex], // S
    [cx - hx, yc + yShoulder], // SW
    [cx - hx, yc - yShoulder], // NW
  ];
  return pts.map(([x, y]) => `${round(x)},${round(y)}`).join(' ');
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Pip count (number of dots) for a dice number: 6 - |7 - n|. 0 for none. */
export function dicePipCount(diceNum: number): number {
  if (diceNum < 2 || diceNum > 12 || diceNum === 7) {
    return 0;
  }
  return 6 - Math.abs(7 - diceNum);
}
