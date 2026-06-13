// Unit tests for the in-game interaction (Phase 4) store reducers: trade offers
// (MAKEOFFER / CLEAROFFER / REJECTOFFER / CLEARTRADEMSG / ACCEPTOFFER), the
// local dev-card inventory (DEVCARDACTION DRAW/PLAY/ADD), the robber move
// (MOVEROBBER), the choose-player prompt (CHOOSEPLAYERREQUEST), the discard
// requirement (DISCARDREQUEST), and game over (GAMESTATE OVER + GAMESTATS).
// These are pure store actions — no network involved. Where useful, message
// fixtures are produced via the real protocol decoder so wire formats are
// exercised too.

import { beforeEach, describe, expect, it } from 'vitest';

import {
  decode,
  DevCardAction,
  DevCardType,
  GameState,
  GameStatsType,
  PlayerElementAction,
  PlayerElementType,
  Resource,
  SOCAcceptOffer,
  SOCBoardLayout2,
  SOCChoosePlayerRequest,
  SOCDevCardAction,
  SOCGameStats,
  SOCMakeOffer,
  SOCMoveRobber,
  SOCPlayerElement,
  SOCRobberyResult,
  SOCTurn,
} from '../protocol';
import { resourceSet } from '../protocol';
import { inventorySize, useGameStore } from './gameStore';

const GAME = 'sea';

/** Start a fresh 4-seat joined game named GAME and seat the local player at 0. */
beforeEach(() => {
  const s = useGameStore.getState();
  s.setStatus('disconnected');
  s.resetLobby();
  s.setNickname('WebPlayer');
  s.joinGameAuth(GAME);
  s.applySitDown(GAME, 0, 'WebPlayer', false);
  s.applySitDown(GAME, 1, 'droid 1', true);
  s.applySitDown(GAME, 2, 'droid 2', true);
  s.applySitDown(GAME, 3, 'droid 3', true);
});

function cg() {
  const c = useGameStore.getState().currentGame;
  if (c === null) {
    throw new Error('no current game');
  }
  return c;
}

describe('trade offers (MAKEOFFER / CLEAROFFER / REJECTOFFER / ACCEPTOFFER)', () => {
  it('records a seat\'s offer and clears responses for that seat', () => {
    const offer = {
      from: 3,
      to: [false, false, false, true],
      give: resourceSet(0, 0, 0, 1, 0),
      get: resourceSet(0, 1, 0, 0, 0),
    };
    useGameStore.getState().applyMakeOffer(new SOCMakeOffer(GAME, offer));
    const c = cg();
    expect(c.offers[3]).not.toBeNull();
    expect(c.offers[3]?.give.wheat).toBe(1);
    expect(c.offers[3]?.get.ore).toBe(1);
    expect(c.offerResponses[3]).toBeNull();
  });

  it('decodes a MAKEOFFER from the wire and stores it', () => {
    const wire = `1041|${GAME},3,false,false,true,false,0,1,0,1,0,0,0,1,0,0`;
    useGameStore.getState().applyMakeOffer(decode(wire) as SOCMakeOffer);
    const c = cg();
    expect(c.offers[3]).not.toBeNull();
    expect(c.offers[3]?.to).toEqual([false, false, true, false]);
  });

  it('REJECTOFFER marks the rejecting seat; CLEAROFFER(-1) clears all', () => {
    const s = useGameStore.getState();
    s.applyMakeOffer(
      new SOCMakeOffer(GAME, {
        from: 0,
        to: [false, true, true, true],
        give: resourceSet(1, 0, 0, 0, 0),
        get: resourceSet(0, 0, 1, 0, 0),
      }),
    );
    s.applyRejectOffer(GAME, 2);
    expect(cg().offerResponses[2]).toBe('reject');
    s.applyClearOffer(GAME, -1);
    expect(cg().offers.every((o) => o === null)).toBe(true);
    expect(cg().offerResponses.every((r) => r === null)).toBe(true);
  });

  it('ACCEPTOFFER clears the offering seat\'s offer and logs the trade', () => {
    const s = useGameStore.getState();
    s.applyMakeOffer(
      new SOCMakeOffer(GAME, {
        from: 3,
        to: [true, false, false, false],
        give: resourceSet(0, 0, 0, 1, 0),
        get: resourceSet(0, 1, 0, 0, 0),
      }),
    );
    s.applyAcceptOffer(
      new SOCAcceptOffer(
        GAME,
        0,
        3,
        resourceSet(0, 0, 0, 1, 0),
        resourceSet(0, 1, 0, 0, 0),
      ),
    );
    const c = cg();
    expect(c.offers[3]).toBeNull();
    expect(c.gameLog.some((l) => l.text.includes('accepted'))).toBe(true);
  });

  it('CLEARTRADEMSG clears responses but not the offers themselves', () => {
    const s = useGameStore.getState();
    s.applyMakeOffer(
      new SOCMakeOffer(GAME, {
        from: 0,
        to: [false, true, false, false],
        give: resourceSet(1, 0, 0, 0, 0),
        get: resourceSet(0, 0, 0, 0, 1),
      }),
    );
    s.applyRejectOffer(GAME, 1);
    s.applyClearTradeMsg(GAME, -1);
    expect(cg().offerResponses.every((r) => r === null)).toBe(true);
    expect(cg().offers[0]).not.toBeNull();
  });
});

