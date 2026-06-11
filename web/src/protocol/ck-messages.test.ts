// Round-trip + known-wire-string tests for the scenario special-item messages
// SOCSetSpecialItem (1099) and SOCInventoryItemAction (1098), plus the new
// Cities & Knights constants (see doc/Cities-and-Knights-Implemented.md).
//
// Unlike the Phase-4 fixtures (captured from a JVM harness), every KNOWN_WIRE
// entry below is DERIVED BY HAND from the Java toCmd() implementations, with
// the derivation documented next to each string:
//
//   SOCSetSpecialItem.toCmd()  (SOCSetSpecialItem.java):
//     SETSPECIALITEM + sep + game + sep2 + op + sep2 + typeKey + sep2
//       + gameItemIndex + sep2 + playerItemIndex + sep2 + playerNumber
//       + sep2 + coord + sep2 + level + sep2 + (sv != null ? sv : EMPTYSTR)
//     -> all 9 fields always present; null sv is the EMPTYSTR TAB ('\t').
//
//   SOCInventoryItemAction.toCmd()  (SOCInventoryItemAction.java):
//     INVENTORYITEMACTION + sep + game + sep2 + pn + sep2 + action + sep2
//       + itemType + (rc != 0 ? sep2 + rc : "")
//     -> the rcode field is omitted when 0. For actions other than PLAY and
//        CANNOT_PLAY it is the FLAG_ISKEPT(1)|FLAG_ISVP(2)|FLAG_CANCPLAY(4)
//        bit field; for PLAY/CANNOT_PLAY it's a plain reason code.
//
// Importing ./index registers every parser.

import { describe, it, expect } from 'vitest';
import {
  decode,
  encode,
  MessageType,
  EMPTYSTR,
  SpecialItemOp,
  InventoryItemAction,
  PlayerElementType,
  GameElementType,
  SimpleRequestType,
  SimpleActionType,
  CKProgressCard,
  CKCommodity,
  CKImprovementTypeKey,
  CK_BARBARIAN_ATTACK_THRESHOLD,
  CK_MAX_KNIGHTS,
  CK_PROGRESS_HAND_LIMIT,
  CK_METROPOLIS_LEVEL,
  CK_MIGHTY_KNIGHT_POLITICS_LEVEL,
} from './index';
import { SOCSetSpecialItem } from './messages/SOCSetSpecialItem';
import {
  SOCInventoryItemAction,
  INVITEM_FLAG_ISKEPT,
  INVITEM_FLAG_ISVP,
  INVITEM_FLAG_CANCPLAY,
} from './messages/SOCInventoryItemAction';
import { SOCRemovePiece } from './messages/SOCRemovePiece';

/** Decode then assert the result is a non-null message of the expected type. */
function decodeOk(wire: string): { type: number; toCmd(): string } {
  const m = decode(wire);
  expect(m, `decode(${JSON.stringify(wire)}) should not be null`).not.toBeNull();
  return m as { type: number; toCmd(): string };
}

