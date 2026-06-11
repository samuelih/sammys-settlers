// Tests for the board-model builders (boardFromLayout2, parsePotentialSettlements).
// Uses a small synthetic layout plus the live sea-board frame captured from the
// Java server (WS 8888) so the decode is verified against real geometry.

import { describe, it, expect } from 'vitest';
import { decode } from '../protocol/index';
import { SOCBoardLayout2 } from '../protocol/messages/SOCBoardLayout2';
import { SOCPotentialSettlements } from '../protocol/messages/SOCPotentialSettlements';
import { boardFromLayout2, parsePotentialSettlements, isNonResourceHex } from './boardModel';
import { HEX_DESERT, HEX_WATER, HEX_GOLD } from './types';

describe('boardFromLayout2 — synthetic layout', () => {
  it('decodes LH triples, PL blocks, RH and PH', () => {
    // 2 land hexes: (0x0102 wheat dice6), (0x0104 ore dice0=desert-style none)
    // LH = [6, 0x102,4,6, 0x104,2,0]  (len 6)
    // 1 port: type=2(ore), edge=0x0203, facing=4(SW)
    // PL = [3, 2, 0x203, 4]  (one block each)
    // RH = 0x0305, PH = 0x0608
    const lh = [0x102, 4, 6, 0x104, 2, 0];
    const pl = [2, 0x203, 4];
    const wire =
      `1084|ga,3,LH,[${lh.length},${lh.join(',')},` +
      `PL,[${pl.length},${pl.join(',')},RH,${0x0305},PH,${0x0608}`;

    const layout = decode(wire) as SOCBoardLayout2;
    expect(layout).toBeInstanceOf(SOCBoardLayout2);

    const board = boardFromLayout2(layout, { width: 0x10, height: 0x10 });
    expect(board.encoding).toBe(3);
    expect(board.width).toBe(0x10);
    expect(board.height).toBe(0x10);

    expect(board.hexes).toHaveLength(2);
    expect(board.hexes[0]).toEqual({
      coord: 0x102,
      row: 0x01,
      col: 0x02,
      hexType: 4, // wheat
      diceNum: 6,
    });
    expect(board.hexes[1]).toEqual({
      coord: 0x104,
      row: 0x01,
      col: 0x04,
      hexType: 2, // ore
      diceNum: 0,
    });

    expect(board.ports).toHaveLength(1);
    expect(board.ports[0]).toEqual({ edge: 0x203, ptype: 2, facing: 4 });

    expect(board.robberHex).toBe(0x0305);
    expect(board.pirateHex).toBe(0x0608);
  });

  it('skips a movable port with edge < 0', () => {
    // PL with 2 ports: types [0,1], edges [0x203,-1], facings [4,5]
    const pl = [0, 1, 0x203, -1, 4, 5];
    const wire = `1084|ga,3,PL,[${pl.length},${pl.join(',')}`;
    const layout = decode(wire) as SOCBoardLayout2;
    const board = boardFromLayout2(layout);
    expect(board.ports).toHaveLength(1);
    expect(board.ports[0]).toEqual({ edge: 0x203, ptype: 0, facing: 4 });
  });

  it('defaults RH/PH to 0 when absent', () => {
    const wire = '1084|ga,3,LH,[3,258,4,6';
    const layout = decode(wire) as SOCBoardLayout2;
    const board = boardFromLayout2(layout);
    expect(board.robberHex).toBe(0);
    expect(board.pirateHex).toBe(0);
  });
});