describe('dev-card inventory (DEVCARDACTION)', () => {
  it('DRAW adds a new (un-playable) card for the local player', () => {
    // DRAW knight to my seat (0).
    useGameStore.getState().applyDevCardAction(
      new SOCDevCardAction(GAME, 0, DevCardAction.DRAW, DevCardType.KNIGHT),
    );
    const inv = cg().myInventory;
    expect(inv.newCards[DevCardType.KNIGHT]).toBe(1);
    expect(inv.playable[DevCardType.KNIGHT] ?? 0).toBe(0);
    expect(inventorySize(inv)).toBe(1);
    // My per-seat dev-card count went up too.
    expect(cg().playerViews[0].devCardCount).toBe(1);
  });

  it('ADD_OLD makes a card playable; PLAY removes it', () => {
    const s = useGameStore.getState();
    s.applyDevCardAction(new SOCDevCardAction(GAME, 0, DevCardAction.ADD_OLD, DevCardType.MONO));
    expect(cg().myInventory.playable[DevCardType.MONO]).toBe(1);
    s.applyDevCardAction(new SOCDevCardAction(GAME, 0, DevCardAction.PLAY, DevCardType.MONO));
    expect(cg().myInventory.playable[DevCardType.MONO] ?? 0).toBe(0);
    expect(inventorySize(cg().myInventory)).toBe(0);
  });

  it('an opponent\'s UNKNOWN draw updates only their count, not my inventory', () => {
    // Opponent (seat 1) draws an UNKNOWN card.
    useGameStore.getState().applyDevCardAction(
      new SOCDevCardAction(GAME, 1, DevCardAction.DRAW, DevCardType.UNKNOWN),
    );
    expect(inventorySize(cg().myInventory)).toBe(0);
    expect(cg().playerViews[1].devCardCount).toBe(1);
  });

  it('a VP card goes to the vpCards bag', () => {
    useGameStore.getState().applyDevCardAction(
      new SOCDevCardAction(GAME, 0, DevCardAction.DRAW, DevCardType.UNIV),
    );
    expect(cg().myInventory.vpCards[DevCardType.UNIV]).toBe(1);
    expect(cg().myInventory.newCards[DevCardType.UNIV] ?? 0).toBe(0);
  });
});

describe('new-to-playable transition at turn start (SOCTurn / newToOld)', () => {
  it('a card drawn this turn becomes playable at the start of my next turn', () => {
    const s = useGameStore.getState();
    // DRAW a Knight to my seat (0): it's new (not yet playable).
    s.applyDevCardAction(new SOCDevCardAction(GAME, 0, DevCardAction.DRAW, DevCardType.KNIGHT));
    expect(cg().myInventory.newCards[DevCardType.KNIGHT]).toBe(1);
    expect(cg().myInventory.playable[DevCardType.KNIGHT] ?? 0).toBe(0);

    // A turn announced for MY seat folds new cards into playable (mirrors
    // SOCInventory.newToOld via SOCGame.updateAtTurn / SOCPlayer.updateAtOurTurn).
    s.applyTurn(new SOCTurn(GAME, 0, GameState.ROLL_OR_CARD));
    const inv = cg().myInventory;
    expect(inv.playable[DevCardType.KNIGHT]).toBe(1);
    expect(inv.newCards[DevCardType.KNIGHT] ?? 0).toBe(0);
  });

  it("a turn for a different seat does NOT promote my new cards", () => {
    const s = useGameStore.getState();
    s.applyDevCardAction(new SOCDevCardAction(GAME, 0, DevCardAction.DRAW, DevCardType.KNIGHT));
    // Turn passes to seat 1 (a bot): my new card stays new.
    s.applyTurn(new SOCTurn(GAME, 1, GameState.ROLL_OR_CARD));
    const inv = cg().myInventory;
    expect(inv.newCards[DevCardType.KNIGHT]).toBe(1);
    expect(inv.playable[DevCardType.KNIGHT] ?? 0).toBe(0);
  });

  it('VP cards drawn this turn are unaffected by the turn-start flip', () => {
    const s = useGameStore.getState();
    s.applyDevCardAction(new SOCDevCardAction(GAME, 0, DevCardAction.DRAW, DevCardType.UNIV));
    s.applyTurn(new SOCTurn(GAME, 0, GameState.ROLL_OR_CARD));
    const inv = cg().myInventory;
    expect(inv.vpCards[DevCardType.UNIV]).toBe(1);
    expect(inv.playable[DevCardType.UNIV] ?? 0).toBe(0);
    expect(inv.newCards[DevCardType.UNIV] ?? 0).toBe(0);
  });
});