// ---------------------------------------------------------------------------
// Known wire strings, hand-derived from the Java toCmd() logic above.
// Each must decode and re-encode to exactly itself.
// ---------------------------------------------------------------------------
const KNOWN_WIRE: ReadonlyArray<readonly [number, string]> = [
  // --- SOCSetSpecialItem (1099) ---
  // OP_PICK request as the Java client sends it: GameMessageSender.pickSpecialItem
  // builds new SOCSetSpecialItem(ga, OP_PICK, typeKey, gi, pi, -1), i.e.
  // pn = -1 (server uses the requester's seat), co = -1, lv = 0, sv = null.
  // Fields: game=g op=3 typeKey=_CK_IMP/T gi=-1 pi=0 pn=-1 co=-1 lv=0 sv=TAB.
  [MessageType.SETSPECIALITEM, '1099|g,3,_CK_IMP/T,-1,0,-1,-1,0,\t'],
  // OP_SET_PICK announcement (server reply to a C&K improvement purchase):
  // op=5 (verified: plain 5, NOT 16+3), level=2 (new track level), sv=null
  // -> EMPTYSTR TAB. gi=-1, pi=0, pn=2 (the buying player), co=-1.
  [MessageType.SETSPECIALITEM, '1099|g,5,_CK_IMP/T,-1,0,2,-1,2,\t'],
  // OP_SET with a non-null sv (SC_WOND-style wonder): op=1, gi=1, pi=0, pn=3,
  // co=2049, lv=1, sv="w3" -> sv sent verbatim (no EMPTYSTR).
  [MessageType.SETSPECIALITEM, '1099|ga,1,_SC_WOND,1,0,3,2049,1,w3'],
  // OP_CLEAR of a game-list-only item: op=2, gi=1, pi=-1 (so pn must be -1).
  [MessageType.SETSPECIALITEM, '1099|ga,2,_SC_WOND,1,-1,-1,-1,0,\t'],
  // OP_DECLINE echoes the declined request's fields: op=4.
  [MessageType.SETSPECIALITEM, '1099|g,4,_CK_IMP/S,-1,0,-1,-1,0,\t'],
  // OP_CLEAR_PICK: op=6 (verified: plain 6, NOT 16+2).
  [MessageType.SETSPECIALITEM, '1099|g,6,_CK_IMP/P,-1,0,1,-1,0,\t'],

  // --- SOCInventoryItemAction (1098) ---
  // ADD_PLAYABLE (2) of a C&K Warlord progress card (itype 14), no flags
  // -> rc = 0 -> the trailing rcode field is OMITTED (4 fields only).
  [MessageType.INVENTORYITEMACTION, '1098|g,2,2,14'],
  // PLAY (4) request as the Java client sends it: GameMessageSender
  // .playInventoryItem sends toCmd(ga, currentPlayerNumber, PLAY, itype, 0)
  // -> rc = 0 omitted.
  [MessageType.INVENTORYITEMACTION, '1098|g,2,4,14'],
  // PLAYED (6) of a Constitution VP card (itype 16) with isKept+isVP:
  // rc = FLAG_ISKEPT(1) | FLAG_ISVP(2) = 3.
  [MessageType.INVENTORYITEMACTION, '1098|g,2,6,16,3'],
  // ADD_PLAYABLE of an SC_FTRI gift port (itype = -portType = -3) with
  // canCancelPlay: rc = FLAG_CANCPLAY = 4.
  [MessageType.INVENTORYITEMACTION, '1098|g,2,2,-3,4'],
  // ADD_OTHER (3) as other players see a hidden C&K draw: itype 0, no flags.
  [MessageType.INVENTORYITEMACTION, '1098|g,3,3,0'],
  // CANNOT_PLAY (5): pn always -1; rc = 3 is a PLAIN reason code here
  // (game state / current player wrong), not flag bits.
  [MessageType.INVENTORYITEMACTION, '1098|g,-1,5,14,3'],
  // PLAY with a nonzero plain rc: kept as-is (PLAY never decodes flags).
  [MessageType.INVENTORYITEMACTION, '1098|g,2,4,14,7'],
  // REMOVE_PLAYABLE (8) undo, no flags.
  [MessageType.INVENTORYITEMACTION, '1098|g,1,8,14'],

  // --- SOCRemovePiece (1094) ---
  // Derived from SOCMessageTemplate3i.toCmd: REMOVEPIECE sep game sep2 pn
  // sep2 ptype sep2 co. C&K barbarian city downgrade: city (ptype 2) removed
  // at node 0x405 = 1029 (then a settlement SOCPutPiece follows).
  [MessageType.REMOVEPIECE, '1094|g,1,2,1029'],
  // SC_PIRI original use: a ship (ptype 3) removed at an edge.
  [MessageType.REMOVEPIECE, '1094|ga,3,3,2310'],
];

describe('C&K known wire strings (hand-derived from Java toCmd())', () => {
  for (const [typeId, wire] of KNOWN_WIRE) {
    it(`decodes and re-encodes ${JSON.stringify(wire)}`, () => {
      const m = decodeOk(wire);
      expect(m.type).toBe(typeId);
      expect(encode(m)).toBe(wire);
    });
  }
});

