// gameStore — Zustand store for connection + lobby state.
//
// Holds the connection lifecycle status, the server version, the chat-channel
// list, and the lobby's game list. Pure reducers (the `set*`/`upsertGame`/
// `removeGame` actions) are driven by protocol messages dispatched from a
// GameConnection (see connectStore() at the bottom).
//
// Later phases extend this with current-game / board / players / hand / turn /
// gameState. This phase only covers connectivity + lobby list rendering.

import { create } from 'zustand';

import {
  MessageType,
  type SOCMessage,
  SOCChannels,
  SOCDeleteGame,
  SOCGames,
  SOCGamesWithOptions,
  SOCNewGame,
  SOCNewGameWithOptions,
  SOCStatusMessage,
  SOCVersion,
  StatusValue,
} from '../protocol';
import {
  type ConnectionState,
  DEFAULT_HOST,
  DEFAULT_PORT,
  GameConnection,
} from '../net/GameConnection';

/**
 * One game as shown in the lobby list. The web client only needs the name, a
 * human-readable options summary, and whether the game has started; richer
 * per-game state arrives later (Phase 2+).
 */
export interface GameInfo {
  /** Game name (the unjoinable marker prefix, if any, has been stripped). */
  name: string;
  /**
   * Short summary of the game's options for display, e.g. the packed option
   * string ("-" when none). Empty string when unknown.
   */
  options: string;
  /** Whether the game has already started (in-progress, not joinable as a new player). */
  started: boolean;
}

/** Connection lifecycle status surfaced to the UI. */
export type ConnectionStatus = ConnectionState;

/**
 * Store shape: connection state + lobby data + reducer actions. Reducers are
 * synchronous and pure (no network side effects); connectStore() wires a
 * GameConnection's messages to them.
 */
export interface GameStoreState {
  /** Current connection status. */
  status: ConnectionStatus;
  /** Server version number once known (from the server's SOCVersion). */
  serverVersion?: number;
  /** Server version display string once known. */
  serverVersionStr?: string;
  /** Chat-channel names from SOCChannels. */
  channels: string[];
  /** Lobby game list. */
  games: GameInfo[];
  /** Last error / status text, if any. */
  error?: string;

  /** Set the connection status (and optionally an error detail). */
  setStatus: (status: ConnectionStatus, error?: string) => void;
  /** Record the server's version (number + display string). */
  setServerVersion: (versNum: number, versStr?: string) => void;
  /** Replace the channel list (from SOCChannels). */
  setChannels: (channels: string[]) => void;
  /**
   * Insert or update one game (from NEWGAME / NEWGAMEWITHOPTIONS). Keyed by
   * name; merges fields so a NEWGAME after a NEWGAMEWITHOPTIONS doesn't clobber
   * known options.
   */
  upsertGame: (game: GameInfo) => void;
  /** Remove a game by name (from DELETEGAME). */
  removeGame: (name: string) => void;
  /** Replace the whole game list (from GAMES / GAMESWITHOPTIONS). */
  setGames: (games: GameInfo[]) => void;
  /** Set a transient error/status message. */
  setError: (error?: string) => void;
  /** Reset lobby data to its initial empty state (e.g. on a fresh connect). */
  resetLobby: () => void;
}

/**
 * The unjoinable marker prefix ('?') from SOCGames.MARKER_THIS_GAME_UNJOINABLE.
 * A game name may carry it; we strip it for display but it doesn't affect the
 * connectivity phase otherwise.
 */
const MARKER_UNJOINABLE = '?';

/** Strip the leading unjoinable marker from a game name, if present. */
function cleanGameName(name: string): string {
  return name.startsWith(MARKER_UNJOINABLE) ? name.substring(1) : name;
}

/**
 * Whether a {@link SOCStatusMessage} status value is a success/info code rather
 * than an error. Mirrors the Java client (soc/client/MessageHandler.java
 * handleSTATUSMESSAGE), which collapses SV_OK_SET_NICKNAME and
 * SV_OK_DEBUG_MODE_ON to SV_OK and then treats only `sv == SV_OK` as "OK".
 * Such statuses (welcome text, "Debugging is On.", etc.) must NOT be surfaced as
 * connection errors.
 */
export function isOkStatusValue(svalue: number): boolean {
  return (
    svalue === StatusValue.SV_OK ||
    svalue === StatusValue.SV_OK_SET_NICKNAME ||
    svalue === StatusValue.SV_OK_DEBUG_MODE_ON
  );
}

/**
 * The Zustand store. Components subscribe with `useGameStore(selector)`; the
 * connection module calls actions via `useGameStore.getState()`.
 */
export const useGameStore = create<GameStoreState>((set) => ({
  status: 'disconnected',
  serverVersion: undefined,
  serverVersionStr: undefined,
  channels: [],
  games: [],
  error: undefined,

  setStatus: (status, error) =>
    set((s) => ({
      status,
      // Clear a stale error when we leave the error state, unless one is given.
      error: error !== undefined ? error : status === 'error' ? s.error : undefined,
    })),

  setServerVersion: (versNum, versStr) =>
    set({ serverVersion: versNum, serverVersionStr: versStr }),

  setChannels: (channels) => set({ channels: [...channels] }),

  upsertGame: (game) =>
    set((s) => {
      const name = cleanGameName(game.name);
      const idx = s.games.findIndex((g) => g.name === name);
      const next = s.games.slice();
      const incoming: GameInfo = { ...game, name };
      if (idx === -1) {
        next.push(incoming);
      } else {
        // Merge: keep a previously-known non-empty options string / started flag
        // if the incoming one is the default/unknown.
        const prev = next[idx];
        next[idx] = {
          name,
          options: incoming.options !== '' ? incoming.options : prev.options,
          started: incoming.started || prev.started,
        };
      }
      return { games: next };
    }),

  removeGame: (name) =>
    set((s) => {
      const clean = cleanGameName(name);
      return { games: s.games.filter((g) => g.name !== clean) };
    }),

  setGames: (games) =>
    set({ games: games.map((g) => ({ ...g, name: cleanGameName(g.name) })) }),

  setError: (error) => set({ error }),

  resetLobby: () =>
    set({
      channels: [],
      games: [],
      error: undefined,
      serverVersion: undefined,
      serverVersionStr: undefined,
    }),
}));

