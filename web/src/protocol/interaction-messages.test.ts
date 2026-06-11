// Round-trip + known-wire-string tests for the Phase-4 in-game interaction
// messages (trade, dev cards, robber/discard, misc).
//
// Every KNOWN_WIRE entry below was captured BYTE-FOR-BYTE from the real Java
// classes by constructing each message and printing its toCmd() (see
// web/tmp-wire/WireDump.java). Each is asserted to decode to a non-null message
// of the right type and re-encode identically. Constructor->toCmd identity is
// also checked for the representative shapes. Importing ./index registers every
// parser.

import { describe, it, expect } from 'vitest';
import {
  decode,
  encode,
  MessageType,
  DevCardType,
  DevCardAction,
  ChoosePlayerChoice,
  RejectOfferReason,
  PickResourcesReason,
  DeclineReason,
  SimpleRequestType,
  SimpleActionType,
  GameStatsType,
  resourceSet,
} from './index';
import { SOCBankTrade } from './messages/SOCBankTrade';
import { SOCMakeOffer } from './messages/SOCMakeOffer';
import { SOCAcceptOffer } from './messages/SOCAcceptOffer';
import { SOCRejectOffer } from './messages/SOCRejectOffer';
import { SOCClearOffer } from './messages/SOCClearOffer';
import { SOCClearTradeMsg } from './messages/SOCClearTradeMsg';
import { SOCBuyDevCardRequest } from './messages/SOCBuyDevCardRequest';
import { SOCDevCardAction } from './messages/SOCDevCardAction';
import { SOCDevCardCount } from './messages/SOCDevCardCount';
import { SOCSetPlayedDevCard } from './messages/SOCSetPlayedDevCard';
import { SOCPlayDevCardRequest } from './messages/SOCPlayDevCardRequest';
import { SOCPickResources } from './messages/SOCPickResources';
import { SOCPickResourceType } from './messages/SOCPickResourceType';
import { SOCMoveRobber } from './messages/SOCMoveRobber';
import { SOCChoosePlayer } from './messages/SOCChoosePlayer';
import { SOCChoosePlayerRequest } from './messages/SOCChoosePlayerRequest';
import { SOCDiscard } from './messages/SOCDiscard';
import { SOCDiscardRequest } from './messages/SOCDiscardRequest';
import { SOCRobberyResult } from './messages/SOCRobberyResult';
import { SOCSimpleRequest } from './messages/SOCSimpleRequest';
import { SOCSimpleAction } from './messages/SOCSimpleAction';
import { SOCDeclinePlayerRequest } from './messages/SOCDeclinePlayerRequest';
import { SOCGameStats } from './messages/SOCGameStats';

/** Decode then assert the result is a non-null message of the expected type. */
function decodeOk(wire: string): { type: number; toCmd(): string } {
  const m = decode(wire);
  expect(m, `decode(${JSON.stringify(wire)}) should not be null`).not.toBeNull();
  return m as { type: number; toCmd(): string };
}

