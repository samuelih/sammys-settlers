// GameConnection — browser WebSocket transport to the Java SOCServer.
//
// Wraps a single WebSocket to ws://HOST:PORT (default ws://localhost:8888) and
// speaks the SOCMessage protocol: each text frame carries exactly one toCmd()
// string (no writeUTF framing — see web/docs/MIGRATION_SPEC.md section 2).
//
// Responsibilities:
//   * Open/close the socket and expose a connection-state callback.
//   * Decode inbound frames (protocol decode) and dispatch to per-type handlers.
//   * Perform the version handshake: when the server's SOCVersion arrives, send
//     our SOCVersion. Echo SOCServerPing back to the server.
//   * Encode + send outbound SOCMessages.
//   * Be robust to reconnect: each connect() builds a fresh socket and resets
//     handshake state; close() tears down cleanly without firing reconnects.
//
// This module is pure transport — no React, no Zustand. The store subscribes to
// it (see ../store/gameStore.ts).

import {
  decode,
  encode,
  MessageType,
  SOCServerPing,
  SOCVersion,
  type SOCMessage,
} from '../protocol';

/** Our reported client version number (2.7.00). */
export const CLIENT_VERSION_NUMBER = 2700;
/** Our reported client version display string. */
export const CLIENT_VERSION_STRING = '2.7.00';
/** Locale we report to the server in our SOCVersion handshake. */
export const CLIENT_LOCALE = 'en_US';

/** Default WebSocket host when none is supplied. */
export const DEFAULT_HOST = 'localhost';
/** Default WebSocket port when none is supplied (matches the Java runServer prop). */
export const DEFAULT_PORT = 8888;

/**
 * Lifecycle state of a {@link GameConnection}. Mirrors the store's `status`
 * field but is owned here so the transport can drive it.
 */
export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

/**
 * A handler for one decoded message type. Receives the already-decoded
 * {@link SOCMessage}; narrow it by `msg.type` or cast to the concrete class.
 */
export type MessageHandler = (msg: SOCMessage) => void;

/** Callback invoked whenever the connection state changes. */
export type StateHandler = (state: ConnectionState, detail?: string) => void;

/**
 * Minimal structural type for the parts of the WebSocket API we use. Lets unit
 * tests inject a mock socket without depending on a real browser WebSocket.
 */
export interface WebSocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  readonly readyState: number;
}

/** Factory that builds a {@link WebSocketLike} for a given ws:// URL. */
export type WebSocketFactory = (url: string) => WebSocketLike;

/**
 * Options for constructing a {@link GameConnection}.
 */
export interface GameConnectionOptions {
  /** Server host, default {@link DEFAULT_HOST}. */
  host?: string;
  /** Server port, default {@link DEFAULT_PORT}. */
  port?: number;
  /**
   * Factory for the underlying socket. Defaults to the browser `WebSocket`.
   * Tests pass a mock here.
   */
  socketFactory?: WebSocketFactory;
}

/** Default factory: the real browser WebSocket, typed to our structural shape. */
function defaultSocketFactory(url: string): WebSocketLike {
  return new WebSocket(url) as unknown as WebSocketLike;
}

/**
 * WebSocket wrapper for the JSettlers protocol. Construct one, register
 * handlers with {@link on} / {@link onMessage} / {@link onStateChange}, then
 * call {@link connect}.
 */
export class GameConnection {
  private host: string;
  private port: number;
  private readonly socketFactory: WebSocketFactory;

  /** The active socket, or null when disconnected. */
  private socket: WebSocketLike | null = null;

  /** Current lifecycle state. */
  private state: ConnectionState = 'disconnected';

  /** Per-type message handlers. */
  private readonly handlers: Map<number, Set<MessageHandler>> = new Map();

  /** Catch-all handlers invoked for every decoded message. */
  private readonly anyHandlers: Set<MessageHandler> = new Set();

  /** Connection-state change handlers. */
  private readonly stateHandlers: Set<StateHandler> = new Set();

  /**
   * Whether the version handshake has completed (we've sent our SOCVersion in
   * response to the server's). Reset on each {@link connect}.
   */
  private handshakeDone = false;

  /** Server's reported version number, captured from its SOCVersion. */
  private serverVersionNumber: number | null = null;

  /** True while a caller-initiated {@link close} is in progress, to suppress error states. */
  private closing = false;

  constructor(options: GameConnectionOptions = {}) {
    this.host = options.host ?? DEFAULT_HOST;
    this.port = options.port ?? DEFAULT_PORT;
    this.socketFactory = options.socketFactory ?? defaultSocketFactory;
  }

  /** The ws:// URL this connection targets. */
  get url(): string {
    return `ws://${this.host}:${this.port}`;
  }

  /** The current connection state. */
  getState(): ConnectionState {
    return this.state;
  }

  /** The server's version number, or null until its SOCVersion is received. */
  getServerVersion(): number | null {
    return this.serverVersionNumber;
  }