describe('SOCSetSpecialItem', () => {
  it('encodes the client OP_PICK request exactly as GameMessageSender.pickSpecialItem', () => {
    // Java: new SOCSetSpecialItem(ga, OP_PICK, typeKey, gi, pi, -1)
    // -> (ga, op, typeKey, gi, pi, pn, -1, 0, null).
    const m = new SOCSetSpecialItem('g', SpecialItemOp.OP_PICK, CKImprovementTypeKey.TRADE, -1, 0, -1);
    expect(m.toCmd()).toBe('1099|g,3,_CK_IMP/T,-1,0,-1,-1,0,\t');
  });

  it('decodes an OP_SET_PICK announcement with level and null sv (EMPTYSTR)', () => {
    const m = decode('1099|g,5,_CK_IMP/T,-1,0,2,-1,2,\t') as SOCSetSpecialItem;
    expect(m).toBeInstanceOf(SOCSetSpecialItem);
    expect(m.game).toBe('g');
    expect(m.op).toBe(SpecialItemOp.OP_SET_PICK);
    expect(m.typeKey).toBe(CKImprovementTypeKey.TRADE);
    expect(m.gameItemIndex).toBe(-1);
    expect(m.playerItemIndex).toBe(0);
    expect(m.playerNumber).toBe(2);
    expect(m.coord).toBe(-1);
    expect(m.level).toBe(2);
    expect(m.sv).toBeNull();
  });

  it('decodes a non-null sv verbatim', () => {
    const m = decode('1099|ga,1,_SC_WOND,1,0,3,2049,1,w3') as SOCSetSpecialItem;
    expect(m.sv).toBe('w3');
    expect(m.coord).toBe(2049);
    expect(m.level).toBe(1);
  });

  it('round-trips every op, with and without sv', () => {
    for (const op of Object.values(SpecialItemOp)) {
      for (const sv of [null, 'w2']) {
        const m = new SOCSetSpecialItem('ga', op, '_CK_IMP/S', -1, 0, 3, 0xc06, 4, sv);
        const wire = encode(m);
        const back = decode(wire) as SOCSetSpecialItem;
        expect(back).toBeInstanceOf(SOCSetSpecialItem);
        expect(encode(back)).toBe(wire);
        expect(back.op).toBe(op);
        expect(back.typeKey).toBe('_CK_IMP/S');
        expect(back.gameItemIndex).toBe(-1);
        expect(back.playerItemIndex).toBe(0);
        expect(back.playerNumber).toBe(3);
        expect(back.coord).toBe(0xc06);
        expect(back.level).toBe(4);
        expect(back.sv).toBe(sv);
      }
    }
  });

  it('normalizes sv "" to null only via the null path; "" itself is rejected (Java throws)', () => {
    // Java: sv="" fails isSingleLineAndSafe -> IllegalArgumentException.
    expect(
      () => new SOCSetSpecialItem('g', SpecialItemOp.OP_SET, '_CK_IMP/T', -1, 0, 2, -1, 1, ''),
    ).toThrow();
    // sv with SEP2/SEP/control chars likewise.
    expect(
      () => new SOCSetSpecialItem('g', SpecialItemOp.OP_SET, '_CK_IMP/T', -1, 0, 2, -1, 1, 'a,b'),
    ).toThrow();
    expect(
      () => new SOCSetSpecialItem('g', SpecialItemOp.OP_SET, '_CK_IMP/T', -1, 0, 2, -1, 1, 'a|b'),
    ).toThrow();
  });

  it('rejects the field combinations the Java constructor rejects (parse -> null)', () => {
    // gi == -1 AND pi == -1.
    expect(decode(`1099|g,3,_CK_IMP/T,-1,-1,-1,-1,0,${EMPTYSTR}`)).toBeNull();
    // pn != -1 but pi == -1.
    expect(decode(`1099|g,1,_CK_IMP/T,1,-1,2,-1,0,${EMPTYSTR}`)).toBeNull();
    expect(
      () => new SOCSetSpecialItem('g', SpecialItemOp.OP_PICK, '_CK_IMP/T', -1, -1, -1),
    ).toThrow();
  });

  it('rejects garbled wire strings', () => {
    // Only 8 tokens (sv missing -> Java NoSuchElementException -> null).
    expect(decode('1099|g,3,_CK_IMP/T,-1,0,-1,-1,0')).toBeNull();
    // Non-integer numeric field.
    expect(decode(`1099|g,x,_CK_IMP/T,-1,0,-1,-1,0,${EMPTYSTR}`)).toBeNull();
    expect(decode(`1099|g,3,_CK_IMP/T,-1,0,-1,-1,zz,${EMPTYSTR}`)).toBeNull();
  });
});

