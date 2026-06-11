// Unit tests for the in-game (Phase 3) store reducers: applyBoardLayout,
// applyPotentialSettlements, applyPutPiece / applyMovePiece, applyPlayerElement
// / applyPlayerElements, applyGameElements, applyDiceResult(+Resources),
// applyTurn / applySetTurn, longest-road / largest-army, and the game log.
// These are pure store actions — no network involved. Message fixtures are
// produced via the real protocol decoder so the wire formats are exercised too.

import { beforeEach, describe, expect, it } from 'vitest';

import {
  decode,
  GameElementType,
  PlayerElementAction,
  PlayerElementType,
  SOCBoardLayout2,
  SOCDiceResult,
  SOCDiceResultResources,
  SOCGameElements,
  SOCMovePiece,
  SOCPlayerElement,
  SOCPlayerElements,
  SOCPotentialSettlements,
  SOCPutPiece,
  SOCSetTurn,
  SOCTurn,
} from '../protocol';
import { PIECE_SETTLEMENT, PIECE_CITY, PIECE_ROAD, PIECE_SHIP } from '../board/types';
import { useGameStore } from './gameStore';

const GAME = 'sea';

/** Start a fresh 4-seat joined game named GAME and seat the local player at 0. */
beforeEach(() => {
  const s = useGameStore.getState();
  s.setStatus('disconnected');
  s.resetLobby();
  s.setNickname('WebPlayer');
  // 4-player default room, local at seat 0; two bots at seats 1 and 2.
  s.joinGameAuth(GAME);
  s.applySitDown(GAME, 0, 'WebPlayer', false);
  s.applySitDown(GAME, 1, 'droid 1', true);
  s.applySitDown(GAME, 2, 'droid 2', true);
});

function cg() {
  const c = useGameStore.getState().currentGame;
  if (c === null) {
    throw new Error('no current game');
  }
  return c;
}

describe('applyBoardLayout (BOARDLAYOUT2)', () => {
  it('decodes the layout into a board model', () => {
    const lh = [0x102, 4, 6, 0x104, 2, 0];
    const pl = [2, 0x203, 4];
    const wire =
      `1084|${GAME},3,LH,[${lh.length},${lh.join(',')},` +
      `PL,[${pl.length},${pl.join(',')},RH,${0x0305},PH,${0x0608}`;
    const msg = decode(wire) as SOCBoardLayout2;

    useGameStore.getState().applyBoardLayout(msg);

    const board = cg().board;
    expect(board).not.toBeNull();
    expect(board?.encoding).toBe(3);
    expect(board?.hexes).toHaveLength(2);
    expect(board?.robberHex).toBe(0x0305);
    expect(board?.pirateHex).toBe(0x0608);
  });

  it('ignores a layout for a different game', () => {
    const wire = `1084|other,3,RH,${0x0305}`;
    useGameStore.getState().applyBoardLayout(decode(wire) as SOCBoardLayout2);
    expect(cg().board).toBeNull();
  });
});

describe('applyPotentialSettlements (POTENTIALSETTLEMENTS)', () => {
  it('stores the player psNodes', () => {
    const msg = new SOCPotentialSettlements(GAME, 0, [0x0204, 0x0206, 0x0408]);
    useGameStore.getState().applyPotentialSettlements(msg);
    expect(cg().potentialNodes).toEqual([0x0204, 0x0206, 0x0408]);
  });

  it('unions land-area legal nodes when psNodes is absent (sea board, pn -1)', () => {
    const lan: Array<number[] | null> = [null, [0x0204, 0x0206], [0x0206, 0x0408]];
    const msg = new SOCPotentialSettlements(GAME, -1, null, 1, lan);
    useGameStore.getState().applyPotentialSettlements(msg);
    // De-duplicated union of both land areas.
    expect(new Set(cg().potentialNodes)).toEqual(new Set([0x0204, 0x0206, 0x0408]));
  });
});

describe('applyPutPiece (PUTPIECE)', () => {
  it('adds a settlement and increments derived VP', () => {
    useGameStore.getState().applyPutPiece(new SOCPutPiece(GAME, 0, PIECE_SETTLEMENT, 0x0204));
    const c = cg();
    expect(c.pieces).toHaveLength(1);
    expect(c.pieces[0]).toEqual({ ptype: PIECE_SETTLEMENT, coord: 0x0204, playerNumber: 0 });
    expect(c.playerViews[0].vp).toBe(1);
  });

  it('adds roads/ships at edges without changing VP', () => {
    useGameStore.getState().applyPutPiece(new SOCPutPiece(GAME, 1, PIECE_ROAD, 0x0305));
    useGameStore.getState().applyPutPiece(new SOCPutPiece(GAME, 1, PIECE_SHIP, 0x0407));
    const c = cg();
    expect(c.pieces).toHaveLength(2);
    expect(c.playerViews[1].vp).toBe(0);
  });

  it('a city upgrade replaces the settlement at that node and is worth 2 VP', () => {
    const s = useGameStore.getState();
    s.applyPutPiece(new SOCPutPiece(GAME, 0, PIECE_SETTLEMENT, 0x0204));
    s.applyPutPiece(new SOCPutPiece(GAME, 0, PIECE_CITY, 0x0204));
    const c = cg();
    // Only the city remains at that node (settlement removed).
    const atNode = c.pieces.filter((p) => p.coord === 0x0204);
    expect(atNode).toHaveLength(1);
    expect(atNode[0].ptype).toBe(PIECE_CITY);
    expect(c.playerViews[0].vp).toBe(2);
  });
});