  /**
   * Register a handler for a specific message type. Returns an unsubscribe
   * function.
   *
   * @param type     a {@link MessageType} id
   * @param handler  called with the decoded message of that type
   */
  on(type: number, handler: MessageHandler): () => void {
    let set = this.handlers.get(type);
    if (set === undefined) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);
    return () => {
      set?.delete(handler);
    };
  }

  /**
   * Register a catch-all handler invoked for every decoded message (after any
   * type-specific handlers). Returns an unsubscribe function.
   */
  onMessage(handler: MessageHandler): () => void {
    this.anyHandlers.add(handler);
    return () => {
      this.anyHandlers.delete(handler);
    };
  }

  /**
   * Register a connection-state callback. Immediately invoked with the current
   * state. Returns an unsubscribe function.
   */
  onStateChange(handler: StateHandler): () => void {
    this.stateHandlers.add(handler);
    handler(this.state);
    return () => {
      this.stateHandlers.delete(handler);
    };
  }

  /**
   * Open the WebSocket and begin the handshake. If a socket is already open it
   * is closed first (robust to reconnect). Optionally retarget host/port.
   *
   * @param host  optional new host; defaults to the existing host
   * @param port  optional new port; defaults to the existing port
   */
  connect(host?: string, port?: number): void {
    if (host !== undefined) {
      this.host = host;
    }
    if (port !== undefined) {
      this.port = port;
    }

    // Tear down any existing socket cleanly before reconnecting.
    if (this.socket !== null) {
      this.teardownSocket();
    }

    this.handshakeDone = false;
    this.serverVersionNumber = null;
    this.closing = false;
    this.setState('connecting');

    let sock: WebSocketLike;
    try {
      sock = this.socketFactory(this.url);
    } catch (err) {
      this.setState('error', err instanceof Error ? err.message : String(err));
      return; // <--- Early return: socket construction failed ---
    }
    this.socket = sock;

    sock.onopen = () => {
      this.setState('connected');
      // Per the handshake, we do NOT send our SOCVersion on open; we wait for
      // the server's SOCVersion and reply to it (see handleInbound).
    };
    sock.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        this.handleInbound(ev.data);
      }
    };
    sock.onerror = (ev) => {
      if (!this.closing) {
        const detail =
          ev instanceof Error ? ev.message : 'WebSocket error';
        this.setState('error', detail);
      }
    };
    sock.onclose = () => {
      this.socket = null;
      this.handshakeDone = false;
      if (!this.closing && this.state !== 'error') {
        this.setState('disconnected');
      }
    };
  }

  /**
   * Send a message to the server (encodes via the protocol layer). No-op with a
   * warning if the socket isn't open.
   *
   * @param msg  the message to send
   */
  send(msg: SOCMessage): void {
    if (this.socket === null) {
      // Robust: don't throw on a send to a closed connection.
      return; // <--- Early return: no socket ---
    }
    this.socket.send(encode(msg));
  }

  /**
   * Close the connection. Suppresses the reconnect/error path so a deliberate
   * close lands in `disconnected`.
   */
  close(): void {
    this.closing = true;
    if (this.socket !== null) {
      this.teardownSocket();
    }
    this.setState('disconnected');
  }

  /** Detach handlers from and close the current socket without state changes. */
  private teardownSocket(): void {
    const sock = this.socket;
    this.socket = null;
    if (sock === null) {
      return; // <--- Early return: nothing to tear down ---
    }
    sock.onopen = null;
    sock.onmessage = null;
    sock.onerror = null;
    sock.onclose = null;
    try {
      sock.close();
    } catch {
      // Ignore close() errors on an already-dead socket.
    }
  }

  /**
   * Decode and dispatch one inbound frame. Performs handshake bookkeeping:
   *   * On the server's SOCVersion, capture its version and reply with ours.
   *   * On SOCServerPing, echo it back.
   * Then invokes type-specific and catch-all handlers.
   *
   * @param raw  the raw text frame (one toCmd string)
   */
  private handleInbound(raw: string): void {
    const msg = decode(raw);
    if (msg === null) {
      return; // <--- Early return: unknown/garbled frame, ignored like Java ---
    }

    // Handshake / transport-level handling happens BEFORE user handlers so the
    // store sees a fully-handshaked connection.
    if (msg.type === MessageType.VERSION) {
      const v = msg as SOCVersion;
      this.serverVersionNumber = v.versNum;
      if (!this.handshakeDone) {
        this.handshakeDone = true;
        // Reply with our SOCVersion (build/feats null, locale en_US).
        this.send(
          new SOCVersion(
            CLIENT_VERSION_NUMBER,
            CLIENT_VERSION_STRING,
            null,
            null,
            CLIENT_LOCALE,
          ),
        );
      }
    } else if (msg.type === MessageType.SERVERPING) {
      // Echo the ping back to the server (keep-alive).
      this.send(msg as SOCServerPing);
    }

    this.dispatch(msg);
  }

  /** Invoke type-specific then catch-all handlers for a decoded message. */
  private dispatch(msg: SOCMessage): void {
    const set = this.handlers.get(msg.type);
    if (set !== undefined) {
      for (const h of set) {
        h(msg);
      }
    }
    for (const h of this.anyHandlers) {
      h(msg);
    }
  }

  /** Update state and notify state handlers (only on actual change). */
  private setState(state: ConnectionState, detail?: string): void {
    this.state = state;
    for (const h of this.stateHandlers) {
      h(state, detail);
    }
  }
}
