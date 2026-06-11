// Unit tests for the Cities & Knights store slice: commodity / knight player
// elements, improvement-track special items, barbarian strength + attack
// results, metropolis owners, Defender of Catan, the progress-card hand
// (draw/play/hidden counts/VP reveals), the city-downgrade REMOVEPIECE, the
// pending C&K monopoly pick, and the isCKGame flag — plus every C&K action
// sender's encoded wire output and the connectStore() handler wiring (driven
// through a mock global WebSocket, following gameChat.test.ts).
//
// Rules + wire contract: doc/Cities-and-Knights-Implemented.md (with the
// correction that a hidden draw is announced as ADD_PLAYABLE itemType 0).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  decode,
  CKProgressCard,
  GameElementType,
  GameState,
  InventoryItemAction,
  PieceTypeConst,
  PlayerElementAction,
  PlayerElementType,
  SEP,
  SEP2,
  SOCGameElements,
  SOCInventoryItemAction,
  SOCPlayerElement,
  SOCPlayerElements,
  SOCPutPiece,
  SOCRemovePiece,
  SOCSetSpecialItem,
  SOCTurn,
  SpecialItemOp,
} from '../protocol';
import { PIECE_SETTLEMENT, PIECE_CITY } from '../board/types';
import {
  ckActivateKnight,
  ckBuyImprovement,
  ckBuyKnight,
  ckPlayProgressCard,
  ckPromoteKnight,
  connectStore,
  disconnectStore,
  isCKGameOptions,
  pickMonopoly,
  useGameStore,
} from './gameStore';

const GAME = 'ck';

/** The SC_CK scenario's packed option string (doc "Scenario"). */
const CK_OPTS = '_SC_CK=t,_CK_IMP=t,_CK_KNI=t,_CK_PROG=t,_CK_BARB=t,_CK_METR=t,SBL=t,VP=t13';

/** Seed a joined 4-seat C&K game named GAME with the local player at seat 0. */
function seedGame(): void {
  const s = useGameStore.getState();
  s.setNickname('WebPlayer');
  s.setGames([{ name: GAME, options: CK_OPTS, started: false }]);
  s.joinGameAuth(GAME);
  s.applySitDown(GAME, 0, 'WebPlayer', false);
  s.applySitDown(GAME, 1, 'droid 1', true);
  s.applySitDown(GAME, 2, 'droid 2', true);
}

function cg() {
  const c = useGameStore.getState().currentGame;
  if (c === null) {
    throw new Error('no current game');
  }
  return c;
}

// ---------------------------------------------------------------------------
// Pure reducer tests (no network).
// ---------------------------------------------------------------------------

beforeEach(() => {
  const s = useGameStore.getState();
  s.setStatus('disconnected');
  s.resetLobby();
  seedGame();
});

describe('isCKGame flag', () => {
  it('is true when the joined game has the _SC_CK / _CK_IMP options', () => {
    expect(cg().isCKGame).toBe(true);
    expect(isCKGameOptions(CK_OPTS)).toBe(true);
    expect(isCKGameOptions('_CK_IMP=t,SBL=t')).toBe(true);
    expect(isCKGameOptions('BC=t4,PL=4,SBL=t')).toBe(false);
  });

  it('is false for a plain game', () => {
    const s = useGameStore.getState();
    s.clearCurrentGame(GAME);
    s.setGames([{ name: 'plain', options: 'BC=t4,PL=4', started: false }]);
    s.joinGameAuth('plain');
    expect(cg().isCKGame).toBe(false);
  });
});

