// End-to-end tests for the server reply-reason handlers wired in connectStore():
//   - REJECTOFFER (1037) with a nonzero reasonCode / pn=-1 is a server reply
//     (e.g. a bank/port trade that can't be made) and must surface user feedback
//     instead of being recorded as a seat's "no thanks" trade response.
//   - DECLINEPLAYERREQUEST (1104) carries a decline reason that must be surfaced
//     (e.g. a second dev-card play in one turn) so the request doesn't fail
//     silently.
//
// These drive the REAL connectStore() handler wiring via a mock global
// WebSocket, then receive raw wire frames and assert the store side-effects
// (the transient `error` shown as a toast by GameScreen, and the game log).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RejectOfferReason, SEP, SEP2 } from '../protocol';
import { connectStore, disconnectStore, useGameStore } from './gameStore';

const GAME = 'sea';

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

beforeEach(() => {
  MockGlobalWS.instances = [];
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = MockGlobalWS as unknown;
});

afterEach(() => {
  disconnectStore();
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = originalWS;
});

/** Connect, handshake, and seed a joined 4-seat game with me at seat 0. */
function connectAndSeedGame(): MockGlobalWS {
  connectStore('localhost', 8888);
  const ws = MockGlobalWS.instances[0];
  ws.open();
  ws.receive(`9998${SEP}2700${SEP2}2.7.00${SEP2}srv${SEP2}${SEP2}en_US`);
  // connectStore() runs resetLobby() (clearing currentGame); seed AFTER connect.
  const s = useGameStore.getState();
  s.setNickname('WebPlayer');
  s.joinGameAuth(GAME);
  s.applySitDown(GAME, 0, 'WebPlayer', false);
  s.applySitDown(GAME, 1, 'droid 1', true);
  return ws;
}

function cg() {
  const c = useGameStore.getState().currentGame;
  if (c === null) {
    throw new Error('no current game');
  }
  return c;
}

describe('REJECTOFFER reply-reason handling', () => {
  it('a pn=-1 cannot-make-trade reply surfaces feedback, not a seat response', () => {
    connectAndSeedGame();
    const ws = MockGlobalWS.instances[0];
    // REJECTOFFER game,-1,REASON_CANNOT_MAKE_TRADE (1)
    ws.receive(
      `1037${SEP}${GAME}${SEP2}-1${SEP2}${RejectOfferReason.REASON_CANNOT_MAKE_TRADE}`,
    );

    expect(useGameStore.getState().error).toBe("You can't make that trade.");
    const log = cg().gameLog;
    expect(log[log.length - 1].text).toBe("You can't make that trade.");
    // No seat recorded a 'reject' response.
    expect(cg().offerResponses.every((r) => r === null)).toBe(true);
  });

  it('a REASON_NOT_YOUR_TURN reply maps to the not-your-turn message', () => {
    connectAndSeedGame();
    const ws = MockGlobalWS.instances[0];
    ws.receive(`1037${SEP}${GAME}${SEP2}-1${SEP2}${RejectOfferReason.REASON_NOT_YOUR_TURN}`);
    expect(useGameStore.getState().error).toBe("It's not your turn.");
  });

  it('a plain reject (reasonCode 0, valid pn) records a seat response', () => {
    connectAndSeedGame();
    const ws = MockGlobalWS.instances[0];
    // REJECTOFFER game,1 (no reasonCode) — seat 1 declines my offer.
    ws.receive(`1037${SEP}${GAME}${SEP2}1`);
    expect(cg().offerResponses[1]).toBe('reject');
    // Not surfaced as an error toast.
    expect(useGameStore.getState().error).toBeUndefined();
  });
});

describe('DECLINEPLAYERREQUEST handling', () => {
  it('surfaces a decline reason (e.g. not your turn) to the user', () => {
    connectAndSeedGame();
    const ws = MockGlobalWS.instances[0];
    // DECLINEPLAYERREQUEST game, gameState 0, reasonCode 2 (REASON_NOT_YOUR_TURN)
    ws.receive(`1104${SEP}${GAME}${SEP2}0${SEP2}2`);
    expect(useGameStore.getState().error).toBe("It's not your turn.");
    const log = cg().gameLog;
    expect(log[log.length - 1].text).toBe("It's not your turn.");
  });

  it('prefers a server-supplied localized reasonText when present', () => {
    connectAndSeedGame();
    const ws = MockGlobalWS.instances[0];
    // DECLINEPLAYERREQUEST game, state 0, reasonCode 0, detail 0,0, reasonText
    ws.receive(`1104${SEP}${GAME}${SEP2}0${SEP2}0${SEP2}0${SEP2}0${SEP2}Already played a card this turn.`);
    expect(useGameStore.getState().error).toBe('Already played a card this turn.');
  });
});