describe('boardFromLayout2 — live sea-board frame', () => {
  const LIVE =
    '1084|capTest33539,3,RH,2823,LH,[99,1795,3,4,3843,5,5,2308,5,11,1284,3,8,773,4,5,2821,2,12,1797,5,3,3845,3,8,1286,2,10,2310,4,6,4358,1,3,775,1,2,2823,6,0,1799,2,11,1288,4,9,2312,3,5,4360,1,10,777,3,6,2825,1,9,1801,4,4,1290,5,3,2314,5,10,1803,1,8,3853,5,10,1294,4,5,3342,2,4,783,4,9,1807,2,11,3855,6,0,1296,2,4,3344,7,5,1809,7,9,3346,3,6,PL,[39,0,4,2,0,3,0,5,0,1,0,3,5,4,516,519,1034,1804,2570,3079,3076,2307,1283,2063,3088,4109,4103,3,4,4,5,6,6,1,2,2,6,4,6,3,VS,[4,-2,1,3,0';

  it('produces 33 hexes (99 / 3) and 13 ports (39 / 3)', () => {
    const layout = decode(LIVE) as SOCBoardLayout2;
    const board = boardFromLayout2(layout);
    expect(board.encoding).toBe(3);
    expect(board.hexes).toHaveLength(33);
    expect(board.ports).toHaveLength(13);
    expect(board.robberHex).toBe(2823);
    expect(board.pirateHex).toBe(0);
  });

  it('decodes the first hex triple correctly', () => {
    const layout = decode(LIVE) as SOCBoardLayout2;
    const board = boardFromLayout2(layout);
    // first LH triple: 1795(0x0703), type 3 (sheep), dice 4
    expect(board.hexes[0]).toEqual({
      coord: 1795,
      row: 0x07,
      col: 0x03,
      hexType: 3,
      diceNum: 4,
    });
  });

  it('finds the robber hex among the decoded hexes', () => {
    const layout = decode(LIVE) as SOCBoardLayout2;
    const board = boardFromLayout2(layout);
    const robberOnHex = board.hexes.some((h) => h.coord === board.robberHex);
    expect(robberOnHex).toBe(true);
  });

  it('decodes the port blocks (types, then edges, then facings)', () => {
    const layout = decode(LIVE) as SOCBoardLayout2;
    const board = boardFromLayout2(layout);
    // PL types: 0,4,2,0,3,0,5,0,1,0,3,5,4 ; first edge 516(0x0204); first facing 3(SE)
    expect(board.ports[0]).toEqual({ edge: 516, ptype: 0, facing: 3 });
    // last port: type 4, edge 4103, facing 3
    expect(board.ports[12]).toEqual({ edge: 4103, ptype: 4, facing: 3 });
    // all facings within 1..6
    for (const p of board.ports) {
      expect(p.facing).toBeGreaterThanOrEqual(1);
      expect(p.facing).toBeLessThanOrEqual(6);
    }
  });

  it('contains at least one gold hex (type 7) on this sea board', () => {
    const layout = decode(LIVE) as SOCBoardLayout2;
    const board = boardFromLayout2(layout);
    // The live LH has triples "...,3344,7,5,...,3346,7,9,..." (two gold hexes).
    const goldCount = board.hexes.filter((h) => h.hexType === HEX_GOLD).length;
    expect(goldCount).toBeGreaterThanOrEqual(1);
  });
});

describe('isNonResourceHex', () => {
  it('flags water and desert only', () => {
    expect(isNonResourceHex(HEX_WATER)).toBe(true);
    expect(isNonResourceHex(HEX_DESERT)).toBe(true);
    expect(isNonResourceHex(HEX_GOLD)).toBe(false);
    expect(isNonResourceHex(4)).toBe(false); // wheat
  });
});

describe('parsePotentialSettlements', () => {
  it('unions land-area node sets into legalNodes', () => {
    const wire = '1057|ga,-1,NA,2,PAN,1,LA1,100,200,LA2,200,300';
    const msg = decode(wire) as SOCPotentialSettlements;
    const parsed = parsePotentialSettlements(msg);
    expect(parsed.playerNumber).toBe(-1);
    expect(parsed.potentialNodes).toBeNull();
    expect(parsed.startingLandArea).toBe(1);
    // union dedups the shared node 200
    expect([...parsed.legalNodes].sort((a, b) => a - b)).toEqual([100, 200, 300]);
    expect(parsed.landAreasLegalNodes).not.toBeNull();
  });

  it('uses psNodes as legalNodes when no land areas', () => {
    const wire = '1057|ga,2,100,200,300';
    const msg = decode(wire) as SOCPotentialSettlements;
    const parsed = parsePotentialSettlements(msg);
    expect(parsed.playerNumber).toBe(2);
    expect(parsed.landAreasLegalNodes).toBeNull();
    expect(parsed.legalNodes).toEqual([100, 200, 300]);
    expect(parsed.potentialNodes).toEqual([100, 200, 300]);
  });

  it('handles the live 4-area frame', () => {
    const wire =
      '1057|capTest33539,-1,NA,4,PAN,1,LA1,2050,1538,2563,LA2,1549,1037,LA3,4108,3596,LA4,4098,3586';
    const msg = decode(wire) as SOCPotentialSettlements;
    const parsed = parsePotentialSettlements(msg);
    expect(parsed.legalNodes).toHaveLength(2050 ? 9 : 0); // 3+2+2+2 unique nodes
    expect(parsed.legalNodes).toContain(2050);
    expect(parsed.legalNodes).toContain(3586);
  });
});