describe('SOCInventoryItemAction', () => {
  it('encodes ADD_PLAYABLE without flags omitting the rcode field', () => {
    const m = new SOCInventoryItemAction('g', 2, InventoryItemAction.ADD_PLAYABLE, CKProgressCard.WARLORD);
    expect(m.toCmd()).toBe('1098|g,2,2,14');
    expect(m.reasonCode).toBe(0);
    expect(m.isKept).toBe(false);
    expect(m.isVP).toBe(false);
    expect(m.canCancelPlay).toBe(false);
  });

  it('encodes the client PLAY request exactly as GameMessageSender.playInventoryItem', () => {
    // Java: SOCInventoryItemAction.toCmd(ga, currentPlayerNumber, PLAY, itype, 0).
    const m = new SOCInventoryItemAction('g', 2, InventoryItemAction.PLAY, CKProgressCard.WARLORD);
    expect(m.toCmd()).toBe('1098|g,2,4,14');
  });

  it('encodes/decodes PLAYED with isKept + isVP flags in the rcode field', () => {
    // rc = FLAG_ISKEPT(1) | FLAG_ISVP(2) = 3.
    const m = new SOCInventoryItemAction(
      'g', 2, InventoryItemAction.PLAYED, CKProgressCard.CONSTITUTION,
      { kept: true, vp: true, canCancel: false },
    );
    expect(m.reasonCode).toBe(INVITEM_FLAG_ISKEPT | INVITEM_FLAG_ISVP);
    expect(m.toCmd()).toBe('1098|g,2,6,16,3');

    const back = decode('1098|g,2,6,16,3') as SOCInventoryItemAction;
    expect(back).toBeInstanceOf(SOCInventoryItemAction);
    expect(back.playerNumber).toBe(2);
    expect(back.action).toBe(InventoryItemAction.PLAYED);
    expect(back.itemType).toBe(CKProgressCard.CONSTITUTION);
    expect(back.isKept).toBe(true);
    expect(back.isVP).toBe(true);
    expect(back.canCancelPlay).toBe(false);
    expect(back.reasonCode).toBe(3);
  });

  it('keeps rcode as a plain reason code for PLAY and CANNOT_PLAY (no flag decode)', () => {
    const cannot = decode('1098|g,-1,5,14,3') as SOCInventoryItemAction;
    expect(cannot.action).toBe(InventoryItemAction.CANNOT_PLAY);
    expect(cannot.reasonCode).toBe(3);
    expect(cannot.isKept).toBe(false);
    expect(cannot.isVP).toBe(false);
    expect(cannot.canCancelPlay).toBe(false);

    const play = decode('1098|g,2,4,14,7') as SOCInventoryItemAction;
    expect(play.action).toBe(InventoryItemAction.PLAY);
    expect(play.reasonCode).toBe(7);
    expect(play.isKept).toBe(false);
    // PLAY/CANNOT_PLAY rcodes round-trip byte-identically.
    expect(encode(play)).toBe('1098|g,2,4,14,7');
  });

  it('drops rcode bits above the 3 flag bits for flag-carrying actions (Java parity)', () => {
    // Java decodes kept/vp/canCancel from rc=11 (0x0B) then REBUILDS reasonCode
    // from only those flags, so bit 0x08 is dropped: re-encodes with rc=3.
    const m = decode('1098|g,2,2,14,11') as SOCInventoryItemAction;
    expect(m.isKept).toBe(true);
    expect(m.isVP).toBe(true);
    expect(m.canCancelPlay).toBe(false);
    expect(m.reasonCode).toBe(3);
    expect(encode(m)).toBe('1098|g,2,2,14,3');
  });

  it('round-trips every action with every flag combination', () => {
    const flagActions = [
      InventoryItemAction.BUY,
      InventoryItemAction.ADD_PLAYABLE,
      InventoryItemAction.ADD_OTHER,
      InventoryItemAction.PLAYED,
      InventoryItemAction.PLACING_EXTRA,
      InventoryItemAction.REMOVE_PLAYABLE,
      InventoryItemAction.REMOVE_OTHER,
    ];
    for (const ac of flagActions) {
      for (let bits = 0; bits <= 7; ++bits) {
        const m = new SOCInventoryItemAction('ga', 1, ac, CKProgressCard.IRRIGATION, {
          kept: (bits & INVITEM_FLAG_ISKEPT) !== 0,
          vp: (bits & INVITEM_FLAG_ISVP) !== 0,
          canCancel: (bits & INVITEM_FLAG_CANCPLAY) !== 0,
        });
        expect(m.reasonCode).toBe(bits);
        const wire = encode(m);
        const back = decode(wire) as SOCInventoryItemAction;
        expect(back).toBeInstanceOf(SOCInventoryItemAction);
        expect(encode(back)).toBe(wire);
        expect(back.action).toBe(ac);
        expect(back.itemType).toBe(CKProgressCard.IRRIGATION);
        expect(back.isKept).toBe(m.isKept);
        expect(back.isVP).toBe(m.isVP);
        expect(back.canCancelPlay).toBe(m.canCancelPlay);
        expect(back.reasonCode).toBe(bits);
      }
    }
    // PLAY / CANNOT_PLAY with plain reason codes.
    for (const ac of [InventoryItemAction.PLAY, InventoryItemAction.CANNOT_PLAY]) {
      for (const rc of [0, 1, 4]) {
        const m = new SOCInventoryItemAction('ga', ac === InventoryItemAction.CANNOT_PLAY ? -1 : 2, ac, -3, rc);
        const wire = encode(m);
        const back = decode(wire) as SOCInventoryItemAction;
        expect(encode(back)).toBe(wire);
        expect(back.reasonCode).toBe(rc);
        expect(back.isKept).toBe(false);
      }
    }
  });

  it('rejects garbled wire strings', () => {
    expect(decode('1098|g,2,2')).toBeNull(); // too few tokens
    expect(decode('1098|g,x,2,14')).toBeNull(); // non-integer pn
    expect(decode('1098|g,2,2,14,zz')).toBeNull(); // non-integer rcode
  });
});

