// Round-trip + wire-fixture tests for the Phase-3 in-game protocol messages.
// Wire strings are captured from / verified against the live Java server on
// WS 8888 (sea-board practice game), or constructed from the exact Java
// toCmd()/parseDataStr() contract. Importing ./index registers every parser.

import { describe, it, expect } from 'vitest';
import { decode, encode, MessageType, PlayerElementAction } from './index';
import { SOCTurn } from './messages/SOCTurn';
import { SOCSetTurn } from './messages/SOCSetTurn';
import { SOCFirstPlayer } from './messages/SOCFirstPlayer';
import { SOCLongestRoad } from './messages/SOCLongestRoad';
import { SOCLargestArmy } from './messages/SOCLargestArmy';
import { SOCPlayerElement } from './messages/SOCPlayerElement';
import { SOCPlayerElements } from './messages/SOCPlayerElements';
import { SOCGameElements } from './messages/SOCGameElements';
import { SOCDiceResult } from './messages/SOCDiceResult';
import { SOCDiceResultResources } from './messages/SOCDiceResultResources';
import { SOCPutPiece } from './messages/SOCPutPiece';
import { SOCMovePiece } from './messages/SOCMovePiece';
import { SOCRollDice } from './messages/SOCRollDice';
import { SOCEndTurn } from './messages/SOCEndTurn';
import { SOCBuildRequest } from './messages/SOCBuildRequest';
import { SOCCancelBuildRequest, CANCEL_CARD } from './messages/SOCCancelBuildRequest';
import { SOCResourceCount } from './messages/SOCResourceCount';
import { SOCGameServerText, UNLIKELY_CHAR1 } from './messages/SOCGameServerText';
import { SOCGameTextMsg, SEP2_ALT } from './messages/SOCGameTextMsg';
import { SOCBoardLayout2 } from './messages/SOCBoardLayout2';
import { SOCPotentialSettlements } from './messages/SOCPotentialSettlements';

/** Decode then assert the result is a non-null message of the expected type. */
function decodeOk(wire: string): { type: number; toCmd(): string } {
  const m = decode(wire);
  expect(m, `decode(${JSON.stringify(wire)}) should not be null`).not.toBeNull();
  return m as { type: number; toCmd(): string };
}

describe('SOCTurn (1026)', () => {
  it('round-trips with a game state (captured live)', () => {
    const wire = '1026|capTest33539,3,5';
    const m = decodeOk(wire);
    expect(m.type).toBe(MessageType.TURN);
    expect((m as SOCTurn).playerNumber).toBe(3);
    expect((m as SOCTurn).gameState).toBe(5);
    expect(encode(m)).toBe(wire);
  });

  it('omits gameState when 0', () => {
    const m = new SOCTurn('ga', 2, 0);
    expect(m.toCmd()).toBe('1026|ga,2');
    const back = decode(m.toCmd()) as SOCTurn;
    expect(back.playerNumber).toBe(2);
    expect(back.gameState).toBe(0);
  });

  it('rejects a non-integer player number', () => {
    expect(decode('1026|ga,x')).toBeNull();
  });

  it('rejects player numbers outside Java int range', () => {
    expect(decode('1026|ga,2147483648')).toBeNull();
    expect(decode('1026|ga,-2147483649')).toBeNull();
  });
});

describe('SOCSetTurn / SOCFirstPlayer / SOCLongestRoad / SOCLargestArmy (game,pn)', () => {
  it('SOCSetTurn round-trips', () => {
    const wire = '1055|ga,1';
    const m = decodeOk(wire) as SOCSetTurn;
    expect(m.type).toBe(MessageType.SETTURN);
    expect(m.playerNumber).toBe(1);
    expect(encode(m)).toBe(wire);
  });
  it('SOCFirstPlayer round-trips', () => {
    const wire = '1054|ga,2';
    const m = decodeOk(wire) as SOCFirstPlayer;
    expect(m.type).toBe(MessageType.FIRSTPLAYER);
    expect(m.playerNumber).toBe(2);
    expect(encode(m)).toBe(wire);
  });
  it('SOCLongestRoad round-trips, -1 means none', () => {
    const wire = '1066|ga,-1';
    const m = decodeOk(wire) as SOCLongestRoad;
    expect(m.type).toBe(MessageType.LONGESTROAD);
    expect(m.playerNumber).toBe(-1);
    expect(encode(m)).toBe(wire);
  });
  it('SOCLargestArmy round-trips', () => {
    const wire = '1067|ga,0';
    const m = decodeOk(wire) as SOCLargestArmy;
    expect(m.type).toBe(MessageType.LARGESTARMY);
    expect(m.playerNumber).toBe(0);
    expect(encode(m)).toBe(wire);
  });
});

