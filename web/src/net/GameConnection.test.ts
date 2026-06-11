// Unit tests for GameConnection using an injected mock WebSocket. Verifies the
// version handshake, ping echo, message dispatch, state callbacks, send/encode,
// and reconnect robustness — all without a real network.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CLIENT_FEATURES,
  CLIENT_LOCALE,
  CLIENT_VERSION_BUILD,
  CLIENT_VERSION_NUMBER,
  CLIENT_VERSION_STRING,
  type ConnectionState,
  GameConnection,
  type WebSocketLike,
} from './GameConnection';
import {
  MessageType,
  SOCChannels,
  SOCGamesWithOptions,
  SOCServerPing,
  SOCVersion,
} from '../protocol';

/** A controllable mock WebSocket implementing WebSocketLike. */
class MockSocket implements WebSocketLike {
  sent: string[] = [];
  readyState = 1;
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.readyState = 3;
    if (this.onclose) {
      this.onclose({});
    }
  }

  /** Test helper: simulate the socket opening. */
  open(): void {
    this.readyState = 1;
    if (this.onopen) {
      this.onopen({});
    }
  }

  /** Test helper: deliver an inbound text frame. */
  receive(raw: string): void {
    if (this.onmessage) {
      this.onmessage({ data: raw });
    }
  }

  /** Test helper: simulate a socket error. */
  error(): void {
    if (this.onerror) {
      this.onerror({});
    }
  }
}

/** Track every socket the factory hands out, so tests can drive them. */
let sockets: MockSocket[] = [];

function makeConn(): GameConnection {
  return new GameConnection({
    host: 'localhost',
    port: 8888,
    socketFactory: (url) => {
      const s = new MockSocket(url);
      sockets.push(s);
      return s;
    },
  });
}

beforeEach(() => {
  sockets = [];
});

describe('GameConnection url + defaults', () => {
  it('builds ws:// url from host/port', () => {
    const c = makeConn();
    expect(c.url).toBe('ws://localhost:8888');
  });

  it('defaults to ws://localhost:8888', () => {
    const c = new GameConnection({ socketFactory: (url) => new MockSocket(url) });
    expect(c.url).toBe('ws://localhost:8888');
  });
});

describe('GameConnection state callbacks', () => {
  it('reports current state immediately and on transitions', () => {
    const c = makeConn();
    const states: ConnectionState[] = [];
    c.onStateChange((s) => states.push(s));
    expect(states).toEqual(['disconnected']);

    c.connect();
    expect(states).toEqual(['disconnected', 'connecting']);

    sockets[0].open();
    expect(states).toEqual(['disconnected', 'connecting', 'connected']);

    c.close();
    expect(states[states.length - 1]).toBe('disconnected');
  });

  it('reports error on socket error', () => {
    const c = makeConn();
    const states: ConnectionState[] = [];
    c.onStateChange((s) => states.push(s));
    c.connect();
    sockets[0].open();
    sockets[0].error();
    expect(states[states.length - 1]).toBe('error');
  });
});

describe('GameConnection handshake', () => {
  it('replies with our SOCVersion when the server VERSION arrives', () => {
    const c = makeConn();
    c.connect();
    const sock = sockets[0];
    sock.open();

    // No version sent on open.
    expect(sock.sent).toHaveLength(0);

    // Server sends its version.
    sock.receive(new SOCVersion(2700, '2.7.00', '_build', '_feats', null).toCmd());

    expect(sock.sent).toHaveLength(1);
    const reply = SOCVersion.parse(sock.sent[0].substring(sock.sent[0].indexOf('|') + 1));
    expect(reply).not.toBeNull();
    expect(reply?.versNum).toBe(CLIENT_VERSION_NUMBER);
    expect(reply?.versStr).toBe(CLIENT_VERSION_STRING);
    // We advertise a non-null build + client features so the server returns
    // fully-typed sea-board / 6-player / scenario options (not OTYPE_UNKNOWN).
    // build MUST be non-null when feats is sent (Java SOCVersion parity).
    expect(reply?.versBuild).toBe(CLIENT_VERSION_BUILD);
    expect(reply?.feats).toBe(CLIENT_FEATURES);
    expect(reply?.cliLocale).toBe(CLIENT_LOCALE);

    expect(c.getServerVersion()).toBe(2700);
  });

  it('only replies to the first server VERSION (handshake once)', () => {
    const c = makeConn();
    c.connect();
    const sock = sockets[0];
    sock.open();
    sock.receive(new SOCVersion(2700, '2.7.00', null, null, null).toCmd());
    sock.receive(new SOCVersion(2700, '2.7.00', null, null, null).toCmd());
    expect(sock.sent).toHaveLength(1);
  });
});