describe('commodity player elements (PETypes 110-112)', () => {
  it('honors SET / GAIN / LOSE through a wire-decoded PLAYERELEMENT', () => {
    const s = useGameStore.getState();
    s.applyPlayerElement(
      new SOCPlayerElement(GAME, 0, PlayerElementAction.SET, PlayerElementType.CK_CLOTH_COUNT, 3),
    );
    expect(cg().playerViews[0].ck.commodities.cloth).toBe(3);

    // GAIN on production, decoded from the wire (1024|game,pn,action,etype,amount).
    s.applyPlayerElement(
      decode(`1024|${GAME},0,101,111,2`) as SOCPlayerElement,
    );
    expect(cg().playerViews[0].ck.commodities.coin).toBe(2);

    s.applyPlayerElement(
      new SOCPlayerElement(GAME, 0, PlayerElementAction.LOSE, PlayerElementType.CK_COIN_COUNT, 1),
    );
    expect(cg().playerViews[0].ck.commodities.coin).toBe(1);
    // LOSE clamps at 0.
    s.applyPlayerElement(
      new SOCPlayerElement(GAME, 0, PlayerElementAction.LOSE, PlayerElementType.CK_PAPER_COUNT, 5),
    );
    expect(cg().playerViews[0].ck.commodities.paper).toBe(0);
  });

  it('applies a PLAYERELEMENTS batch (city production: 1 ore + 1 coin)', () => {
    useGameStore.getState().applyPlayerElements(
      new SOCPlayerElements(
        GAME,
        1,
        PlayerElementAction.GAIN,
        [PlayerElementType.ORE, PlayerElementType.CK_COIN_COUNT],
        [1, 1],
      ),
    );
    const v = cg().playerViews[1];
    expect(v.resources.ore).toBe(1);
    expect(v.ck.commodities.coin).toBe(1);
  });
});

describe('knight player elements (PETypes 113-118, SET)', () => {
  it('sets totals and active counts per level', () => {
    useGameStore.getState().applyPlayerElements(
      new SOCPlayerElements(
        GAME,
        0,
        PlayerElementAction.SET,
        [
          PlayerElementType.CK_KNIGHTS_LV1,
          PlayerElementType.CK_KNIGHTS_LV2,
          PlayerElementType.CK_KNIGHTS_LV3,
          PlayerElementType.CK_KNIGHTS_ACTIVE_LV1,
          PlayerElementType.CK_KNIGHTS_ACTIVE_LV2,
          PlayerElementType.CK_KNIGHTS_ACTIVE_LV3,
        ],
        [2, 1, 0, 1, 1, 0],
      ),
    );
    expect(cg().playerViews[0].ck.knights).toEqual({
      lv1: 2,
      lv2: 1,
      lv3: 0,
      activeLv1: 1,
      activeLv2: 1,
      activeLv3: 0,
    });
  });
});

describe('applySetSpecialItem (improvement tracks)', () => {
  it('OP_SET_PICK stores the new level for the message playerNumber', () => {
    // Server reply to a purchase: pn=1, level=2, pi=0 (wire-decoded).
    const msg = decode(`1099|${GAME},5,_CK_IMP/T,-1,0,1,-1,2,\t`) as SOCSetSpecialItem;
    useGameStore.getState().applySetSpecialItem(msg);
    expect(cg().playerViews[1].ck.improvements.trade).toBe(2);
    expect(cg().playerViews[1].ck.improvements.politics).toBe(0);
  });

  it('OP_SET (join-time sync) stores levels per track', () => {
    const s = useGameStore.getState();
    s.applySetSpecialItem(
      new SOCSetSpecialItem(GAME, SpecialItemOp.OP_SET, '_CK_IMP/P', -1, 0, 2, -1, 3),
    );
    s.applySetSpecialItem(
      new SOCSetSpecialItem(GAME, SpecialItemOp.OP_SET, '_CK_IMP/S', -1, 0, 2, -1, 1),
    );
    expect(cg().playerViews[2].ck.improvements).toEqual({
      trade: 0,
      politics: 3,
      science: 1,
    });
  });

  it('OP_DECLINE surfaces an error (toasted) and a log line', () => {
    const msg = decode(`1099|${GAME},4,_CK_IMP/S,-1,0,-1,-1,0,\t`) as SOCSetSpecialItem;
    useGameStore.getState().applySetSpecialItem(msg);
    expect(useGameStore.getState().error).toMatch(/city improvement/i);
    expect(cg().gameLog.at(-1)?.text).toMatch(/city improvement/i);
  });

  it('ignores non-C&K typeKeys (e.g. SC_WOND wonders)', () => {
    useGameStore.getState().applySetSpecialItem(
      new SOCSetSpecialItem(GAME, SpecialItemOp.OP_SET, '_SC_WOND', 1, 0, 1, -1, 4),
    );
    expect(cg().playerViews[1].ck.improvements).toEqual({
      trade: 0,
      politics: 0,
      science: 0,
    });
  });
});