describe('SOCPlayerElement (1024)', () => {
  it('round-trips the live SET PLAYED_DEV_CARD_FLAG frame', () => {
    // captured: 1024|capTest33539,-1,100,19,0
    const wire = '1024|capTest33539,-1,100,19,0';
    const m = decodeOk(wire) as SOCPlayerElement;
    expect(m.type).toBe(MessageType.PLAYERELEMENT);
    expect(m.playerNumber).toBe(-1);
    expect(m.actionType).toBe(PlayerElementAction.SET);
    expect(m.elementType).toBe(19);
    expect(m.amount).toBe(0);
    expect(m.news).toBe(false);
    expect(encode(m)).toBe(wire);
  });

  it('carries the news flag via a trailing Y', () => {
    const m = new SOCPlayerElement('ga', 1, PlayerElementAction.LOSE, 1, 3, true);
    expect(m.toCmd()).toBe('1024|ga,1,102,1,3,Y');
    const back = decode(m.toCmd()) as SOCPlayerElement;
    expect(back.news).toBe(true);
    expect(back.amount).toBe(3);
  });

  it('rejects too few fields', () => {
    expect(decode('1024|ga,1,100,19')).toBeNull();
  });
});

describe('SOCPlayerElements (1086, multi)', () => {
  it('round-trips the live SET resource frame', () => {
    // captured: 1086|capTest33539|0|100|1|0|2|0|3|0|4|0|5|0|6|0
    const wire = '1086|capTest33539|0|100|1|0|2|0|3|0|4|0|5|0|6|0';
    const m = decodeOk(wire) as SOCPlayerElements;
    expect(m.type).toBe(MessageType.PLAYERELEMENTS);
    expect(m.playerNumber).toBe(0);
    expect(m.actionType).toBe(PlayerElementAction.SET);
    expect(m.elementTypes).toEqual([1, 2, 3, 4, 5, 6]);
    expect(m.amounts).toEqual([0, 0, 0, 0, 0, 0]);
    expect(encode(m)).toBe(wire);
  });

  it('round-trips the live piece-count frame', () => {
    // captured: 1086|capTest33539|0|100|10|15|11|5|12|4|13|15
    const wire = '1086|capTest33539|0|100|10|15|11|5|12|4|13|15';
    const m = decodeOk(wire) as SOCPlayerElements;
    expect(m.elementTypes).toEqual([10, 11, 12, 13]);
    expect(m.amounts).toEqual([15, 5, 4, 15]);
    expect(encode(m)).toBe(wire);
  });

  it('rejects an odd param count (no trailing amount)', () => {
    expect(decode('1086|ga|0|100|10')).toBeNull();
  });
});

describe('SOCGameElements (1096, multi)', () => {
  it('round-trips the live multi-element join frame', () => {
    // captured: 1096|capTest33539|4|-1  (CURRENT_PLAYER = -1)
    const wire = '1096|capTest33539|4|-1';
    const m = decodeOk(wire) as SOCGameElements;
    expect(m.type).toBe(MessageType.GAMEELEMENTS);
    expect(m.elementTypes).toEqual([4]);
    expect(m.values).toEqual([-1]);
    expect(encode(m)).toBe(wire);
  });

  it('round-trips a multi-pair frame (captured)', () => {
    // captured: 1096|capTest33539|2|25|1|0|3|-1|6|-1|5|-1
    const wire = '1096|capTest33539|2|25|1|0|3|-1|6|-1|5|-1';
    const m = decodeOk(wire) as SOCGameElements;
    expect(m.elementTypes).toEqual([2, 1, 3, 6, 5]);
    expect(m.values).toEqual([25, 0, -1, -1, -1]);
    expect(encode(m)).toBe(wire);
  });
});

