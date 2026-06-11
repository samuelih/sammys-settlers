// Board-model builders: turn protocol messages into render-friendly board state.
//
// `boardFromLayout2` decodes a SOCBoardLayout2 (v3 / large sea board) into a
// BoardModel for the SVG renderer. `parsePotentialSettlements` extracts the
// legal/potential settlement nodes and land areas from a SOCPotentialSettlements.
//
// Encoding references (verified against soc.game.SOCBoardLarge):
//   LH (land hexes): int[] of 3*N entries — triples (hexCoord, hexType, diceNum).
//     hexCoord is 0xRRCC; hexType uses the v3 numbering (DESERT=0, CLAY=1, ORE=2,
//     SHEEP=3, WHEAT=4, WOOD=5, WATER=6, GOLD=7, FOG=8) — water/desert are NOT
//     remapped for LH (only the legacy "HL" part is). diceNum is 0 for
//     desert/water/no-number hexes.
//   PL (ports): int[] of 3*P entries, in THREE blocks (not interleaved):
//     [ types(P) | edges(P) | facings(P) ]. ptype 0=misc(3:1), 1..5=2:1 resource
//     ports; facing is a SOCBoard FACING_* value (1..6); edge is 0xRRCC. A port
//     with edge < 0 is not currently placed (movable-port scenarios) and is
//     skipped.
//   RH (robber hex): scalar 0xRRCC, only present if > 0.
//   PH (pirate hex): scalar 0xRRCC, only present if > 0.
//
// This file does NOT compute pixel geometry; the renderer owns coords.ts.

import { type SOCBoardLayout2 } from '../protocol/messages/SOCBoardLayout2';
import { type SOCPotentialSettlements } from '../protocol/messages/SOCPotentialSettlements';
import {
  type BoardModel,
  type BoardHex,
  type BoardPort,
  HEX_DESERT,
  HEX_WATER,
} from './types';

/** Default large-board (SOCBoardLarge) visual width/height in half-hex units (0x10). */
const DEFAULT_LARGE_BOARD_SIZE = 0x10;

/**
 * Optional known board dimensions, e.g. from {@code SOCJoinGameAuth}'s height/width
 * fields (the v3 layout message itself doesn't carry them).
 */
export interface BoardDimensions {
  width?: number;
  height?: number;
}

/**
 * Build a {@link BoardModel} from a {@link SOCBoardLayout2} message (v3 board).
 *
 * @param layout  the decoded board-layout message
 * @param dims    optional known width/height (from SOCJoinGameAuth); if omitted,
 *                falls back to the standard large-board size (0x10) but at least
 *                large enough to contain every hex/port coordinate seen.
 * @returns the render-ready board model
 */
export function boardFromLayout2(
  layout: SOCBoardLayout2,
  dims: BoardDimensions = {},
): BoardModel {
  const hexes: BoardHex[] = [];
  const lh = layout.getIntArrayPart('LH');
  if (lh !== null) {
    for (let i = 0; i + 2 < lh.length; i += 3) {
      const coord = lh[i];
      const hexType = lh[i + 1];
      const diceNum = lh[i + 2];
      hexes.push({
        coord,
        row: coord >> 8,
        col: coord & 0xff,
        hexType,
        diceNum,
      });
    }
  }

  const ports: BoardPort[] = [];
  const pl = layout.getIntArrayPart('PL');
  if (pl !== null && pl.length % 3 === 0) {
    const p = pl.length / 3;
    for (let i = 0; i < p; ++i) {
      const ptype = pl[i];
      const edge = pl[i + p];
      const facing = pl[i + 2 * p];
      if (edge < 0) {
        continue; // movable port not currently placed; skip (matches setPortsLayout)
      }
      ports.push({ edge, ptype, facing });
    }
  }

  // RH/PH are scalar parts; getIntPart returns 0 if absent.
  const robberHex = layout.getIntPart('RH');
  const pirateHex = layout.getIntPart('PH');

  // Determine board extent. Prefer explicit dims; otherwise use the standard
  // large-board size, expanded if any coordinate exceeds it.
  let maxRow = 0;
  let maxCol = 0;
  for (const h of hexes) {
    if (h.row > maxRow) maxRow = h.row;
    if (h.col > maxCol) maxCol = h.col;
  }
  for (const pt of ports) {
    const r = pt.edge >> 8;
    const c = pt.edge & 0xff;
    if (r > maxRow) maxRow = r;
    if (c > maxCol) maxCol = c;
  }

  const height =
    dims.height !== undefined && dims.height > 0
      ? dims.height
      : Math.max(DEFAULT_LARGE_BOARD_SIZE, maxRow + 1);
  const width =
    dims.width !== undefined && dims.width > 0
      ? dims.width
      : Math.max(DEFAULT_LARGE_BOARD_SIZE, maxCol + 1);

  return {
    encoding: layout.encodingFormat,
    width,
    height,
    hexes,
    ports,
    robberHex,
    pirateHex,
  };
}

/** True for a hex type that produces no resource (water or desert). */
export function isNonResourceHex(hexType: number): boolean {
  return hexType === HEX_WATER || hexType === HEX_DESERT;
}

/**
 * Parsed legal/potential settlement info from a {@link SOCPotentialSettlements}.
 *
 * On the sea board before game start (playerNumber -1), per-area legal nodes are
 * in {@link landAreasLegalNodes} and the shared legal node set is their union;
 * once the game starts, each player gets their own {@link potentialNodes}.
 */
export interface ParsedPotentials {
  /** Seat number this applies to, or -1 for all players. */
  playerNumber: number;
  /**
   * The player's unique potential-settlement nodes, or null if not sent (the
   * sea board sends land areas instead before game start).
   */
  potentialNodes: number[] | null;
  /** Starting land-area number (PAN), or 0. */
  startingLandArea: number;
  /**
   * Per-land-area legal node sets. Index 0 is unused (null); 1..N are arrays.
   * Null when the board has only a single (implicit) area.
   */
  landAreasLegalNodes: ReadonlyArray<number[] | null> | null;
  /**
   * The shared legal settlement node set: the union of all land-area node sets
   * (sea board), or the potential nodes when no land-area data is present.
   * Always a fresh array; may be empty.
   */
  legalNodes: number[];
}

/**
 * Extract legal/potential settlement nodes and land areas from a
 * {@link SOCPotentialSettlements} message.
 *
 * @param msg  the decoded message
 * @returns the parsed potentials, including a computed shared legal node set
 */
export function parsePotentialSettlements(msg: SOCPotentialSettlements): ParsedPotentials {
  const lan = msg.landAreasLegalNodes;

  let legalNodes: number[];
  if (lan !== null) {
    // Union of all land-area node sets (dedup via Set).
    const seen = new Set<number>();
    for (let i = 1; i < lan.length; ++i) {
      const nodes = lan[i];
      if (nodes !== null) {
        for (const n of nodes) {
          seen.add(n);
        }
      }
    }
    legalNodes = Array.from(seen);
  } else {
    legalNodes = msg.psNodes !== null ? [...msg.psNodes] : [];
  }

  return {
    playerNumber: msg.playerNumber,
    potentialNodes: msg.psNodes !== null ? [...msg.psNodes] : null,
    startingLandArea: msg.startingLandArea,
    landAreasLegalNodes: lan,
    legalNodes,
  };
}