describe('applyMovePiece (MOVEPIECE)', () => {
  it('moves a ship from one edge to another', () => {
    const s = useGameStore.getState();
    s.applyPutPiece(new SOCPutPiece(GAME, 2, PIECE_SHIP, 0x0305));
    s.applyMovePiece(new SOCMovePiece(GAME, 2, PIECE_SHIP, 0x0305, 0x0509));
    const c = cg();
    expect(c.pieces).toHaveLength(1);
    expect(c.pieces[0]).toEqual({ ptype: PIECE_SHIP, coord: 0x0509, playerNumber: 2 });
  });

  it('does not move a non-matching ship', () => {
    const s = useGameStore.getState();
    s.applyPutPiece(new SOCPutPiece(GAME, 2, PIECE_SHIP, 0x0305));
    // Wrong owner -> no move.
    s.applyMovePiece(new SOCMovePiece(GAME, 1, PIECE_SHIP, 0x0305, 0x0509));
    expect(cg().pieces[0].coord).toBe(0x0305);
  });
});

describe('applyPlayerElement (PLAYERELEMENT)', () => {
  it('SET/GAIN/LOSE a resource updates the breakdown and total', () => {
    const s = useGameStore.getState();
    s.applyPlayerElement(
      new SOCPlayerElement(GAME, 0, PlayerElementAction.SET, PlayerElementType.WHEAT, 3),
    );
    s.applyPlayerElement(
      new SOCPlayerElement(GAME, 0, PlayerElementAction.GAIN, PlayerElementType.WHEAT, 2),
    );
    s.applyPlayerElement(
      new SOCPlayerElement(GAME, 0, PlayerElementAction.LOSE, PlayerElementType.WHEAT, 1),
    );
    const v = cg().playerViews[0];
    expect(v.resources.wheat).toBe(4);
    expect(v.resourceTotal).toBe(4);
  });

  it('LOSE clamps at zero', () => {
    useGameStore.getState().applyPlayerElement(
      new SOCPlayerElement(GAME, 0, PlayerElementAction.LOSE, PlayerElementType.CLAY, 5),
    );
    expect(cg().playerViews[0].resources.clay).toBe(0);
  });

  it('RESOURCE_COUNT sets the authoritative total for an opponent', () => {
    useGameStore.getState().applyPlayerElement(
      new SOCPlayerElement(GAME, 1, PlayerElementAction.SET, PlayerElementType.RESOURCE_COUNT, 7),
    );
    const v = cg().playerViews[1];
    expect(v.resourceTotal).toBe(7);
    // No per-resource breakdown for opponents.
    expect(v.resources).toEqual({ clay: 0, ore: 0, sheep: 0, wheat: 0, wood: 0 });
  });

  it('updates piece-supply counts and knights', () => {
    const s = useGameStore.getState();
    s.applyPlayerElement(
      new SOCPlayerElement(GAME, 0, PlayerElementAction.SET, PlayerElementType.ROADS, 13),
    );
    s.applyPlayerElement(
      new SOCPlayerElement(GAME, 0, PlayerElementAction.GAIN, PlayerElementType.NUMKNIGHTS, 1),
    );
    const v = cg().playerViews[0];
    expect(v.roads).toBe(13);
    expect(v.knights).toBe(1);
  });
});

describe('applyPlayerElements (PLAYERELEMENTS, multi)', () => {
  it('applies a batch of element changes for one player', () => {
    const msg = new SOCPlayerElements(
      GAME,
      0,
      PlayerElementAction.SET,
      [PlayerElementType.CLAY, PlayerElementType.ORE, PlayerElementType.SHEEP],
      [1, 0, 2],
    );
    useGameStore.getState().applyPlayerElements(msg);
    const v = cg().playerViews[0];
    expect(v.resources).toEqual({ clay: 1, ore: 0, sheep: 2, wheat: 0, wood: 0 });
    expect(v.resourceTotal).toBe(3);
  });

  it('decodes from the wire and applies (GAIN)', () => {
    // 1086|game|pn|action|et0|amt0|et1|amt1
    const wire = `1086|${GAME}|0|${PlayerElementAction.GAIN}|${PlayerElementType.WOOD}|2|${PlayerElementType.WHEAT}|1`;
    useGameStore.getState().applyPlayerElements(decode(wire) as SOCPlayerElements);
    const v = cg().playerViews[0];
    expect(v.resources.wood).toBe(2);
    expect(v.resources.wheat).toBe(1);
    expect(v.resourceTotal).toBe(3);
  });
});

