// Discovery-flow test: drives the full New-Game option discovery through the
// real connectStore() wiring, using a mock global WebSocket so the store's
// internal GameConnection talks to it. Asserts the exact frame sequence
//   C->S 1080 (GAMEOPTIONGETDEFAULTS request)
//   S->C 1080 (defaults reply, all keys)
//   C->S 1081|<explicit keys> (GAMEOPTIONGETINFOS, NOT "-")
//   S->C 1082 per option + end-of-list "-"
// and that PL / VP / SBL / BC end up as fully-typed descriptors (not unknown),
// seeded with the server's default values from the 1080 reply.
//
// The server frames here are byte-for-byte captures from the live server
// (WS 8888) for a client advertising features ";6pl;sb;sc=2700;".

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SEP, SEP2 } from '../protocol';
import {
  connectStore,
  disconnectStore,
  requestGameOptions,
  useGameStore,
} from './gameStore';

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
  // Install our mock as the global WebSocket the GameConnection default factory uses.
  (globalThis as unknown as { WebSocket: unknown }).WebSocket =
    MockGlobalWS as unknown;
});

afterEach(() => {
  disconnectStore();
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = originalWS;
});

/** Captured live (WS 8888) defaults reply, trimmed to the standard options. */
const DEFAULTS_REPLY =
  '1080|BC=t4,NT=f,PLB=f,SBL=f,N7=f7,RD=f,VP=f10,PL=4';

/** Captured live (WS 8888) full SOCGameOptionInfo frames, all fully typed. */
const INFO_FRAMES: Record<string, string> = {
  BC: '1082|BC|3|-1|1107|t|4|3|9|t|4|0|Break up clumps of # or more same-type hexes/ports',
  NT: '1082|NT|1|1107|1107|f|0|0|0|f|0|1|No trading allowed between players',
  PLB: '1082|PLB|1|1108|1113|f|0|0|0|f|0|1|Use 6-player board',
  SBL: '1082|SBL|1|2000|2000|f|0|0|0|f|0|1|Use sea board',
  N7: '1082|N7|3|-1|1107|f|7|1|999|f|7|0|Roll no 7s during first # rounds',
  RD: '1082|RD|1|-1|1107|f|0|0|0|f|0|0|Robber can\'t return to the desert',
  VP: '1082|VP|3|-1|2000|f|10|10|20|f|10|1|Victory points to win: #',
  PL: '1082|PL|2|-1|1108|f|4|2|6|f|4|0|Maximum # players',
};
const END_MARKER = '1082|-|0|2147483647|2147483647|f|0|0|0|f|0|f|-';

/** Type id of a raw frame string. */
function typeOf(raw: string): number {
  return Number.parseInt(raw.split(SEP)[0], 10);
}

/** Drive connect + handshake, returning the live mock socket. */
function connectAndHandshake(): MockGlobalWS {
  connectStore('localhost', 8888);
  const ws = MockGlobalWS.instances[0];
  ws.open();
  // Server greeting: its VERSION then channels. The client replies with VERSION.
  ws.receive(`9998${SEP}2700${SEP2}2.7.00${SEP2}srv${SEP2}${SEP2}en_US`);
  return ws;
}