describe('SOCDiceResult (1028)', () => {
  it('round-trips the live clear frame (-1)', () => {
    const wire = '1028|capTest33539,-1';
    const m = decodeOk(wire) as SOCDiceResult;
    expect(m.type).toBe(MessageType.DICERESULT);
    expect(m.result).toBe(-1);
    expect(encode(m)).toBe(wire);
  });
  it('round-trips a real roll', () => {
    const m = new SOCDiceResult('ga', 8);
    expect(m.toCmd()).toBe('1028|ga,8');
    expect((decode(m.toCmd()) as SOCDiceResult).result).toBe(8);
  });
});

describe('SOCDiceResultResources (1092, multi)', () => {
  it('round-trips a synthetic two-player gain', () => {
    // 2 players: pn0 total 5 gains (3 sheep[type3]); pn2 total 7 gains (1 clay[1],2 wood[5])
    // encode: 2 | 0,5, 3,3, 0 | 2,7, 1,1, 2,5
    const m = new SOCDiceResultResources('ga', [
      { playerNumber: 0, total: 5, resources: [{ type: 3, amount: 3 }] },
      {
        playerNumber: 2,
        total: 7,
        resources: [
          { type: 1, amount: 1 },
          { type: 5, amount: 2 },
        ],
      },
    ]);
    const wire = '1092|ga|2|0|5|3|3|0|2|7|1|1|2|5';
    expect(m.toCmd()).toBe(wire);

    const back = decode(wire) as SOCDiceResultResources;
    expect(back.type).toBe(MessageType.DICERESULTRESOURCES);
    expect(back.players).toHaveLength(2);
    expect(back.players[0]).toEqual({
      playerNumber: 0,
      total: 5,
      resources: [{ type: 3, amount: 3 }],
    });
    expect(back.players[1].playerNumber).toBe(2);
    expect(back.players[1].resources).toEqual([
      { type: 1, amount: 1 },
      { type: 5, amount: 2 },
    ]);
    expect(encode(back)).toBe(wire);
  });

  it('round-trips a single-player gain (no trailing 0 separator)', () => {
    const m = new SOCDiceResultResources('ga', [
      { playerNumber: 1, total: 4, resources: [{ type: 4, amount: 2 }] },
    ]);
    const wire = '1092|ga|1|1|4|2|4';
    expect(m.toCmd()).toBe(wire);
    const back = decode(wire) as SOCDiceResultResources;
    expect(back.players).toHaveLength(1);
    expect(back.players[0].resources).toEqual([{ type: 4, amount: 2 }]);
  });

  it('rejects a player-count mismatch', () => {
    // claims 3 players but only 1 present
    expect(decode('1092|ga|3|1|4|2|4')).toBeNull();
  });
});

describe('SOCPutPiece (1009)', () => {
  it('round-trips the live settlement placement (pn before pieceType)', () => {
    // captured: 1009|capTest33539,3,1,1543  -> pn=3, pieceType=1(settlement), coord=0x607
    const wire = '1009|capTest33539,3,1,1543';
    const m = decodeOk(wire) as SOCPutPiece;
    expect(m.type).toBe(MessageType.PUTPIECE);
    expect(m.playerNumber).toBe(3);
    expect(m.pieceType).toBe(1);
    expect(m.coordinates).toBe(1543);
    expect(encode(m)).toBe(wire);
  });

  it('round-trips the live road placement', () => {
    // captured: 1009|capTest33539,3,0,1542  -> pieceType 0 (road)
    const wire = '1009|capTest33539,3,0,1542';
    const m = decodeOk(wire) as SOCPutPiece;
    expect(m.pieceType).toBe(0);
    expect(m.coordinates).toBe(1542);
    expect(encode(m)).toBe(wire);
  });

  it('rejects a negative piece type', () => {
    expect(decode('1009|ga,0,-1,100')).toBeNull();
  });
});