describe('SOCRemovePiece', () => {
  it('round-trips a city removal (C&K barbarian downgrade)', () => {
    const m = new SOCRemovePiece('g', 1, 2, 0x405);
    expect(m.toCmd()).toBe('1094|g,1,2,1029');
    const back = decode(m.toCmd()) as SOCRemovePiece;
    expect(back).toBeInstanceOf(SOCRemovePiece);
    expect(back.game).toBe('g');
    expect(back.playerNumber).toBe(1);
    expect(back.pieceType).toBe(2);
    expect(back.coord).toBe(0x405);
    expect(encode(back)).toBe(m.toCmd());
  });

  it('rejects coord < 0 (Java constructor throws; parse -> null)', () => {
    expect(() => new SOCRemovePiece('g', 1, 2, -1)).toThrow();
    expect(decode('1094|g,1,2,-1')).toBeNull();
  });

  it('rejects garbled wire strings', () => {
    expect(decode('1094|g,1,2')).toBeNull(); // too few tokens
    expect(decode('1094|g,x,2,1029')).toBeNull(); // non-integer pn
    expect(decode('1094|g,1,2,zz')).toBeNull(); // non-integer coord
  });
});

describe('C&K constants (doc/Cities-and-Knights-Implemented.md)', () => {
  it('SpecialItemOp values match SOCSetSpecialItem.java (combined ops are 5/6, not 16+n)', () => {
    expect(SpecialItemOp.OP_SET).toBe(1);
    expect(SpecialItemOp.OP_CLEAR).toBe(2);
    expect(SpecialItemOp.OP_PICK).toBe(3);
    expect(SpecialItemOp.OP_DECLINE).toBe(4);
    expect(SpecialItemOp.OP_SET_PICK).toBe(5);
    expect(SpecialItemOp.OP_CLEAR_PICK).toBe(6);
  });

  it('InventoryItemAction values match SOCInventoryItemAction.java', () => {
    expect(InventoryItemAction.BUY).toBe(1);
    expect(InventoryItemAction.ADD_PLAYABLE).toBe(2);
    expect(InventoryItemAction.ADD_OTHER).toBe(3);
    expect(InventoryItemAction.PLAY).toBe(4);
    expect(InventoryItemAction.CANNOT_PLAY).toBe(5);
    expect(InventoryItemAction.PLAYED).toBe(6);
    expect(InventoryItemAction.PLACING_EXTRA).toBe(7);
    expect(InventoryItemAction.REMOVE_PLAYABLE).toBe(8);
    expect(InventoryItemAction.REMOVE_OTHER).toBe(9);
  });

  it('C&K PEType player-element values', () => {
    expect(PlayerElementType.CK_CLOTH_COUNT).toBe(110);
    expect(PlayerElementType.CK_COIN_COUNT).toBe(111);
    expect(PlayerElementType.CK_PAPER_COUNT).toBe(112);
    expect(PlayerElementType.CK_KNIGHTS_LV1).toBe(113);
    expect(PlayerElementType.CK_KNIGHTS_LV2).toBe(114);
    expect(PlayerElementType.CK_KNIGHTS_LV3).toBe(115);
    expect(PlayerElementType.CK_KNIGHTS_ACTIVE_LV1).toBe(116);
    expect(PlayerElementType.CK_KNIGHTS_ACTIVE_LV2).toBe(117);
    expect(PlayerElementType.CK_KNIGHTS_ACTIVE_LV3).toBe(118);
  });

  it('C&K GEType, SimpleRequest, and SimpleAction codes', () => {
    expect(GameElementType.CK_BARBARIAN_STRENGTH).toBe(11);
    expect(SimpleRequestType.CK_BUY_KNIGHT).toBe(1002);
    expect(SimpleRequestType.CK_ACTIVATE_KNIGHT).toBe(1003);
    expect(SimpleRequestType.CK_PROMOTE_KNIGHT).toBe(1004);
    expect(SimpleActionType.CK_BARBARIAN_ATTACK_RESULT).toBe(1004);
    expect(SimpleActionType.CK_METROPOLIS_CLAIMED).toBe(1005);
    expect(SimpleActionType.CK_DEFENDER_OF_CATAN).toBe(1006);
  });

  it('C&K progress cards, commodities, typeKeys, and rule numbers', () => {
    expect(CKProgressCard.RESOURCE_MONOPOLY).toBe(11);
    expect(CKProgressCard.TRADE_MONOPOLY).toBe(12);
    expect(CKProgressCard.MASTER_MERCHANT).toBe(13);
    expect(CKProgressCard.WARLORD).toBe(14);
    expect(CKProgressCard.WEDDING).toBe(15);
    expect(CKProgressCard.CONSTITUTION).toBe(16);
    expect(CKProgressCard.IRRIGATION).toBe(17);
    expect(CKProgressCard.MINING).toBe(18);
    expect(CKProgressCard.PRINTER).toBe(19);
    expect(CKCommodity.CK_CLOTH).toBe(1);
    expect(CKCommodity.CK_COIN).toBe(2);
    expect(CKCommodity.CK_PAPER).toBe(3);
    expect(CKImprovementTypeKey.TRADE).toBe('_CK_IMP/T');
    expect(CKImprovementTypeKey.POLITICS).toBe('_CK_IMP/P');
    expect(CKImprovementTypeKey.SCIENCE).toBe('_CK_IMP/S');
    expect(CK_BARBARIAN_ATTACK_THRESHOLD).toBe(7);
    expect(CK_MAX_KNIGHTS).toBe(6);
    expect(CK_PROGRESS_HAND_LIMIT).toBe(4);
    expect(CK_METROPOLIS_LEVEL).toBe(4);
    expect(CK_MIGHTY_KNIGHT_POLITICS_LEVEL).toBe(3);
  });
});