describe('played-dev-card flag (PLAYED_DEV_CARD_FLAG / SETPLAYEDDEVCARD)', () => {
  it('SOCPlayerElement(PLAYED_DEV_CARD_FLAG) SET 1 sets the flag; SOCTurn clears it', () => {
    const s = useGameStore.getState();
    expect(cg().playerViews[0].playedDevCard).toBe(false);

    s.applyPlayerElement(
      new SOCPlayerElement(
        GAME,
        0,
        PlayerElementAction.SET,
        PlayerElementType.PLAYED_DEV_CARD_FLAG,
        1,
      ),
    );
    expect(cg().playerViews[0].playedDevCard).toBe(true);

    // The modern server folds the per-turn flag-clear into SOCTurn (no SET-to-0
    // PLAYERELEMENT is sent for v2.5.00+ clients), so applyTurn must clear it.
    s.applyTurn(new SOCTurn(GAME, 0, GameState.ROLL_OR_CARD));
    expect(cg().playerViews[0].playedDevCard).toBe(false);
  });

  it('a SET-to-0 PLAYERELEMENT also clears the flag (e.g. road-building cancel)', () => {
    const s = useGameStore.getState();
    s.applyPlayerElement(
      new SOCPlayerElement(GAME, 0, PlayerElementAction.SET, PlayerElementType.PLAYED_DEV_CARD_FLAG, 1),
    );
    expect(cg().playerViews[0].playedDevCard).toBe(true);
    s.applyPlayerElement(
      new SOCPlayerElement(GAME, 0, PlayerElementAction.SET, PlayerElementType.PLAYED_DEV_CARD_FLAG, 0),
    );
    expect(cg().playerViews[0].playedDevCard).toBe(false);
  });

  it('the legacy SOCSetPlayedDevCard message sets/clears the flag', () => {
    const s = useGameStore.getState();
    s.applySetPlayedDevCard(GAME, 1, true);
    expect(cg().playerViews[1].playedDevCard).toBe(true);
    s.applySetPlayedDevCard(GAME, 1, false);
    expect(cg().playerViews[1].playedDevCard).toBe(false);
  });
});

describe('plain trade reject (REJECTOFFER reasonCode 0)', () => {
  it('records a seat response for a plain "no thanks"', () => {
    const s = useGameStore.getState();
    s.applyRejectOffer(GAME, 2);
    expect(cg().offerResponses[2]).toBe('reject');
  });
});