describe('New Game option discovery (defaults-first flow)', () => {
  it('sends GAMEOPTIONGETDEFAULTS (1080), not a bare GAMEOPTIONGETINFOS', () => {
    const ws = connectAndHandshake();
    ws.sent = []; // drop the handshake VERSION reply

    requestGameOptions();

    // Two frames: the bare defaults request + the scenario-info request (so
    // the New Game dialog can list scenarios, incl. Cities & Knights SC_CK).
    expect(ws.sent).toHaveLength(2);
    expect(typeOf(ws.sent[0])).toBe(1080);
    // Bare "1080" request (no opts): exactly the type id.
    expect(ws.sent[0]).toBe('1080');
    // SCENARIOINFO client request: "[" marker, the standard scenario keys,
    // and the trailing "?" any-changed marker.
    expect(typeOf(ws.sent[1])).toBe(1101);
    expect(ws.sent[1]).toBe(
      '1101|[|SC_NSHO|SC_4ISL|SC_FOG|SC_TTD|SC_CLVI|SC_PIRI|SC_FTRI|SC_WOND|SC_CK|?',
    );
    expect(useGameStore.getState().optionsRequested).toBe(true);
  });

  it('upserts scenarios (incl. SC_CK) from the SCENARIOINFO replies', () => {
    const ws = connectAndHandshake();
    requestGameOptions();

    // Server reply form: key | minVers | lastModVers | opts | title.
    ws.receive('1101|SC_NSHO|2000|2000|_SC_SEAC=t,SBL=t,VP=t13|New Shores');
    ws.receive(
      '1101|SC_CK|2700|2700|_SC_CK=t,_CK_IMP=t,_CK_KNI=t,_CK_PROG=t,_CK_BARB=t,_CK_METR=t,SBL=t,VP=t13|Cities & Knights',
    );
    ws.receive('1101|-'); // end-of-list marker

    const scenarios = useGameStore.getState().scenarios;
    expect(scenarios.SC_NSHO?.title).toBe('New Shores');
    expect(scenarios.SC_CK?.title).toBe('Cities & Knights');
    expect(scenarios.SC_CK?.opts).toContain('_CK_IMP=t');
  });

  it('replies to the defaults with an EXPLICIT key list GAMEOPTIONGETINFOS', () => {
    const ws = connectAndHandshake();
    requestGameOptions();
    ws.sent = []; // drop the 1080 request

    ws.receive(DEFAULTS_REPLY);

    expect(ws.sent).toHaveLength(1);
    const req = ws.sent[0];
    expect(typeOf(req)).toBe(1081);
    // EXPLICIT keys (not "-"), plus the ?I18N token. Order matches the reply.
    expect(req).toBe('1081|BC,NT,PLB,SBL,N7,RD,VP,PL,?I18N');
    // No bare "-" all-changed token.
    const keys = req.slice(req.indexOf(SEP) + 1).split(SEP2);
    expect(keys).not.toContain('-');
  });

  it('builds fully-typed descriptors for PL/VP/SBL/BC (not unknown)', () => {
    const ws = connectAndHandshake();
    requestGameOptions();
    ws.receive(DEFAULTS_REPLY);

    for (const key of Object.keys(INFO_FRAMES)) {
      ws.receive(INFO_FRAMES[key]);
    }
    ws.receive(END_MARKER);

    const known = useGameStore.getState().knownOptions;
    expect(useGameStore.getState().optionsLoaded).toBe(true);

    // None of the standard options are unknown.
    for (const key of ['PL', 'VP', 'SBL', 'BC', 'N7', 'NT', 'RD', 'PLB']) {
      expect(known[key], `${key} present`).toBeDefined();
      expect(known[key].optType, `${key} typed`).not.toBe('unknown');
    }

    expect(known.PL.optType).toBe('int');
    expect(known.PL.maxIntValue).toBe(6); // 6-player available (feature 6pl)
    expect(known.VP.optType).toBe('intbool');
    expect(known.VP.desc).toBe('Victory points to win: #');
    expect(known.SBL.optType).toBe('bool');
    expect(known.SBL.desc).toBe('Use sea board');
    expect(known.BC.optType).toBe('intbool');
    expect(known.BC.desc).toBe(
      'Break up clumps of # or more same-type hexes/ports',
    );
  });

  it('seeds descriptors with the server default values from the 1080 reply', () => {
    const ws = connectAndHandshake();
    requestGameOptions();
    ws.receive(DEFAULTS_REPLY);
    for (const key of Object.keys(INFO_FRAMES)) {
      ws.receive(INFO_FRAMES[key]);
    }
    ws.receive(END_MARKER);

    const known = useGameStore.getState().knownOptions;
    // Defaults reply had VP=f10, BC=t4, N7=f7, PL=4, SBL=f.
    expect(known.VP.curBoolValue).toBe(false);
    expect(known.VP.curIntValue).toBe(10);
    expect(known.BC.curBoolValue).toBe(true);
    expect(known.BC.curIntValue).toBe(4);
    expect(known.N7.curIntValue).toBe(7);
    expect(known.PL.curIntValue).toBe(4);
    expect(known.SBL.curBoolValue).toBe(false);
  });

  it('does not restart discovery on a second requestGameOptions call', () => {
    const ws = connectAndHandshake();
    requestGameOptions();
    ws.sent = [];
    requestGameOptions(); // already in flight
    expect(ws.sent).toHaveLength(0);
  });
});
