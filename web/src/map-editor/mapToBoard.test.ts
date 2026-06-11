// Tests for mapToBoard.ts — projecting a CustomMap onto the renderer's BoardModel.
// The critical detail is the hex-type NAME -> web HEX_* number mapping (DESERT=0,
// CLAY=1.. WATER=6, GOLD=7), which differs from the Java SOCBoard numbering.

import { describe, it, expect } from 'vitest';
import { parseMapJson, type CustomMap } from './mapSchema';
import { mapToBoard } from './mapToBoard';
import {
  HEX_DESERT,
  HEX_CLAY,
  HEX_ORE,
  HEX_SHEEP,
  HEX_WHEAT,
  HEX_WOOD,
  HEX_WATER,
  HEX_GOLD,
} from '../board/types';
import { sampleMapText as sampleText } from './testFixtures';

function sample(): CustomMap {
  return parseMapJson(sampleText);
}

describe('mapToBoard — sample map', () => {
  it('produces a large-encoding board with all hexes and ports', () => {
    const board = mapToBoard(sample());
    expect(board.encoding).toBe(3);
    expect(board.hexes).toHaveLength(12);
    expect(board.ports).toHaveLength(4);
  });

  it('decodes hex coords and the canonical type numbering', () => {
    const board = mapToBoard(sample());
    const clay = board.hexes[0];
    expect(clay.coord).toBe(0x0309);
    expect(clay.row).toBe(0x03);
    expect(clay.col).toBe(0x09);
    expect(clay.hexType).toBe(HEX_CLAY);
    expect(clay.diceNum).toBe(5);

    // ore second hex
    expect(board.hexes[1].hexType).toBe(HEX_ORE);
  });

  it('maps robber/pirate hexes', () => {
    const board = mapToBoard(sample());
    expect(board.robberHex).toBe(0x0709);
    expect(board.pirateHex).toBe(0x0d0c);
  });

  it('maps ports to BoardPort numbers (misc=0, facing 1..6)', () => {
    const board = mapToBoard(sample());
    // ports[0] = { misc, 0x0807, SE } -> ptype 0, facing 3
    expect(board.ports[0]).toEqual({ edge: 0x0807, ptype: 0, facing: 3 });
    // ports[1] = { wood, 0x060C, NW } -> ptype 5, facing 6
    expect(board.ports[1]).toEqual({ edge: 0x060c, ptype: 5, facing: 6 });
    // ports[2] = { ore, 0x0A0C, SE } -> ptype 2, facing 3
    expect(board.ports[2]).toEqual({ edge: 0x0a0c, ptype: 2, facing: 3 });
  });
});

describe('mapToBoard — type-name to number mapping', () => {
  it('maps each recognized type name to the web HEX_* constant', () => {
    const m: CustomMap = {
      name: 'types',
      playerCounts: [4],
      shuffle: false,
      landHexes: [
        { type: 'desert', coord: '0x0301', diceNum: 0 },
        { type: 'clay', coord: '0x0303', diceNum: 5 },
        { type: 'ore', coord: '0x0305', diceNum: 6 },
        { type: 'sheep', coord: '0x0307', diceNum: 8 },
        { type: 'wheat', coord: '0x0309', diceNum: 4 },
        { type: 'wood', coord: '0x030B', diceNum: 9 },
        { type: 'water', coord: '0x030D', diceNum: 0 },
        { type: 'gold', coord: '0x030F', diceNum: 3 },
      ],
    };
    const board = mapToBoard(m);
    const byCoord = new Map(board.hexes.map((h) => [h.coord, h.hexType]));
    expect(byCoord.get(0x0301)).toBe(HEX_DESERT);
    expect(byCoord.get(0x0303)).toBe(HEX_CLAY);
    expect(byCoord.get(0x0305)).toBe(HEX_ORE);
    expect(byCoord.get(0x0307)).toBe(HEX_SHEEP);
    expect(byCoord.get(0x0309)).toBe(HEX_WHEAT);
    expect(byCoord.get(0x030b)).toBe(HEX_WOOD);
    expect(byCoord.get(0x030d)).toBe(HEX_WATER);
    expect(byCoord.get(0x030f)).toBe(HEX_GOLD);
  });
});

describe('mapToBoard — tolerant of partial / invalid edits', () => {
  it('skips hexes with unparseable coords or unknown types (preview keeps working)', () => {
    const m: CustomMap = {
      name: '',
      playerCounts: [],
      shuffle: false,
      landHexes: [
        { type: 'clay', coord: '0x0309', diceNum: 5 },
        { type: 'clay', coord: 'NOPE', diceNum: 5 }, // bad coord -> skipped
        { type: 'lava', coord: '0x0508', diceNum: 5 }, // bad type -> skipped
      ],
    };
    const board = mapToBoard(m);
    expect(board.hexes).toHaveLength(1);
    expect(board.hexes[0].coord).toBe(0x0309);
  });

  it('skips ports with bad coord/type/facing', () => {
    const m: CustomMap = {
      name: '',
      playerCounts: [],
      shuffle: false,
      landHexes: [{ type: 'clay', coord: '0x0309', diceNum: 5 }],
      ports: [
        { type: 'misc', edge: '0x0807', facing: 'SE' },
        { type: 'brick', edge: '0x0A0C', facing: 'SE' }, // bad type
        { type: 'ore', edge: 'NOPE', facing: 'SE' }, // bad edge
        { type: 'ore', edge: '0x0A0C', facing: 'UP' }, // bad facing
      ],
    };
    const board = mapToBoard(m);
    expect(board.ports).toHaveLength(1);
    expect(board.ports[0].edge).toBe(0x0807);
  });

  it('defaults robber/pirate to 0 (not placed) when absent or invalid', () => {
    const board = mapToBoard({
      name: '',
      playerCounts: [],
      shuffle: false,
      landHexes: [{ type: 'clay', coord: '0x0309', diceNum: 5 }],
      robberHex: 'nope', // not valid hex ('n','o','p' aren't hex digits)
    });
    expect(board.robberHex).toBe(0);
    expect(board.pirateHex).toBe(0);
  });

  it('sizes the viewport at least to the standard large-board size', () => {
    const board = mapToBoard({
      name: '',
      playerCounts: [4],
      shuffle: false,
      landHexes: [{ type: 'clay', coord: '0x0309', diceNum: 5 }],
    });
    expect(board.width).toBeGreaterThanOrEqual(0x10);
    expect(board.height).toBeGreaterThanOrEqual(0x10);
  });
});