describe('applyGameElements (GAMEELEMENTS, multi)', () => {
  it('sets current player and dev-card deck count', () => {
    const msg = new SOCGameElements(
      GAME,
      [GameElementType.CURRENT_PLAYER, GameElementType.DEV_CARD_COUNT],
      [2, 23],
    );
    useGameStore.getState().applyGameElements(msg);
    const c = cg();
    expect(c.currentPlayerNumber).toBe(2);
    expect(c.deckDevCardCount).toBe(23);
  });

  it('assigns longest-road / largest-army exclusively and grants +2 VP', () => {
    const s = useGameStore.getState();
    // Give seat 1 two settlements first (2 VP), then award Longest Road -> 4.
    s.applyPutPiece(new SOCPutPiece(GAME, 1, PIECE_SETTLEMENT, 0x0204));
    s.applyPutPiece(new SOCPutPiece(GAME, 1, PIECE_SETTLEMENT, 0x0408));
    s.applyGameElements(
      new SOCGameElements(GAME, [GameElementType.LONGEST_ROAD_PLAYER], [1]),
    );
    let c = cg();
    expect(c.playerViews[1].longestRoad).toBe(true);
    expect(c.playerViews[1].vp).toBe(4);

    // Reassign Longest Road to seat 2: seat 1 loses the flag and the 2 VP.
    s.applyGameElements(
      new SOCGameElements(GAME, [GameElementType.LONGEST_ROAD_PLAYER], [2]),
    );
    c = cg();
    expect(c.playerViews[1].longestRoad).toBe(false);
    expect(c.playerViews[1].vp).toBe(2);
    expect(c.playerViews[2].longestRoad).toBe(true);
  });

  it('clears an award when set to -1', () => {
    const s = useGameStore.getState();
    s.applyGameElements(new SOCGameElements(GAME, [GameElementType.LARGEST_ARMY_PLAYER], [0]));
    expect(cg().playerViews[0].largestArmy).toBe(true);
    s.applyGameElements(new SOCGameElements(GAME, [GameElementType.LARGEST_ARMY_PLAYER], [-1]));
    expect(cg().playerViews[0].largestArmy).toBe(false);
  });
});

describe('applyDiceResult (DICERESULT) and resources', () => {
  it('records a positive total and clears on -1', () => {
    const s = useGameStore.getState();
    s.applyDiceResult(new SOCDiceResult(GAME, 8));
    expect(cg().lastDice).toEqual({ d1: 0, d2: 0, total: 8 });
    s.applyDiceResult(new SOCDiceResult(GAME, -1));
    expect(cg().lastDice).toBeNull();
  });

  it('DICERESULTRESOURCES sets per-player authoritative totals', () => {
    const players = [
      { playerNumber: 0, total: 5, resources: [{ type: 1 as const, amount: 3 }] },
      { playerNumber: 2, total: 7, resources: [{ type: 5 as const, amount: 1 }] },
    ];
    useGameStore.getState().applyDiceResultResources(
      new SOCDiceResultResources(GAME, players),
    );
    const c = cg();
    expect(c.playerViews[0].resourceTotal).toBe(5);
    expect(c.playerViews[2].resourceTotal).toBe(7);
  });
});

describe('applyTurn / applySetTurn (TURN / SETTURN)', () => {
  it('TURN sets current player and new state, and clears the dice', () => {
    const s = useGameStore.getState();
    s.applyDiceResult(new SOCDiceResult(GAME, 6));
    s.applyTurn(new SOCTurn(GAME, 2, 15 /* ROLL_OR_CARD */));
    const c = cg();
    expect(c.currentPlayerNumber).toBe(2);
    expect(c.gameState).toBe(15);
    expect(c.lastDice).toBeNull();
  });

  it('TURN without a state keeps the existing game state', () => {
    const s = useGameStore.getState();
    s.setGameState(GAME, 20);
    s.applyTurn(new SOCTurn(GAME, 1));
    const c = cg();
    expect(c.currentPlayerNumber).toBe(1);
    expect(c.gameState).toBe(20);
  });

  it('SETTURN sets only the current player', () => {
    useGameStore.getState().applySetTurn(new SOCSetTurn(GAME, 3));
    expect(cg().currentPlayerNumber).toBe(3);
  });
});

describe('game log', () => {
  it('appends lines and ignores empties', () => {
    const s = useGameStore.getState();
    s.appendGameLog(GAME, 'It is your turn.');
    s.appendGameLog(GAME, '');
    s.appendGameLog(GAME, 'droid 1 rolled a 7.');
    expect(cg().gameLog.map((l) => l.text)).toEqual([
      'It is your turn.',
      'droid 1 rolled a 7.',
    ]);
    // Announcement lines are kind 'server' (player chat is 'chat').
    expect(cg().gameLog.every((l) => l.kind === 'server')).toBe(true);
  });

  it('ignores log lines for a different game', () => {
    useGameStore.getState().appendGameLog('other', 'nope');
    expect(cg().gameLog).toEqual([]);
  });
});