/**
 * Build a {@link GameInfo} from a SOCGamesWithOptions entry. The options string
 * is the packed option string ("-" when none); a leading unjoinable marker on
 * the name is stripped by the reducer. "Started" isn't conveyed by this message
 * at this phase, so it defaults to false.
 */
export function gameInfoFromWithOptions(name: string, optsStr: string): GameInfo {
  // SOCNewGameWithOptions parses `opts` with nextToken(SEP), so a no-options
  // game arrives as ",-" (and a real one as ",BC=t4,...") — the leading "," is
  // cosmetic only (see SOCNewGameWithOptions.java javadoc). The GAMESWITHOPTIONS
  // path yields a clean "-". Strip a single leading "," so both paths collapse a
  // no-options game to '' and display real options without a stray comma.
  const o = optsStr.startsWith(',') ? optsStr.slice(1) : optsStr;
  return { name, options: o === '-' ? '' : o, started: false };
}

/** Module-level singleton connection, created lazily by connectStore(). */
let connection: GameConnection | null = null;

/**
 * Get the active connection, if any (for components that need to send messages
 * later). Null until connectStore() has been called.
 */
export function getConnection(): GameConnection | null {
  return connection;
}

/**
 * Create a {@link GameConnection}, subscribe it to the store, and connect.
 *
 * Wires protocol messages to store reducers:
 *   * connection-state changes        -> setStatus
 *   * SOCVersion (server)             -> setServerVersion
 *   * SOCChannels                     -> setChannels
 *   * SOCGames / SOCGamesWithOptions  -> setGames
 *   * SOCNewGame / SOCNewGameWithOptions -> upsertGame
 *   * SOCDeleteGame                   -> removeGame
 *   * SOCStatusMessage                -> setError (text)
 *
 * Idempotent-ish: a second call closes the previous connection and starts a new
 * one (supports reconnect / changing host/port).
 *
 * @param host  server host (default localhost)
 * @param port  server port (default 8888)
 * @returns the created connection
 */
export function connectStore(
  host: string = DEFAULT_HOST,
  port: number = DEFAULT_PORT,
): GameConnection {
  const store = useGameStore.getState();

  // Tear down any prior connection before creating a new one.
  if (connection !== null) {
    connection.close();
    connection = null;
  }

  store.resetLobby();

  const conn = new GameConnection({ host, port });
  connection = conn;

  conn.onStateChange((state, detail) => {
    useGameStore.getState().setStatus(state, detail);
  });

  conn.on(MessageType.VERSION, (msg: SOCMessage) => {
    const v = msg as SOCVersion;
    useGameStore.getState().setServerVersion(v.versNum, v.versStr);
  });

  conn.on(MessageType.CHANNELS, (msg: SOCMessage) => {
    const c = msg as SOCChannels;
    useGameStore.getState().setChannels([...c.channels]);
  });

  conn.on(MessageType.GAMES, (msg: SOCMessage) => {
    const g = msg as SOCGames;
    useGameStore.getState().setGames(
      g.games.map((name) => ({ name, options: '', started: false })),
    );
  });

  conn.on(MessageType.GAMESWITHOPTIONS, (msg: SOCMessage) => {
    const g = msg as SOCGamesWithOptions;
    useGameStore.getState().setGames(
      g.games.map((entry) => gameInfoFromWithOptions(entry.name, entry.optsStr)),
    );
  });

  conn.on(MessageType.NEWGAME, (msg: SOCMessage) => {
    const g = msg as SOCNewGame;
    useGameStore.getState().upsertGame({ name: g.game, options: '', started: false });
  });

  conn.on(MessageType.NEWGAMEWITHOPTIONS, (msg: SOCMessage) => {
    const g = msg as SOCNewGameWithOptions;
    useGameStore
      .getState()
      .upsertGame(gameInfoFromWithOptions(g.game, g.opts ?? ''));
  });

  conn.on(MessageType.DELETEGAME, (msg: SOCMessage) => {
    const g = msg as SOCDeleteGame;
    useGameStore.getState().removeGame(g.game);
  });

  conn.on(MessageType.STATUSMESSAGE, (msg: SOCMessage) => {
    const sm = msg as SOCStatusMessage;
    // SOCStatusMessage is also used for OK/info notifications at connect time
    // (welcome text, "Debugging is On.", etc.), not only for errors. The Java
    // client distinguishes via svalue: see soc/client/MessageHandler.java, which
    // calls showStatus(text, sv == SV_OK, ...). Only genuine error codes belong
    // in store.error; OK/info statuses must not be shown as connection errors.
    if (!isOkStatusValue(sm.svalue)) {
      useGameStore.getState().setError(sm.status);
    }
  });

  conn.connect();
  return conn;
}

/**
 * Close and clear the active connection (used by tests and a future Disconnect
 * button). Sets the store back to `disconnected`.
 */
export function disconnectStore(): void {
  if (connection !== null) {
    connection.close();
    connection = null;
  }
  useGameStore.getState().setStatus('disconnected');
}