// ---------------------------------------------------------------------------
// Known wire strings captured byte-for-byte from the Java classes (WireDump.java).
// Each must decode and re-encode to exactly itself.
// ---------------------------------------------------------------------------
const KNOWN_WIRE: ReadonlyArray<readonly [number, string]> = [
  // Trade
  [MessageType.BANKTRADE, '1040|ga,0,0,3,0,0,1,0,0,0,0'],
  [MessageType.BANKTRADE, '1040|ga,0,0,3,0,0,1,0,0,0,0,2'],
  [MessageType.MAKEOFFER, '1041|ga,3,false,false,true,false,0,1,0,1,0,0,0,1,0,0'],
  [MessageType.MAKEOFFER, '1041|ga,0,false,true,false,true,false,false,0,1,0,1,0,0,0,1,0,0'],
  [MessageType.ACCEPTOFFER, '1039|ga,2,3'],
  [MessageType.ACCEPTOFFER, '1039|ga,2,3,0,0,2,0,0,1,0,0,0,4'],
  [MessageType.REJECTOFFER, '1037|ga,1'],
  [MessageType.REJECTOFFER, '1037|ga,-1,2'],
  [MessageType.CLEAROFFER, '1038|ga,2'],
  [MessageType.CLEAROFFER, '1038|ga,-1'],
  [MessageType.CLEARTRADEMSG, '1042|ga,3'],
  [MessageType.CLEARTRADEMSG, '1042|ga,-1'],
  // Dev cards
  [MessageType.BUYDEVCARDREQUEST, '1045|ga'],
  [MessageType.DEVCARDACTION, '1046|ga,3,0,9'],
  [MessageType.DEVCARDACTION, '1046|ga,1,0,0'],
  [MessageType.DEVCARDACTION, '1046|ga,2,1,3'],
  [MessageType.DEVCARDACTION, '1046|ga,0,3,1'],
  [MessageType.DEVCARDACTION, '1046|ga,2,3,4,5,6'],
  [MessageType.DEVCARDCOUNT, '1047|ga,19'],
  [MessageType.SETPLAYEDDEVCARD, '1048|ga,2,true'],
  [MessageType.SETPLAYEDDEVCARD, '1048|ga,2,false'],
  [MessageType.PLAYDEVCARDREQUEST, '1049|ga,9'],
  [MessageType.PICKRESOURCES, '1052|ga,1,0,0,1,0'],
  [MessageType.PICKRESOURCES, '1052|ga,1,0,0,1,0,3,2'],
  [MessageType.PICKRESOURCETYPE, '1053|ga,3'],
  // Robber / discard
  [MessageType.MOVEROBBER, '1034|ga,2,103'],
  [MessageType.MOVEROBBER, '1034|ga,2,-260'],
  [MessageType.CHOOSEPLAYER, '1035|ga,2'],
  [MessageType.CHOOSEPLAYER, '1035|ga,-1'],
  [MessageType.CHOOSEPLAYER, '1035|ga,-2'],
  [MessageType.CHOOSEPLAYERREQUEST, '1036|ga,false,true,false,true'],
  [MessageType.CHOOSEPLAYERREQUEST, '1036|ga,NONE,false,true,false,true'],
  [MessageType.DISCARD, '1033|ga,2,0,1,0,0,0'],
  [MessageType.DISCARD, '1033|ga,p3,2,0,1,0,0,0'],
  [MessageType.DISCARD, '1033|ga,p3,0,0,0,0,0,4'],
  [MessageType.DISCARDREQUEST, '1029|ga,4'],
  [MessageType.ROBBERYRESULT, '1102|ga,2,3,R,3,1,T'],
  [MessageType.ROBBERYRESULT, '1102|ga,2,3,S,1,1,3,2,T'],
  [MessageType.ROBBERYRESULT, '1102|ga,1,0,E,106,2,T'],
  [MessageType.ROBBERYRESULT, '1102|ga,1,2,R,6,5,F,3,7'],
  [MessageType.ROBBERYRESULT, '1102|ga,-1,1,R,6,0,T,0,4'],
  // Misc
  [MessageType.SIMPLEREQUEST, '1089|ga,2,1,2,0'],
  [MessageType.SIMPLEREQUEST, '1089|ga,1,1000,0,0'],
  [MessageType.SIMPLEACTION, '1090|ga,3,1,18,0'],
  [MessageType.SIMPLEACTION, '1090|ga,2,3,4,3'],
  [MessageType.DECLINEPLAYERREQUEST, '1104|ga,0,3'],
  [MessageType.DECLINEPLAYERREQUEST, '1104|ga,20,4,1,1543'],
  [MessageType.DECLINEPLAYERREQUEST, "1104|ga,0,3,0,0,You can't, comma, here"],
  [MessageType.GAMESTATS, '1061|ga,10,4,0,7,false,true,true,false'],
  [MessageType.GAMESTATS, '1061|ga,t2,1700000000,1,0'],
];

describe('Phase-4 known wire strings (captured byte-for-byte from Java)', () => {
  for (const [typeId, wire] of KNOWN_WIRE) {
    it(`${wire} decodes to type ${typeId} and re-encodes identically`, () => {
      const m = decodeOk(wire);
      expect(m.type).toBe(typeId);
      expect(encode(m)).toBe(wire);
    });
  }
});

// ---------------------------------------------------------------------------
// Field-level assertions + constructor->toCmd identity per message.
// ---------------------------------------------------------------------------