describe('SOCMovePiece (1093)', () => {
  it('round-trips a ship move', () => {
    // 0x803 = 2051, 0x905 = 2309
    const m = new SOCMovePiece('ga', 2, 3, 0x803, 0x905);
    const wire = '1093|ga,2,3,2051,2309';
    expect(m.toCmd()).toBe(wire);
    const back = decode(wire) as SOCMovePiece;
    expect(back.type).toBe(MessageType.MOVEPIECE);
    expect(back.pieceType).toBe(3);
    expect(back.fromCoord).toBe(2051);
    expect(back.toCoord).toBe(2309);
  });

  it('rejects a negative coordinate', () => {
    expect(decode('1093|ga,2,3,-1,5')).toBeNull();
  });
});

describe('SOCRollDice / SOCEndTurn (game-only)', () => {
  it('SOCRollDice round-trips', () => {
    const wire = '1031|ga';
    const m = decodeOk(wire) as SOCRollDice;
    expect(m.type).toBe(MessageType.ROLLDICE);
    expect(m.game).toBe('ga');
    expect(encode(m)).toBe(wire);
  });
  it('SOCEndTurn round-trips', () => {
    const wire = '1032|ga';
    const m = decodeOk(wire) as SOCEndTurn;
    expect(m.type).toBe(MessageType.ENDTURN);
    expect(m.game).toBe('ga');
    expect(encode(m)).toBe(wire);
  });
});

describe('SOCBuildRequest / SOCCancelBuildRequest (game,pieceType)', () => {
  it('SOCBuildRequest round-trips a road request', () => {
    const wire = '1043|ga,0';
    const m = decodeOk(wire) as SOCBuildRequest;
    expect(m.type).toBe(MessageType.BUILDREQUEST);
    expect(m.pieceType).toBe(0);
    expect(encode(m)).toBe(wire);
  });
  it('SOCBuildRequest allows -1 (Special Building) but rejects < -1', () => {
    expect((decode('1043|ga,-1') as SOCBuildRequest).pieceType).toBe(-1);
    expect(decode('1043|ga,-2')).toBeNull();
  });
  it('SOCCancelBuildRequest round-trips CARD (-2)', () => {
    const m = new SOCCancelBuildRequest('ga', CANCEL_CARD);
    expect(m.toCmd()).toBe('1044|ga,-2');
    expect((decode('1044|ga,-2') as SOCCancelBuildRequest).pieceType).toBe(-2);
  });
});

describe('SOCResourceCount (1063)', () => {
  it('round-trips', () => {
    const wire = '1063|ga,2,7';
    const m = decodeOk(wire) as SOCResourceCount;
    expect(m.type).toBe(MessageType.RESOURCECOUNT);
    expect(m.playerNumber).toBe(2);
    expect(m.count).toBe(7);
    expect(encode(m)).toBe(wire);
  });
});

describe('SOCGameServerText (1091, char1 separator)', () => {
  it('round-trips with the (char)1 separator', () => {
    const wire = `1091|ga${UNLIKELY_CHAR1}It is your turn to build.`;
    const m = decodeOk(wire) as SOCGameServerText;
    expect(m.type).toBe(MessageType.GAMESERVERTEXT);
    expect(m.game).toBe('ga');
    expect(m.text).toBe('It is your turn to build.');
    expect(encode(m)).toBe(wire);
  });
  it('preserves commas in the text (not split on SEP2)', () => {
    const m = new SOCGameServerText('ga', 'Joe gets 3 sheep, 1 clay.');
    const back = decode(m.toCmd()) as SOCGameServerText;
    expect(back.text).toBe('Joe gets 3 sheep, 1 clay.');
  });
});

describe('SOCGameTextMsg (1010, char0 separator)', () => {
  it('round-trips chat with the (char)0 separator', () => {
    const wire = `1010|ga${SEP2_ALT}debug${SEP2_ALT}hello world`;
    const m = decodeOk(wire) as SOCGameTextMsg;
    expect(m.type).toBe(MessageType.GAMETEXTMSG);
    expect(m.game).toBe('ga');
    expect(m.nickname).toBe('debug');
    expect(m.text).toBe('hello world');
    expect(encode(m)).toBe(wire);
  });
});

