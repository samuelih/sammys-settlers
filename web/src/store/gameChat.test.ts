// Tests for in-game human chat: the sendChat() action sender (encodes a
// SOCGameTextMsg with the joined game's name + the local nickname, never sends
// empty/whitespace text) and the GAMETEXTMSG log reducer wiring (player chat is
// appended as a kind:'chat' entry with its speaker; server text — reserved
// nicknames "Server" / ":" / "-" — stays kind:'server').
//
// These drive the REAL connectStore() handler wiring via a mock global
// WebSocket, following the pattern of tradeReplyReasons.test.ts.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SEP, SEP2, SOCGameTextMsg } from '../protocol';
import { connectStore, disconnectStore, sendChat, useGameStore } from './gameStore';

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

describe('sendChat (action sender)', () => {
  it('encodes a SOCGameTextMsg with the game name and local nickname', () => {
    const ws = connectAndSeedGame();
    ws.sent = []; // drop the handshake VERSION reply

    sendChat('hello table');

    expect(ws.sent).toHaveLength(1);
    expect(ws.sent[0]).toBe(
      new SOCGameTextMsg(GAME, 'WebPlayer', 'hello table').toCmd(),
    );
  });

  it('trims surrounding whitespace before sending', () => {
    const ws = connectAndSeedGame();
    ws.sent = [];

    sendChat('  gg everyone  ');

    expect(ws.sent).toHaveLength(1);
    expect(ws.sent[0]).toBe(
      new SOCGameTextMsg(GAME, 'WebPlayer', 'gg everyone').toCmd(),
    );
  });

  it('does not send empty or whitespace-only messages', () => {
    const ws = connectAndSeedGame();
    ws.sent = [];

    sendChat('');
    sendChat('   ');
    sendChat('\t \n');

    expect(ws.sent).toHaveLength(0);
  });

  it('does not append locally — the line arrives via the server echo', () => {
    // The server echoes GAMETEXTMSG to every member including the sender, so an
    // optimistic local append would duplicate the line.
    connectAndSeedGame();
    sendChat('hello');
    expect(cg().gameLog).toHaveLength(0);
  });
});

describe('GAMETEXTMSG -> game log (reducer wiring)', () => {
  it('appends player chat as a kind:chat entry with the speaker nickname', () => {
    const ws = connectAndSeedGame();

    ws.receive(new SOCGameTextMsg(GAME, 'Alice', 'anyone want wood?').toCmd());

    expect(cg().gameLog).toEqual([
      { text: 'anyone want wood?', kind: 'chat', nickname: 'Alice' },
    ]);
  });

  it('appends the echo of my own chat with my nickname', () => {
    const ws = connectAndSeedGame();

    ws.receive(new SOCGameTextMsg(GAME, 'WebPlayer', 'hi!').toCmd());

    expect(cg().gameLog).toEqual([{ text: 'hi!', kind: 'chat', nickname: 'WebPlayer' }]);
  });

  it('keeps reserved server nicknames ("Server", ":", "-") as server lines', () => {
    const ws = connectAndSeedGame();

    ws.receive(new SOCGameTextMsg(GAME, 'Server', 'You stole a sheep.').toCmd());
    ws.receive(new SOCGameTextMsg(GAME, ':', 'Trade declined.').toCmd());
    ws.receive(new SOCGameTextMsg(GAME, '-', 'dash text').toCmd());

    expect(cg().gameLog).toEqual([
      { text: 'You stole a sheep.', kind: 'server' },
      { text: 'Trade declined.', kind: 'server' },
      { text: 'dash text', kind: 'server' },
    ]);
  });

  it('ignores chat for a game we have not joined', () => {
    const ws = connectAndSeedGame();
    ws.receive(new SOCGameTextMsg('other', 'Alice', 'wrong room').toCmd());
    expect(cg().gameLog).toEqual([]);
  });

  it('appendChatLog reducer stores speaker + kind directly', () => {
    connectAndSeedGame();
    useGameStore.getState().appendChatLog(GAME, 'Bob', 'nice move');
    expect(cg().gameLog).toEqual([{ text: 'nice move', kind: 'chat', nickname: 'Bob' }]);
  });
});