describe('SOCBankTrade (1040)', () => {
  it('encodes two 5-int resource blocks; omits pn when -1', () => {
    const m = new SOCBankTrade(
      'ga',
      resourceSet(0, 0, 3, 0, 0),
      resourceSet(1, 0, 0, 0, 0),
    );
    expect(m.toCmd()).toBe('1040|ga,0,0,3,0,0,1,0,0,0,0');
  });
  it('appends pn when set (server announcement)', () => {
    const m = decodeOk('1040|ga,0,0,3,0,0,1,0,0,0,0,2') as SOCBankTrade;
    expect(m.playerNumber).toBe(2);
    expect(m.give.sheep).toBe(3);
    expect(m.get.clay).toBe(1);
  });
  it('rejects too few amounts', () => {
    expect(decode('1040|ga,0,0,3,0,0,1,0,0,0')).toBeNull();
  });
});

describe('SOCMakeOffer (1041)', () => {
  it('infers the to[] length as (tokens after from) - 10', () => {
    const m = decodeOk('1041|ga,3,false,false,true,false,0,1,0,1,0,0,0,1,0,0') as SOCMakeOffer;
    expect(m.offer.from).toBe(3);
    expect(m.offer.to).toEqual([false, false, true, false]);
    expect(m.offer.give).toMatchObject({ ore: 1, wheat: 1 });
    expect(m.offer.get).toMatchObject({ sheep: 1 });
    expect(encode(m)).toBe('1041|ga,3,false,false,true,false,0,1,0,1,0,0,0,1,0,0');
  });
  it('handles a 6-player to[] array', () => {
    const m = decodeOk(
      '1041|ga,0,false,true,false,true,false,false,0,1,0,1,0,0,0,1,0,0',
    ) as SOCMakeOffer;
    expect(m.offer.to).toHaveLength(6);
    expect(m.offer.to).toEqual([false, true, false, true, false, false]);
  });
  it('rejects when there is no room for a to[] entry', () => {
    // game, from, then exactly 10 amounts (no `to` token) -> numTo 0 -> null
    expect(decode('1041|ga,3,0,0,0,0,0,0,0,0,0,0')).toBeNull();
  });
});

describe('SOCAcceptOffer (1039)', () => {
  it('client form: just accepting + offering', () => {
    const m = decodeOk('1039|ga,2,3') as SOCAcceptOffer;
    expect(m.accepting).toBe(2);
    expect(m.offering).toBe(3);
    expect(m.resToAccepting).toBeNull();
  });
  it('server form: 2 resource blocks', () => {
    const m = decodeOk('1039|ga,2,3,0,0,2,0,0,1,0,0,0,4') as SOCAcceptOffer;
    expect(m.resToAccepting).toMatchObject({ sheep: 2 });
    expect(m.resToOffering).toMatchObject({ clay: 1, wood: 4 });
    expect(encode(m)).toBe('1039|ga,2,3,0,0,2,0,0,1,0,0,0,4');
  });
  it('throws on inconsistent resource nulls', () => {
    expect(() => new SOCAcceptOffer('ga', 0, 1, resourceSet(1, 0, 0, 0, 0), null)).toThrow();
  });
});

describe('SOCRejectOffer (1037)', () => {
  it('plain reject has no reason code', () => {
    const m = decodeOk('1037|ga,1') as SOCRejectOffer;
    expect(m.playerNumber).toBe(1);
    expect(m.reasonCode).toBe(0);
  });
  it('server reply with reason code', () => {
    const m = decodeOk('1037|ga,-1,2') as SOCRejectOffer;
    expect(m.reasonCode).toBe(RejectOfferReason.REASON_NOT_YOUR_TURN);
    expect(encode(m)).toBe('1037|ga,-1,2');
  });
});

describe('SOCClearOffer / SOCClearTradeMsg (1038/1042)', () => {
  it('ClearOffer -1 means all', () => {
    const m = decodeOk('1038|ga,-1') as SOCClearOffer;
    expect(m.playerNumber).toBe(-1);
  });
  it('ClearTradeMsg round-trips', () => {
    const m = new SOCClearTradeMsg('ga', 3);
    expect(m.toCmd()).toBe('1042|ga,3');
  });
});

describe('SOCBuyDevCardRequest (1045)', () => {
  it('data portion is the whole game name', () => {
    const m = decodeOk('1045|ga') as SOCBuyDevCardRequest;
    expect(m.game).toBe('ga');
    expect(encode(m)).toBe('1045|ga');
  });
});