describe('SOCBoardLayout2 (1084, keyed parts) — live sea-board frame', () => {
  // Full frame captured live from the sea-board practice game.
  const LIVE =
    '1084|capTest33539,3,RH,2823,LH,[99,1795,3,4,3843,5,5,2308,5,11,1284,3,8,773,4,5,2821,2,12,1797,5,3,3845,3,8,1286,2,10,2310,4,6,4358,1,3,775,1,2,2823,6,0,1799,2,11,1288,4,9,2312,3,5,4360,1,10,777,3,6,2825,1,9,1801,4,4,1290,5,3,2314,5,10,1803,1,8,3853,5,10,1294,4,5,3342,2,4,783,4,9,1807,2,11,3855,6,0,1296,2,4,3344,7,5,1809,7,9,3346,3,6,PL,[39,0,4,2,0,3,0,5,0,1,0,3,5,4,516,519,1034,1804,2570,3079,3076,2307,1283,2063,3088,4109,4103,3,4,4,5,6,6,1,2,2,6,4,6,3,VS,[4,-2,1,3,0';

  it('decodes and re-encodes byte-identically', () => {
    const m = decodeOk(LIVE) as SOCBoardLayout2;
    expect(m.type).toBe(MessageType.BOARDLAYOUT2);
    expect(m.game).toBe('capTest33539');
    expect(m.encodingFormat).toBe(3);
    expect(encode(m)).toBe(LIVE);
  });

  it('exposes RH as a scalar and LH/PL/VS as arrays in order', () => {
    const m = decode(LIVE) as SOCBoardLayout2;
    expect(m.getIntPart('RH')).toBe(2823);
    expect(m.getIntArrayPart('LH')).not.toBeNull();
    expect(m.getIntArrayPart('LH')).toHaveLength(99);
    expect(m.getIntArrayPart('PL')).toHaveLength(39);
    expect(m.getIntArrayPart('VS')).toEqual([-2, 1, 3, 0]);
    // RH is a scalar, so getIntArrayPart returns null:
    expect(m.getIntArrayPart('RH')).toBeNull();
    expect(m.parts.map((p) => p.key)).toEqual(['RH', 'LH', 'PL', 'VS']);
  });

  it('rejects a truncated array (declared length too long)', () => {
    expect(decode('1084|ga,3,LH,[5,1,2')).toBeNull();
  });
});

describe('SOCPotentialSettlements (1057, multi land areas) — live frame', () => {
  it('round-trips the simple all-players frame', () => {
    const wire = '1057|capTest33539,-1';
    const m = decodeOk(wire) as SOCPotentialSettlements;
    expect(m.type).toBe(MessageType.POTENTIALSETTLEMENTS);
    expect(m.playerNumber).toBe(-1);
    expect(m.psNodes).toEqual([]); // no nodes, no NA -> simple form, empty list
    expect(encode(m)).toBe(wire);
  });

  it('decodes the live 4-land-area frame', () => {
    const wire =
      '1057|capTest33539,-1,NA,4,PAN,1,LA1,2050,1538,2563,LA2,1549,1037,LA3,4108,3596,LA4,4098,3586';
    const m = decodeOk(wire) as SOCPotentialSettlements;
    expect(m.playerNumber).toBe(-1);
    expect(m.areaCount).toBe(4);
    expect(m.startingLandArea).toBe(1);
    expect(m.psNodes).toBeNull(); // no psNodes before NA -> null
    const lan = m.landAreasLegalNodes;
    expect(lan).not.toBeNull();
    expect(lan![0]).toBeNull();
    expect(lan![1]).toEqual([2050, 1538, 2563]);
    expect(lan![2]).toEqual([1549, 1037]);
    expect(lan![4]).toEqual([4098, 3586]);
    // round-trips byte-for-byte
    expect(encode(m)).toBe(wire);
  });

  it('treats a sole psNode 0 as an empty (non-null) list', () => {
    const wire = '1057|ga,2,0,NA,1,PAN,1,LA1,100,200';
    const m = decodeOk(wire) as SOCPotentialSettlements;
    expect(m.psNodes).toEqual([]); // {0} -> empty
    expect(m.landAreasLegalNodes![1]).toEqual([100, 200]);
    expect(encode(m)).toBe(wire);
  });

  it('rejects a frame missing a declared land area', () => {
    // NA=2 but only LA1 defined
    expect(decode('1057|ga,-1,NA,2,PAN,1,LA1,100')).toBeNull();
  });
});