describe('barbarian strength (GEType 11)', () => {
  it('updates from GAMEELEMENTS', () => {
    useGameStore.getState().applyGameElements(
      new SOCGameElements(GAME, [GameElementType.CK_BARBARIAN_STRENGTH], [5]),
    );
    expect(cg().ckBarbarianStrength).toBe(5);
  });
});

describe('applyCkBarbarianAttack', () => {
  it('records the attack, resets the counter, and logs the result', () => {
    const s = useGameStore.getState();
    s.applyGameElements(
      new SOCGameElements(GAME, [GameElementType.CK_BARBARIAN_STRENGTH], [7]),
    );
    s.applyCkBarbarianAttack(GAME, 3, 4);
    const c = cg();
    expect(c.lastBarbarianAttack).toEqual({
      strength: 3,
      defense: 4,
      defendersWon: true,
      seq: 1,
    });
    expect(c.ckBarbarianStrength).toBe(0);
    expect(c.gameLog.at(-1)?.text).toMatch(/defenders won/);

    // A second attack increments seq; defense < strength = defenders lost.
    s.applyCkBarbarianAttack(GAME, 5, 2);
    expect(cg().lastBarbarianAttack?.seq).toBe(2);
    expect(cg().lastBarbarianAttack?.defendersWon).toBe(false);
    expect(cg().gameLog.at(-1)?.text).toMatch(/defenders lost/);
  });
});

describe('applyCkMetropolis', () => {
  it('records the owner per track and logs the claim', () => {
    const s = useGameStore.getState();
    s.applyCkMetropolis(GAME, 0, 1);
    s.applyCkMetropolis(GAME, 2, 0);
    expect(cg().ckMetropolisOwners).toEqual([1, -1, 0]);
    expect(cg().gameLog.at(-1)?.text).toContain('WebPlayer claimed the Science metropolis');

    // A steal replaces the owner.
    s.applyCkMetropolis(GAME, 0, 2);
    expect(cg().ckMetropolisOwners).toEqual([2, -1, 0]);
  });

  it('ignores out-of-range tracks', () => {
    useGameStore.getState().applyCkMetropolis(GAME, 3, 1);
    expect(cg().ckMetropolisOwners).toEqual([-1, -1, -1]);
  });
});

describe('applyCkDefenderOfCatan', () => {
  it('sets a notice (toast) and logs the award', () => {
    useGameStore.getState().applyCkDefenderOfCatan(GAME, 1, 2);
    expect(useGameStore.getState().notice).toContain('droid 1 is the Defender of Catan');
    expect(cg().gameLog.at(-1)?.text).toContain('now 2');
  });
});