describe('SOCDevCardAction (1046)', () => {
  it('single-card DRAW of a Knight (post-2.0 value 9)', () => {
    const m = decodeOk('1046|ga,3,0,9') as SOCDevCardAction;
    expect(m.actionType).toBe(DevCardAction.DRAW);
    expect(m.cardType).toBe(DevCardType.KNIGHT);
    expect(m.cardTypes).toBeNull();
    expect(encode(m)).toBe('1046|ga,3,0,9');
  });
  it('DRAW of UNKNOWN (value 0) for other players', () => {
    const m = decodeOk('1046|ga,1,0,0') as SOCDevCardAction;
    expect(m.cardType).toBe(DevCardType.UNKNOWN);
  });
  it('multi-card VP reveal builds cardTypes', () => {
    const m = decodeOk('1046|ga,2,3,4,5,6') as SOCDevCardAction;
    expect(m.cardTypes).toEqual([
      DevCardType.CAP,
      DevCardType.MARKET,
      DevCardType.UNIV,
    ]);
    expect(encode(m)).toBe('1046|ga,2,3,4,5,6');
  });
  it('a single-element list constructs the single-card form', () => {
    const m = new SOCDevCardAction('ga', 0, DevCardAction.ADD_OLD, [DevCardType.ROADS]);
    expect(m.cardTypes).toBeNull();
    expect(m.cardType).toBe(DevCardType.ROADS);
    expect(m.toCmd()).toBe('1046|ga,0,3,1');
  });
  it('rejects more than 100 card types', () => {
    const many = Array.from({ length: 101 }, () => 1).join(',');
    expect(decode(`1046|ga,2,3,${many}`)).toBeNull();
  });
});

describe('SOCDevCardCount / SOCSetPlayedDevCard / SOCPlayDevCardRequest', () => {
  it('DevCardCount round-trips', () => {
    expect((decodeOk('1047|ga,19') as SOCDevCardCount).numDevCards).toBe(19);
  });
  it('SetPlayedDevCard true/false render lowercase', () => {
    expect(new SOCSetPlayedDevCard('ga', 2, true).toCmd()).toBe('1048|ga,2,true');
    expect(new SOCSetPlayedDevCard('ga', 2, false).toCmd()).toBe('1048|ga,2,false');
    expect((decodeOk('1048|ga,2,true') as SOCSetPlayedDevCard).playedDevCard).toBe(true);
  });
  it('PlayDevCardRequest carries the dev-card type', () => {
    expect(new SOCPlayDevCardRequest('ga', DevCardType.KNIGHT).toCmd()).toBe('1049|ga,9');
  });
});

describe('SOCPickResources / SOCPickResourceType (1052/1053)', () => {
  it('client pick: 5 amounts only', () => {
    const m = decodeOk('1052|ga,1,0,0,1,0') as SOCPickResources;
    expect(m.resources).toMatchObject({ clay: 1, wheat: 1 });
    expect(m.playerNumber).toBe(0);
    expect(m.reasonCode).toBe(0);
  });
  it('server pick: adds pn + reason code', () => {
    const m = decodeOk('1052|ga,1,0,0,1,0,3,2') as SOCPickResources;
    expect(m.playerNumber).toBe(3);
    expect(m.reasonCode).toBe(PickResourcesReason.REASON_DISCOVERY);
    expect(encode(m)).toBe('1052|ga,1,0,0,1,0,3,2');
  });
  it('a lone trailing pn (without reason code) is garbled', () => {
    expect(decode('1052|ga,1,0,0,1,0,3')).toBeNull();
  });
  it('PickResourceType carries the resource type', () => {
    expect((decodeOk('1053|ga,3') as SOCPickResourceType).resourceType).toBe(3);
  });
});

describe('SOCMoveRobber (1034)', () => {
  it('positive coord = robber', () => {
    const m = decodeOk('1034|ga,2,103') as SOCMoveRobber;
    expect(m.coordinates).toBe(0x67);
  });
  it('negative coord = pirate', () => {
    const m = decodeOk('1034|ga,2,-260') as SOCMoveRobber;
    expect(m.coordinates).toBe(-0x104);
    expect(encode(m)).toBe('1034|ga,2,-260');
  });
});

