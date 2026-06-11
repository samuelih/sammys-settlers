/**
 * Shared board-model types for the web client's in-game board (Phase 3+).
 *
 * These mirror the server's authoritative board data but in a render-friendly shape.
 * The SOCBoardLayout2 parser/builder produces a {@link BoardModel}; the SVG renderer
 * consumes it. Coordinates are the large-board (v3 / SOCBoardLarge) 0xRRCC scheme:
 * hexId = (row << 8) | col. Nodes, edges and hexes share the same (row, col) grid.
 *
 * Hex type numbers match soc.game.SOCBoard / SOCBoardLarge constants (v3 "LH" encoding,
 * which does NOT remap water/desert):
 *   DESERT=0, CLAY=1, ORE=2, SHEEP=3, WHEAT=4, WOOD=5, WATER=6, GOLD=7, FOG=8.
 */

export const HEX_DESERT = 0;
export const HEX_CLAY = 1;
export const HEX_ORE = 2;
export const HEX_SHEEP = 3;
export const HEX_WHEAT = 4;
export const HEX_WOOD = 5;
export const HEX_WATER = 6;
export const HEX_GOLD = 7;
export const HEX_FOG = 8;

/** Resource hex types in resource-index order (clay=1..wood=5). */
export const RESOURCE_HEX_TYPES = [HEX_CLAY, HEX_ORE, HEX_SHEEP, HEX_WHEAT, HEX_WOOD] as const;

/** Map a hex type number to a stable semantic key (used for theming/assets). */
export type HexKind =
  | 'desert' | 'clay' | 'ore' | 'sheep' | 'wheat' | 'wood'
  | 'water' | 'gold' | 'fog' | 'unknown';

export function hexKind(hexType: number): HexKind {
  switch (hexType) {
    case HEX_DESERT: return 'desert';
    case HEX_CLAY: return 'clay';
    case HEX_ORE: return 'ore';
    case HEX_SHEEP: return 'sheep';
    case HEX_WHEAT: return 'wheat';
    case HEX_WOOD: return 'wood';
    case HEX_WATER: return 'water';
    case HEX_GOLD: return 'gold';
    case HEX_FOG: return 'fog';
    default: return 'unknown';
  }
}

/** A single hex on the board. */
export interface BoardHex {
  /** 0xRRCC hex coordinate. */
  coord: number;
  row: number;
  col: number;
  /** Hex type number (see HEX_* constants). */
  hexType: number;
  /** Dice number 2..12 (no 7); 0 for desert/water/no-number. */
  diceNum: number;
}

/**
 * A port. ptype: 0 = misc (3:1); 1..5 = clay/ore/sheep/wheat/wood (2:1), matching
 * SOCBoard.MISC_PORT(0)/CLAY_PORT(1)..WOOD_PORT(5).
 * facing: 1..6 direction the port faces toward its land node, matching the
 * SOCBoard FACING_* constants (FACING_NE=1, FACING_E=2, FACING_SE=3,
 * FACING_SW=4, FACING_W=5, FACING_NW=6).
 * edge: 0xRRCC edge coordinate the port sits on.
 */
export interface BoardPort {
  edge: number;
  ptype: number;
  facing: number;
}

/** Whole-board model produced from a SOCBoardLayout2 message. */
export interface BoardModel {
  /** Board encoding format (3 = BOARD_ENCODING_LARGE / sea board). */
  encoding: number;
  /** Visual board size in half-hex units (from getBoardWidth/Height); used for the viewport. */
  width: number;
  height: number;
  hexes: BoardHex[];
  ports: BoardPort[];
  /** 0xRRCC robber hex, or 0/-1 if none. */
  robberHex: number;
  /** 0xRRCC pirate hex, or 0/-1 if none (sea board). */
  pirateHex: number;
}

/** Playing-piece type numbers (soc.game.SOCPlayingPiece). */
export const PIECE_ROAD = 0;
export const PIECE_SETTLEMENT = 1;
export const PIECE_CITY = 2;
export const PIECE_SHIP = 3;
export type PieceType = 0 | 1 | 2 | 3;

/** A piece placed on the board. coord is a node (settlement/city) or edge (road/ship). */
export interface BoardPiece {
  ptype: PieceType;
  /** 0xRRCC node coord (settlement/city) or edge coord (road/ship). */
  coord: number;
  playerNumber: number;
}

/**
 * Facing-direction constants, matching soc.game.SOCBoard:
 *   FACING_NE=1, FACING_E=2, FACING_SE=3, FACING_SW=4, FACING_W=5, FACING_NW=6.
 * Facing is the direction from a port's water hex toward the land hex/node it serves.
 */
export const FACING_NE = 1, FACING_E = 2, FACING_SE = 3, FACING_SW = 4, FACING_W = 5, FACING_NW = 6;