describe('applyInventoryItemAction (progress cards)', () => {
  it('ADD_PLAYABLE with a real itype adds to MY hand and my count', () => {
    useGameStore.getState().applyInventoryItemAction(
      new SOCInventoryItemAction(GAME, 0, InventoryItemAction.ADD_PLAYABLE, CKProgressCard.WARLORD),
    );
    expect(cg().myProgressHand).toEqual([CKProgressCard.WARLORD]);
    expect(cg().playerViews[0].ck.progressCards).toBe(1);
  });

  it('ADD_PLAYABLE with itemType 0 increments another player\'s hidden count', () => {
    // The hidden-draw announcement (corrected contract: ADD_PLAYABLE, not
    // ADD_OTHER), wire-decoded: 1098|ck,1,2,0.
    const msg = decode(`1098|${GAME},1,2,0`) as SOCInventoryItemAction;
    useGameStore.getState().applyInventoryItemAction(msg);
    expect(cg().playerViews[1].ck.progressCards).toBe(1);
    expect(cg().myProgressHand).toEqual([]);

    // ADD_OTHER itype 0 (the doc's original wording) is accepted too.
    useGameStore.getState().applyInventoryItemAction(
      new SOCInventoryItemAction(GAME, 1, InventoryItemAction.ADD_OTHER, 0),
    );
    expect(cg().playerViews[1].ck.progressCards).toBe(2);
  });

  it('ADD_OTHER with isVP tracks revealed VP progress cards per player', () => {
    // VP card draw is announced to all with the real itype + isKept/isVP
    // flags: rc = 3 -> 1098|ck,1,3,16,3.
    const msg = decode(`1098|${GAME},1,3,16,3`) as SOCInventoryItemAction;
    useGameStore.getState().applyInventoryItemAction(msg);
    expect(cg().playerViews[1].ck.vpProgressCards).toEqual([CKProgressCard.CONSTITUTION]);
    // VP cards don't join the hidden hand.
    expect(cg().playerViews[1].ck.progressCards).toBe(0);

    // My own VP draw is tracked the same way (kept, not in the playable hand).
    useGameStore.getState().applyInventoryItemAction(
      new SOCInventoryItemAction(GAME, 0, InventoryItemAction.ADD_OTHER, CKProgressCard.PRINTER, {
        kept: true,
        vp: true,
        canCancel: false,
      }),
    );
    expect(cg().playerViews[0].ck.vpProgressCards).toEqual([CKProgressCard.PRINTER]);
    expect(cg().myProgressHand).toEqual([]);
  });

  it('PLAYED removes one card of that itype from my hand', () => {
    const s = useGameStore.getState();
    s.applyInventoryItemAction(
      new SOCInventoryItemAction(GAME, 0, InventoryItemAction.ADD_PLAYABLE, CKProgressCard.WARLORD),
    );
    s.applyInventoryItemAction(
      new SOCInventoryItemAction(GAME, 0, InventoryItemAction.ADD_PLAYABLE, CKProgressCard.WARLORD),
    );
    s.applyInventoryItemAction(
      new SOCInventoryItemAction(GAME, 0, InventoryItemAction.PLAYED, CKProgressCard.WARLORD),
    );
    expect(cg().myProgressHand).toEqual([CKProgressCard.WARLORD]);
    expect(cg().playerViews[0].ck.progressCards).toBe(1);
  });

  it('PLAYED decrements an opponent\'s hidden count', () => {
    const s = useGameStore.getState();
    s.applyInventoryItemAction(
      new SOCInventoryItemAction(GAME, 1, InventoryItemAction.ADD_PLAYABLE, 0),
    );
    s.applyInventoryItemAction(
      new SOCInventoryItemAction(GAME, 1, InventoryItemAction.PLAYED, CKProgressCard.MINING),
    );
    expect(cg().playerViews[1].ck.progressCards).toBe(0);
    // Never below 0.
    s.applyInventoryItemAction(
      new SOCInventoryItemAction(GAME, 1, InventoryItemAction.PLAYED, CKProgressCard.MINING),
    );
    expect(cg().playerViews[1].ck.progressCards).toBe(0);
  });

  it('CANNOT_PLAY (pn=-1) surfaces an error', () => {
    const msg = decode(`1098|${GAME},-1,5,14,3`) as SOCInventoryItemAction;
    useGameStore.getState().applyInventoryItemAction(msg);
    expect(useGameStore.getState().error).toMatch(/can't play/i);
  });
});

describe('pending C&K monopoly pick', () => {
  function drawAndPlay(itype: number): void {
    const s = useGameStore.getState();
    s.applyInventoryItemAction(
      new SOCInventoryItemAction(GAME, 0, InventoryItemAction.ADD_PLAYABLE, itype),
    );
    s.applyInventoryItemAction(
      new SOCInventoryItemAction(GAME, 0, InventoryItemAction.PLAYED, itype),
    );
  }

  it('our PLAYED of Trade Monopoly (12) marks the commodity pick pending', () => {
    drawAndPlay(CKProgressCard.TRADE_MONOPOLY);
    useGameStore.getState().setGameState(GAME, GameState.WAITING_FOR_MONOPOLY);
    expect(cg().ckPendingMonopoly).toBe(CKProgressCard.TRADE_MONOPOLY);
  });

  it('our PLAYED of Resource Monopoly (11) marks the resource pick pending', () => {
    drawAndPlay(CKProgressCard.RESOURCE_MONOPOLY);
    expect(cg().ckPendingMonopoly).toBe(CKProgressCard.RESOURCE_MONOPOLY);
  });

  it('clears when the game state leaves WAITING_FOR_MONOPOLY', () => {
    drawAndPlay(CKProgressCard.TRADE_MONOPOLY);
    useGameStore.getState().setGameState(GAME, GameState.WAITING_FOR_MONOPOLY);
    useGameStore.getState().setGameState(GAME, GameState.PLAY1);
    expect(cg().ckPendingMonopoly).toBeNull();
  });

  it('clears on a turn change', () => {
    drawAndPlay(CKProgressCard.RESOURCE_MONOPOLY);
    useGameStore.getState().applyTurn(new SOCTurn(GAME, 1, GameState.ROLL_OR_CARD));
    expect(cg().ckPendingMonopoly).toBeNull();
  });

  it('another player\'s monopoly play does NOT mark a pending pick for us', () => {
    useGameStore.getState().applyInventoryItemAction(
      new SOCInventoryItemAction(GAME, 1, InventoryItemAction.PLAYED, CKProgressCard.TRADE_MONOPOLY),
    );
    expect(cg().ckPendingMonopoly).toBeNull();
  });
});

describe('applyRemovePiece (city downgrade)', () => {
  it('replaces a removed city with the owner\'s settlement and recomputes VP', () => {
    const s = useGameStore.getState();
    s.applyPutPiece(new SOCPutPiece(GAME, 1, PIECE_SETTLEMENT, 0x405));
    s.applyPutPiece(new SOCPutPiece(GAME, 1, PIECE_CITY, 0x405));
    expect(cg().playerViews[1].vp).toBe(2);

    s.applyRemovePiece(decode(`1094|${GAME},1,2,${0x405}`) as SOCRemovePiece);
    const atNode = cg().pieces.filter((p) => p.coord === 0x405);
    expect(atNode).toHaveLength(1);
    expect(atNode[0].ptype).toBe(PIECE_SETTLEMENT);
    expect(atNode[0].playerNumber).toBe(1);
    expect(cg().playerViews[1].vp).toBe(1);

    // The server's follow-up SOCPutPiece(settlement) dedupes: still one piece.
    s.applyPutPiece(new SOCPutPiece(GAME, 1, PIECE_SETTLEMENT, 0x405));
    expect(cg().pieces.filter((p) => p.coord === 0x405)).toHaveLength(1);
    expect(cg().playerViews[1].vp).toBe(1);
  });

  it('removes a non-city piece (SC_PIRI ship) without replacement', () => {
    const s = useGameStore.getState();
    s.applyPutPiece(new SOCPutPiece(GAME, 2, PieceTypeConst.SHIP, 0x703));
    s.applyRemovePiece(new SOCRemovePiece(GAME, 2, PieceTypeConst.SHIP, 0x703));
    expect(cg().pieces).toHaveLength(0);
  });

  it('is a no-op when no matching piece exists', () => {
    const s = useGameStore.getState();
    s.applyPutPiece(new SOCPutPiece(GAME, 1, PIECE_CITY, 0x405));
    s.applyRemovePiece(new SOCRemovePiece(GAME, 2, PieceTypeConst.CITY, 0x405)); // wrong owner
    expect(cg().pieces[0].ptype).toBe(PIECE_CITY);
  });
});

// ---------------------------------------------------------------------------
// Action senders + connectStore() wiring (mock global WebSocket).
// ---------------------------------------------------------------------------

/** A controllable mock WebSocket installed as the global for connectStore(). */
class MockGlobalWS {
  static instances: MockGlobalWS[] = [];
  sent: string[] = [];
  readyState = 1;
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;

  constructor(readonly url: string) {
    MockGlobalWS.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.({});
  }

  open(): void {
    this.onopen?.({});
  }

  receive(raw: string): void {
    this.onmessage?.({ data: raw });
  }
}

const originalWS = globalThis.WebSocket;

describe('C&K action senders + handler wiring', () => {
  beforeEach(() => {
    MockGlobalWS.instances = [];
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = MockGlobalWS as unknown;
  });

  afterEach(() => {
    disconnectStore();
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = originalWS;
  });

  /** Connect, handshake, and seed the joined C&K game (me at seat 0). */
  function connectAndSeedGame(): MockGlobalWS {
    connectStore('localhost', 8888);
    const ws = MockGlobalWS.instances[0];
    ws.open();
    ws.receive(`9998${SEP}2700${SEP2}2.7.00${SEP2}srv${SEP2}${SEP2}en_US`);
    seedGame(); // connectStore() ran resetLobby(); seed AFTER connect
    ws.sent = []; // drop the handshake VERSION reply
    return ws;
  }

  it('ckBuyKnight / ckActivateKnight / ckPromoteKnight encode SOCSimpleRequest', () => {
    const ws = connectAndSeedGame();
    ckBuyKnight();
    ckActivateKnight();
    ckPromoteKnight();
    expect(ws.sent).toEqual([
      `1089|${GAME},0,1002,0,0`,
      `1089|${GAME},0,1003,0,0`,
      `1089|${GAME},0,1004,0,0`,
    ]);
  });

  it('ckBuyImprovement encodes the OP_PICK SOCSetSpecialItem per track', () => {
    const ws = connectAndSeedGame();
    ckBuyImprovement(0);
    ckBuyImprovement(1);
    ckBuyImprovement(2);
    expect(ws.sent).toEqual([
      `1099|${GAME},3,_CK_IMP/T,-1,0,-1,-1,0,\t`,
      `1099|${GAME},3,_CK_IMP/P,-1,0,-1,-1,0,\t`,
      `1099|${GAME},3,_CK_IMP/S,-1,0,-1,-1,0,\t`,
    ]);
  });

  it('ckPlayProgressCard encodes SOCInventoryItemAction(PLAY)', () => {
    const ws = connectAndSeedGame();
    ckPlayProgressCard(CKProgressCard.WARLORD);
    expect(ws.sent).toEqual([`1098|${GAME},0,4,14`]);
  });

  it('pickMonopoly doubles as the commodity pick (SOCPickResourceType 1-3)', () => {
    const ws = connectAndSeedGame();
    pickMonopoly(2); // CKCommodity.CK_COIN
    expect(ws.sent).toEqual([`1053|${GAME},2`]);
  });

  it('routes SETSPECIALITEM / INVENTORYITEMACTION / REMOVEPIECE frames', () => {
    const ws = connectAndSeedGame();
    ws.receive(`1099|${GAME},5,_CK_IMP/T,-1,0,0,-1,1,\t`);
    expect(cg().playerViews[0].ck.improvements.trade).toBe(1);

    ws.receive(`1098|${GAME},0,2,14`); // my Warlord draw
    expect(cg().myProgressHand).toEqual([CKProgressCard.WARLORD]);

    useGameStore.getState().applyPutPiece(new SOCPutPiece(GAME, 0, PIECE_CITY, 0x405));
    ws.receive(`1094|${GAME},0,2,${0x405}`);
    expect(cg().pieces[0].ptype).toBe(PIECE_SETTLEMENT);
  });

  it('routes the C&K SIMPLEACTION events (attack, metropolis, defender)', () => {
    const ws = connectAndSeedGame();
    // Barbarian attack: v1=strength, v2=defense (pn -1).
    ws.receive(`1090|${GAME},-1,1004,7,3`);
    expect(cg().lastBarbarianAttack).toMatchObject({
      strength: 7,
      defense: 3,
      defendersWon: false,
    });

    // Metropolis claimed: v1=track, owner in playerNumber (pn form).
    ws.receive(`1090|${GAME},1,1005,1,0`);
    expect(cg().ckMetropolisOwners[1]).toBe(1);
    // Doc form (pn=-1, owner in v2) is accepted too.
    ws.receive(`1090|${GAME},-1,1005,2,2`);
    expect(cg().ckMetropolisOwners[2]).toBe(2);

    // Defender of Catan: pn + v1=new SVP.
    ws.receive(`1090|${GAME},1,1006,3,0`);
    expect(useGameStore.getState().notice).toContain('droid 1 is the Defender of Catan');
    expect(useGameStore.getState().notice).toContain('now 3');
  });

  it('toasts a denied C&K knight request (SIMPLEREQUEST echoed with pn=-1)', () => {
    const ws = connectAndSeedGame();
    ws.receive(`1089|${GAME},-1,1002,0,0`);
    expect(useGameStore.getState().error).toMatch(/can't buy a knight/i);
    expect(cg().gameLog.at(-1)?.text).toMatch(/can't buy a knight/i);
  });
});