describe('SOCChoosePlayer / SOCChoosePlayerRequest (1035/1036)', () => {
  it('victim choice is a player number', () => {
    expect((decodeOk('1035|ga,2') as SOCChoosePlayer).choice).toBe(2);
  });
  it('special negative choices', () => {
    expect((decodeOk('1035|ga,-1') as SOCChoosePlayer).choice).toBe(
      ChoosePlayerChoice.CHOICE_NO_PLAYER,
    );
    expect((decodeOk('1035|ga,-2') as SOCChoosePlayer).choice).toBe(
      ChoosePlayerChoice.CHOICE_MOVE_ROBBER,
    );
  });
  it('ChoosePlayerRequest: boolean choices, no NONE', () => {
    const m = decodeOk('1036|ga,false,true,false,true') as SOCChoosePlayerRequest;
    expect(m.canChooseNone).toBe(false);
    expect(m.choices).toEqual([false, true, false, true]);
    expect(encode(m)).toBe('1036|ga,false,true,false,true');
  });
  it('ChoosePlayerRequest: NONE prefix sets canChooseNone', () => {
    const m = decodeOk('1036|ga,NONE,false,true,false,true') as SOCChoosePlayerRequest;
    expect(m.canChooseNone).toBe(true);
    expect(m.choices).toEqual([false, true, false, true]);
    expect(encode(m)).toBe('1036|ga,NONE,false,true,false,true');
  });
  it('rejects a lone NONE with no choices', () => {
    expect(decode('1036|ga,NONE')).toBeNull();
  });
});

describe('SOCDiscard (1033)', () => {
  it('client form has no pn and 6 amounts (incl. unknown)', () => {
    const m = decodeOk('1033|ga,2,0,1,0,0,0') as SOCDiscard;
    expect(m.playerNumber).toBe(-1);
    expect(m.resources).toMatchObject({ clay: 2, sheep: 1, unknown: 0 });
  });
  it('server form has a p<pn> prefix near the start', () => {
    const m = decodeOk('1033|ga,p3,2,0,1,0,0,0') as SOCDiscard;
    expect(m.playerNumber).toBe(3);
    expect(m.resources.clay).toBe(2);
    expect(encode(m)).toBe('1033|ga,p3,2,0,1,0,0,0');
  });
  it('carries the UNKNOWN amount (total reported to others)', () => {
    const m = decodeOk('1033|ga,p3,0,0,0,0,0,4') as SOCDiscard;
    expect(m.resources.unknown).toBe(4);
  });
  it('rejects too few amounts', () => {
    expect(decode('1033|ga,2,0,1,0,0')).toBeNull();
  });
});

describe('SOCDiscardRequest (1029)', () => {
  it('carries numDiscards', () => {
    expect((decodeOk('1029|ga,4') as SOCDiscardRequest).numDiscards).toBe(4);
  });
});

describe('SOCRobberyResult (1102)', () => {
  it("R form: single resource, gain/lose", () => {
    const m = decodeOk('1102|ga,2,3,R,3,1,T') as SOCRobberyResult;
    expect(m.perpPN).toBe(2);
    expect(m.victimPN).toBe(3);
    expect(m.stolen).toEqual({ kind: 'res', resType: 3 });
    expect(m.isGainLose).toBe(true);
    expect(m.amount).toBe(1);
    expect(encode(m)).toBe('1102|ga,2,3,R,3,1,T');
  });
  it('S form: a resource set of nonzero types', () => {
    const m = decodeOk('1102|ga,2,3,S,1,1,3,2,T') as SOCRobberyResult;
    expect(m.stolen.kind).toBe('resSet');
    if (m.stolen.kind === 'resSet') {
      expect(m.stolen.resSet).toMatchObject({ clay: 1, sheep: 2 });
    }
    expect(encode(m)).toBe('1102|ga,2,3,S,1,1,3,2,T');
  });
  it('E form: a player element (cloth count = 106)', () => {
    const m = decodeOk('1102|ga,1,0,E,106,2,T') as SOCRobberyResult;
    expect(m.stolen).toEqual({ kind: 'peType', peType: 106 });
    expect(m.amount).toBe(2);
    expect(encode(m)).toBe('1102|ga,1,0,E,106,2,T');
  });
  it('totals form: !gainLose with victimAmount + extraValue', () => {
    const m = decodeOk('1102|ga,1,2,R,6,5,F,3,7') as SOCRobberyResult;
    expect(m.isGainLose).toBe(false);
    expect(m.amount).toBe(5);
    expect(m.victimAmount).toBe(3);
    expect(m.extraValue).toBe(7);
    expect(encode(m)).toBe('1102|ga,1,2,R,6,5,F,3,7');
  });
  it('extraValue with victimAmount 0 still writes the 0', () => {
    const m = decodeOk('1102|ga,-1,1,R,6,0,T,0,4') as SOCRobberyResult;
    expect(m.victimAmount).toBe(0);
    expect(m.extraValue).toBe(4);
    expect(encode(m)).toBe('1102|ga,-1,1,R,6,0,T,0,4');
  });
  it('rejects an unknown type char', () => {
    expect(decode('1102|ga,1,2,X,3,1,T')).toBeNull();
  });
});