describe('GameConnection ping echo', () => {
  it('echoes SERVERPING back to the server', () => {
    const c = makeConn();
    c.connect();
    const sock = sockets[0];
    sock.open();

    const pingCmd = new SOCServerPing(42).toCmd();
    sock.receive(pingCmd);

    expect(sock.sent).toContain(pingCmd);
  });
});

describe('GameConnection dispatch', () => {
  it('routes decoded messages to type handlers and the catch-all', () => {
    const c = makeConn();
    const typed = vi.fn();
    const any = vi.fn();
    c.on(MessageType.CHANNELS, typed);
    c.onMessage(any);
    c.connect();
    const sock = sockets[0];
    sock.open();

    sock.receive(new SOCChannels(['general']).toCmd());

    expect(typed).toHaveBeenCalledTimes(1);
    const arg = typed.mock.calls[0][0] as SOCChannels;
    expect(arg.channels).toEqual(['general']);
    // Catch-all sees it too.
    expect(any).toHaveBeenCalled();
  });

  it('unsubscribes a handler when its disposer is called', () => {
    const c = makeConn();
    const typed = vi.fn();
    const off = c.on(MessageType.CHANNELS, typed);
    c.connect();
    const sock = sockets[0];
    sock.open();
    off();
    sock.receive(new SOCChannels([]).toCmd());
    expect(typed).not.toHaveBeenCalled();
  });

  it('ignores garbled / unknown frames without throwing', () => {
    const c = makeConn();
    const any = vi.fn();
    c.onMessage(any);
    c.connect();
    const sock = sockets[0];
    sock.open();
    sock.receive('not-a-message');
    sock.receive('424242|whatever');
    expect(any).not.toHaveBeenCalled();
  });

  it('parses a GAMESWITHOPTIONS list', () => {
    const c = makeConn();
    let got: SOCGamesWithOptions | null = null;
    c.on(MessageType.GAMESWITHOPTIONS, (m) => {
      got = m as SOCGamesWithOptions;
    });
    c.connect();
    const sock = sockets[0];
    sock.open();
    sock.receive(new SOCGamesWithOptions([{ name: 'g1', optsStr: '-' }]).toCmd());
    expect(got).not.toBeNull();
    expect(got!.games[0].name).toBe('g1');
  });
});

describe('GameConnection send', () => {
  it('encodes and sends a message', () => {
    const c = makeConn();
    c.connect();
    const sock = sockets[0];
    sock.open();
    c.send(new SOCChannels(['x']));
    expect(sock.sent).toContain(new SOCChannels(['x']).toCmd());
  });

  it('is a no-op (no throw) when not connected', () => {
    const c = makeConn();
    expect(() => c.send(new SOCChannels([]))).not.toThrow();
  });
});

describe('GameConnection reconnect', () => {
  it('connect() while already connected tears down the old socket and makes a new one', () => {
    const c = makeConn();
    c.connect();
    const first = sockets[0];
    first.open();

    c.connect();
    expect(first.closed).toBe(true);
    expect(sockets).toHaveLength(2);

    const second = sockets[1];
    second.open();
    // New socket performs a fresh handshake.
    second.receive(new SOCVersion(2700, '2.7.00', null, null, null).toCmd());
    expect(second.sent).toHaveLength(1);
  });

  it('close() lands in disconnected, not error, and suppresses late errors', () => {
    const c = makeConn();
    const states: ConnectionState[] = [];
    c.onStateChange((s) => states.push(s));
    c.connect();
    const sock = sockets[0];
    sock.open();
    c.close();
    // A late error from the dead socket must not flip us to error.
    sock.error();
    expect(c.getState()).toBe('disconnected');
    expect(states).not.toContain('error');
  });

  it('can connect again after close()', () => {
    const c = makeConn();
    c.connect();
    sockets[0].open();
    c.close();
    c.connect();
    expect(sockets).toHaveLength(2);
    sockets[1].open();
    expect(c.getState()).toBe('connected');
  });
});