describe('robber move (MOVEROBBER)', () => {
  beforeEach(() => {
    // A minimal board so applyMoveRobber has something to update.
    const lh = [0x0102, 4, 6, 0x0104, 2, 8];
    const wire = `1084|${GAME},3,LH,[${lh.length},${lh.join(',')},RH,${0x0305}`;
    useGameStore.getState().applyBoardLayout(decode(wire) as SOCBoardLayout2);
  });

  it('a positive coord moves the robber hex', () => {
    useGameStore.getState().applyMoveRobber(new SOCMoveRobber(GAME, 0, 0x0104));
    expect(cg().board?.robberHex).toBe(0x0104);
  });

  it('a negative coord moves the pirate hex (stored as abs)', () => {
    useGameStore.getState().applyMoveRobber(new SOCMoveRobber(GAME, 0, -0x0306));
    expect(cg().board?.pirateHex).toBe(0x0306);
  });

  it('logs a robbery result', () => {
    useGameStore.getState().applyRobberyResult(
      new SOCRobberyResult(GAME, 0, 2, { kind: 'res', resType: Resource.SHEEP }, true, 1),
    );
    expect(cg().gameLog.some((l) => l.text.includes('robbed') && l.text.includes('sheep'))).toBe(true);
  });

  it('applies robbery resource gain/loss to the local hand and opponent total', () => {
    const s = useGameStore.getState();
    s.applyPlayerElement(new SOCPlayerElement(GAME, 0, PlayerElementAction.SET, PlayerElementType.SHEEP, 2));
    s.applyPlayerElement(new SOCPlayerElement(GAME, 2, PlayerElementAction.SET, PlayerElementType.RESOURCE_COUNT, 5));

    s.applyRobberyResult(
      new SOCRobberyResult(GAME, 0, 2, { kind: 'res', resType: Resource.SHEEP }, true, 1),
    );

    expect(cg().playerViews[0].resources.sheep).toBe(3);
    expect(cg().playerViews[0].resourceTotal).toBe(3);
    expect(cg().playerViews[2].resourceTotal).toBe(4);
    expect(useGameStore.getState().notice).toContain('robbed 1 sheep');
  });

  it('applies robbery resource-set loss to the local hand', () => {
    const s = useGameStore.getState();
    s.applyPlayerElement(new SOCPlayerElement(GAME, 0, PlayerElementAction.SET, PlayerElementType.CLAY, 2));
    s.applyPlayerElement(new SOCPlayerElement(GAME, 0, PlayerElementAction.SET, PlayerElementType.WOOD, 2));
    s.applyPlayerElement(new SOCPlayerElement(GAME, 1, PlayerElementAction.SET, PlayerElementType.RESOURCE_COUNT, 1));

    s.applyRobberyResult(
      new SOCRobberyResult(GAME, 1, 0, { kind: 'resSet', resSet: resourceSet(1, 0, 0, 0, 1) }, true),
    );

    expect(cg().playerViews[0].resources.clay).toBe(1);
    expect(cg().playerViews[0].resources.wood).toBe(1);
    expect(cg().playerViews[0].resourceTotal).toBe(2);
    expect(cg().playerViews[1].resourceTotal).toBe(3);
  });
});

describe('choose-player + discard requirements', () => {
  it('CHOOSEPLAYERREQUEST yields the candidate victim seats', () => {
    useGameStore.getState().applyChoosePlayerRequest(
      new SOCChoosePlayerRequest(GAME, [false, true, false, true]),
    );
    expect(cg().robVictims).toEqual([1, 3]);
    expect(cg().robCanChooseNone).toBe(false);
  });

  it('DISCARDREQUEST sets the required count; leaving WAITING_FOR_DISCARDS clears it', () => {
    const s = useGameStore.getState();
    s.setGameState(GAME, GameState.WAITING_FOR_DISCARDS);
    s.applyDiscardRequest(GAME, 4);
    expect(cg().discardRequired).toBe(4);
    // Moving past discards (e.g. into PLACING_ROBBER) clears the requirement.
    s.setGameState(GAME, GameState.PLACING_ROBBER);
    expect(cg().discardRequired).toBe(0);
  });
});

describe('game over (GAMESTATE OVER + GAMESTATS)', () => {
  it('records the winner from the current player at the OVER transition', () => {
    const s = useGameStore.getState();
    // Seat 2 is current when the game ends.
    s.applySetTurn(decodeSetTurn(2));
    s.setGameState(GAME, GameState.OVER);
    expect(cg().gameState).toBe(GameState.OVER);
    expect(cg().winnerPlayerNumber).toBe(2);
  });

  it('GAMESTATS (TYPE_PLAYERS) records final scores', () => {
    const s = useGameStore.getState();
    s.applySetTurn(decodeSetTurn(2));
    s.setGameState(GAME, GameState.OVER);
    s.applyGameStats(
      new SOCGameStats(GAME, GameStatsType.TYPE_PLAYERS, [3, 5, 10, 7], [false, true, true, true]),
    );
    expect(cg().finalScores).toEqual([3, 5, 10, 7]);
    expect(cg().winnerPlayerNumber).toBe(2);
  });

  it('GAMESTATS picks the highest score as winner when none was known', () => {
    useGameStore.getState().applyGameStats(
      new SOCGameStats(GAME, GameStatsType.TYPE_PLAYERS, [2, 10, 4, 8], [false, false, true, true]),
    );
    expect(cg().winnerPlayerNumber).toBe(1);
  });
});

/** Helper: build a SOCSetTurn to set the current player without a network. */
function decodeSetTurn(pn: number): import('../protocol').SOCSetTurn {
  return decode(`1055|${GAME},${pn}`) as import('../protocol').SOCSetTurn;
}