describe('SOCSimpleRequest / SOCSimpleAction (1089/1090)', () => {
  it('SimpleRequest always has 4 int values', () => {
    const m = decodeOk('1089|ga,2,1,2,0') as SOCSimpleRequest;
    expect(m.reqType).toBe(SimpleRequestType.PROMPT_PICK_RESOURCES);
    expect(m.value1).toBe(2);
    expect(m.value2).toBe(0);
    expect(encode(m)).toBe('1089|ga,2,1,2,0');
  });
  it('bare SimpleRequest fills 0 for both detail values', () => {
    expect(new SOCSimpleRequest('ga', 1, SimpleRequestType.SC_PIRI_FORT_ATTACK).toCmd()).toBe(
      '1089|ga,1,1000,0,0',
    );
  });
  it('SimpleAction DEVCARD_BOUGHT', () => {
    const m = decodeOk('1090|ga,3,1,18,0') as SOCSimpleAction;
    expect(m.actType).toBe(SimpleActionType.DEVCARD_BOUGHT);
    expect(m.value1).toBe(18);
  });
  it('SimpleAction RSRC_TYPE_MONOPOLIZED', () => {
    const m = decodeOk('1090|ga,2,3,4,3') as SOCSimpleAction;
    expect(m.actType).toBe(SimpleActionType.RSRC_TYPE_MONOPOLIZED);
    expect(m.value1).toBe(4);
    expect(m.value2).toBe(3);
  });
});

describe('SOCDeclinePlayerRequest (1104)', () => {
  it('minimal form: state, reason only', () => {
    const m = decodeOk('1104|ga,0,3') as SOCDeclinePlayerRequest;
    expect(m.gameState).toBe(0);
    expect(m.reasonCode).toBe(DeclineReason.REASON_NOT_NOW);
    expect(m.detailValue1).toBe(0);
    expect(m.reasonText).toBeNull();
  });
  it('detail form: location reason with piece type + coord', () => {
    const m = decodeOk('1104|ga,20,4,1,1543') as SOCDeclinePlayerRequest;
    expect(m.reasonCode).toBe(DeclineReason.REASON_LOCATION);
    expect(m.detailValue1).toBe(1);
    expect(m.detailValue2).toBe(1543);
    expect(m.reasonText).toBeNull();
    expect(encode(m)).toBe('1104|ga,20,4,1,1543');
  });
  it('reasonText may contain commas and is preserved', () => {
    const wire = "1104|ga,0,3,0,0,You can't, comma, here";
    const m = decodeOk(wire) as SOCDeclinePlayerRequest;
    expect(m.reasonText).toBe("You can't, comma, here");
    expect(encode(m)).toBe(wire);
  });
});

describe('SOCGameStats (1061)', () => {
  it('TYPE_PLAYERS: scores then robot flags', () => {
    const m = decodeOk('1061|ga,10,4,0,7,false,true,true,false') as SOCGameStats;
    expect(m.statType).toBe(GameStatsType.TYPE_PLAYERS);
    expect(m.scores).toEqual([10, 4, 0, 7]);
    expect(m.robots).toEqual([false, true, true, false]);
    expect(encode(m)).toBe('1061|ga,10,4,0,7,false,true,true,false');
  });
  it('TYPE_TIMING: t-prefixed type then long values', () => {
    const m = decodeOk('1061|ga,t2,1700000000,1,0') as SOCGameStats;
    expect(m.statType).toBe(GameStatsType.TYPE_TIMING);
    expect(m.scores).toEqual([1700000000, 1, 0]);
    expect(m.robots).toBeNull();
    expect(encode(m)).toBe('1061|ga,t2,1700000000,1,0');
  });
  it('rejects a t-form claiming TYPE_PLAYERS', () => {
    expect(decode('1061|ga,t1,5')).toBeNull();
  });
});
