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
  EMPTYSTR,
  GAME_STATE_MIN_STARTED,
  GameState,
  MessageType,
  SeatLockState,
  type SeatLockStateValue,
  type SOCMessage,
  SOCChannels,
  SOCDeleteGame,
  SOCGameMembers,
  SOCGameOptionGetDefaults,
  SOCGameOptionGetInfos,
  SOCGameOptionInfo,
  SOCGames,
  SOCGameState,
  SOCGamesWithOptions,
  SOCJoinGame,
  SOCJoinGameAuth,
  SOCLeaveGame,
  SOCNewGame,
  SOCNewGameWithOptions,
  SOCNewGameWithOptionsRequest,
  SOCScenarioInfo,
  type ScenarioDetails,
  SOCSetSeatLock,
  SOCSitDown,
  SOCStartGame,
  SOCStatusMessage,
  SOCVersion,
  StatusValue,
  type GameOptionDescriptor,
  descriptorFromInfo,
  mergeDefaultValue,
  parseDefaultsKeys,
  serializeOptions,
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
 * One seat in a joined game's room. Null = empty/vacant seat. Mirrors the
 * server's per-seat view: the occupant's name, whether it's a robot, and the
 * seat's lock state (controls whether a bot may be placed there at start).
 */
export interface RoomPlayer {
  /** Occupant's nickname. */
  name: string;
  /** True if this seat holds a robot/bot. */
  isRobot: boolean;
}

/**
 * The room state for the game the local client has currently joined (and which
 * has not yet started). Populated from SOCJoinGameAuth / SOCSitDown /
 * SOCGameMembers / SOCSetSeatLock / SOCGameState / SOCStartGame; cleared on
 * SOCLeaveGame / SOCDeleteGame for the joined game.
 */
export interface CurrentGame {
  /** Game name. */
  gameName: string;
  /** Packed options summary for display (clean form, "" when none). */
  options: string;
  /** All members (players + observers) of the game. */
  members: string[];
  /** Per-seat occupant, indexed by seat number; null = vacant. Length maxPlayers. */
  players: (RoomPlayer | null)[];
  /** Per-seat lock state, indexed by seat number. Length maxPlayers. */
  seatLocks: SeatLockStateValue[];
  /** The local player's seat number, or -1 if observing / not yet seated. */
  mySeat: number;
  /** Current game state (a {@link GameState} value); 0 = NEW. */
  gameState: number;
  /** Max number of players (seats) in this game. */
  maxPlayers: number;
  /** True once the local client has received SOCJoinGameAuth for this game. */
  iJoined: boolean;
}

/** Default max players when a game's "PL" option is unknown. */
const DEFAULT_MAX_PLAYERS = 4;

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
  /**
   * Known game-option descriptors, keyed by option key, built from
   * GAMEOPTIONINFO replies. Empty until {@link requestGameOptions} runs.
   */
  knownOptions: Record<string, GameOptionDescriptor>;
  /** True once the server has finished sending option info (saw the end marker). */
  optionsLoaded: boolean;
  /**
   * True once option discovery has been kicked off (GAMEOPTIONGETDEFAULTS sent),
   * so a second New-Game-dialog open doesn't restart the in-flight discovery.
   */
  optionsRequested: boolean;
  /**
   * Server-default raw value strings keyed by option key, captured from the
   * GAMEOPTIONGETDEFAULTS reply. Merged onto each descriptor (via
   * {@link mergeDefaultValue}) once its full GAMEOPTIONINFO arrives, so the New
   * Game dialog opens at the server's current new-game defaults.
   */
  pendingOptionDefaults: Record<string, string>;
  /** Known scenarios, keyed by scenario key, built from SCENARIOINFO replies. */
  scenarios: Record<string, ScenarioDetails>;
  /** The local client's nickname (names the connection on first create/join). */
  nickname: string;
  /** The room state of the game the client has currently joined, or null. */
  currentGame: CurrentGame | null;

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

  // --- Registries (option / scenario info) ---

  /** Set/replace the local nickname. */
  setNickname: (nickname: string) => void;
  /** Merge one option descriptor into the known-options registry (by key). */
  upsertOption: (opt: GameOptionDescriptor) => void;
  /** Mark the known-options registry as fully loaded (end-of-list marker seen). */
  setOptionsLoaded: (loaded: boolean) => void;
  /** Mark that option discovery has been started (GAMEOPTIONGETDEFAULTS sent). */
  setOptionsRequested: (requested: boolean) => void;
  /** Store the server's default value strings (from GAMEOPTIONGETDEFAULTS). */
  setPendingOptionDefaults: (defaults: Record<string, string>) => void;
  /** Merge one scenario into the scenarios registry (by key). */
  upsertScenario: (scenario: ScenarioDetails) => void;

  // --- Current-game room reducers ---

  /**
   * Begin tracking a joined game (from SOCJoinGameAuth). Creates a fresh
   * {@link CurrentGame} with empty seats sized to the game's max players (looked
   * up from the lobby list / "PL" option), marking the local client as joined.
   */
  joinGameAuth: (gameName: string) => void;
  /** Replace the joined game's member list (from SOCGameMembers). */
  setGameMembers: (gameName: string, members: string[]) => void;
  /** Seat a player (from SOCSitDown); updates mySeat when it's the local client. */
  applySitDown: (
    gameName: string,
    playerNumber: number,
    name: string,
    isRobot: boolean,
  ) => void;
  /** Apply a single-seat or all-seats lock change (from SOCSetSeatLock). */
  applySeatLock: (msg: SOCSetSeatLock) => void;
  /** Update the joined game's state (from SOCGameState / SOCStartGame). */
  setGameState: (gameName: string, state: number) => void;
  /** Clear the joined-game room if it matches `gameName` (LEAVE / DELETE). */
  clearCurrentGame: (gameName: string) => void;
}

/**
 * The unjoinable marker prefix ('?') from SOCGames.MARKER_THIS_GAME_UNJOINABLE.
 * A game name may carry it; we strip it for display but it doesn't affect the
 * connectivity phase otherwise.
 */
const MARKER_UNJOINABLE = '?';

/** Default nickname used to name the connection on first create/join. */
export const DEFAULT_NICKNAME = 'WebPlayer';

/** Strip the leading unjoinable marker from a game name, if present. */
function cleanGameName(name: string): string {
  return name.startsWith(MARKER_UNJOINABLE) ? name.substring(1) : name;
}

/**
 * Derive a game's max player count from its packed options summary. Mirrors the
 * server exactly: {@code SOCGame}'s constructor sets maxPlayers to 6 when EITHER
 * the "PL" option is > 4 (i.e. PL=5 or PL=6) OR the "PLB" ("use 6-player board")
 * boolean option is set; otherwise 4. Earlier code only matched PL===6, so a
 * PL=5 or PLB-only game was sized to 4 seats and seats 4/5 (and their bots/locks)
 * were silently dropped.
 *
 * The lobby `options` field is the comma-stripped packed form (see
 * {@link gameInfoFromWithOptions}), so "PL=5,PLB=t" / "PL=4,PLB=t" are typical
 * inputs; the `(?:^|,)` anchor handles both leading and mid-string positions.
 * PLB is treated as truthy only for an explicit t/y boolean char (serializeOptions
 * emits "PLB=t"); a bare "PLB=" with no/false char does not count.
 *
 * @param optionsSummary  the clean packed options string (e.g. "BC=t4,PL=5,PLB=t")
 * @returns the max-players count (4 or 6, default 4)
 */
export function maxPlayersFromOptions(optionsSummary: string): number {
  const m = /(?:^|,)PL=(\d+)/.exec(optionsSummary);
  const pl = m !== null ? Number.parseInt(m[1], 10) : DEFAULT_MAX_PLAYERS;
  const plb = /(?:^|,)PLB=[tTyY]/.test(optionsSummary);
  return plb || pl > 4 ? 6 : DEFAULT_MAX_PLAYERS;
}

/**
 * Return a copy of `arr` resized to `length`: existing entries are kept (and
 * truncated if shrinking); new slots are filled with `fill`. Used to grow a
 * room's seat arrays when the server's authoritative all-seats greeting reveals
 * more seats than the option-string heuristic guessed.
 */
function resizeArray<T>(arr: readonly T[], length: number, fill: T): T[] {
  const out = new Array<T>(length).fill(fill);
  for (let i = 0; i < length && i < arr.length; i++) {
    out[i] = arr[i];
  }
  return out;
}

/** Build a fresh, all-empty {@link CurrentGame} for a just-joined game. */
function makeCurrentGame(
  gameName: string,
  options: string,
  maxPlayers: number,
): CurrentGame {
  return {
    gameName,
    options,
    members: [],
    players: new Array<RoomPlayer | null>(maxPlayers).fill(null),
    seatLocks: new Array<SeatLockStateValue>(maxPlayers).fill(
      SeatLockState.UNLOCKED,
    ),
    mySeat: -1,
    gameState: GameState.NEW,
    maxPlayers,
    iJoined: true,
  };
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
  knownOptions: {},
  optionsLoaded: false,
  optionsRequested: false,
  pendingOptionDefaults: {},
  scenarios: {},
  nickname: DEFAULT_NICKNAME,
  currentGame: null,

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
      knownOptions: {},
      optionsLoaded: false,
      optionsRequested: false,
      pendingOptionDefaults: {},
      scenarios: {},
      currentGame: null,
    }),

  setNickname: (nickname) => set({ nickname }),

  upsertOption: (opt) =>
    set((s) => {
      // Seed the descriptor with the server's default value (captured earlier
      // from GAMEOPTIONGETDEFAULTS) so the dialog opens at the current default.
      const raw = s.pendingOptionDefaults[opt.key];
      const merged = raw !== undefined ? mergeDefaultValue(opt, raw) : opt;
      return { knownOptions: { ...s.knownOptions, [opt.key]: merged } };
    }),

  setOptionsLoaded: (loaded) => set({ optionsLoaded: loaded }),

  setOptionsRequested: (requested) => set({ optionsRequested: requested }),

  setPendingOptionDefaults: (defaults) =>
    set({ pendingOptionDefaults: { ...defaults } }),

  upsertScenario: (scenario) =>
    set((s) => ({
      scenarios: { ...s.scenarios, [scenario.key]: scenario },
    })),

  joinGameAuth: (gameName) =>
    set((s) => {
      const name = cleanGameName(gameName);
      // If we already have a room for this game (e.g. AUTH after we created it),
      // keep its accumulated seats; otherwise start a fresh room sized from the
      // lobby game's options.
      if (s.currentGame !== null && s.currentGame.gameName === name) {
        return { currentGame: { ...s.currentGame, iJoined: true } };
      }
      const lobbyGame = s.games.find((g) => g.name === name);
      const options = lobbyGame?.options ?? '';
      const maxPlayers = maxPlayersFromOptions(options);
      return { currentGame: makeCurrentGame(name, options, maxPlayers) };
    }),

  setGameMembers: (gameName, members) =>
    set((s) => {
      const cg = s.currentGame;
      if (cg === null || cg.gameName !== cleanGameName(gameName)) {
        return {}; // not our joined game
      }
      return { currentGame: { ...cg, members: [...members] } };
    }),

  applySitDown: (gameName, playerNumber, name, isRobot) =>
    set((s) => {
      const cg = s.currentGame;
      if (cg === null || cg.gameName !== cleanGameName(gameName)) {
        return {};
      }
      if (playerNumber < 0 || playerNumber >= cg.maxPlayers) {
        return {};
      }
      const players = cg.players.slice();
      players[playerNumber] = { name, isRobot };
      const mySeat =
        name === s.nickname && !isRobot ? playerNumber : cg.mySeat;
      return { currentGame: { ...cg, players, mySeat } };
    }),

  applySeatLock: (msg) =>
    set((s) => {
      const cg = s.currentGame;
      if (cg === null || cg.gameName !== cleanGameName(msg.game)) {
        return {};
      }
      if (msg.states !== null) {
        // All-seats form (the server's join-time greeting): its length is the
        // authoritative seat count (4 or 6). If it differs from how we sized the
        // room (e.g. the option-string heuristic guessed wrong for a PL=5/PLB
        // game), resize so seats 4/5 exist and their later bots/locks land.
        const count = msg.states.length;
        const players =
          count === cg.players.length
            ? cg.players.slice()
            : resizeArray<RoomPlayer | null>(cg.players, count, null);
        const seatLocks = [...msg.states];
        return {
          currentGame: { ...cg, players, seatLocks, maxPlayers: count },
        };
      }
      const seatLocks = cg.seatLocks.slice();
      if (
        msg.state !== null &&
        msg.playerNumber >= 0 &&
        msg.playerNumber < seatLocks.length
      ) {
        seatLocks[msg.playerNumber] = msg.state;
      }
      return { currentGame: { ...cg, seatLocks } };
    }),

  setGameState: (gameName, state) =>
    set((s) => {
      const cg = s.currentGame;
      if (cg === null || cg.gameName !== cleanGameName(gameName)) {
        return {};
      }
      if (state === cg.gameState) {
        return {};
      }
      return { currentGame: { ...cg, gameState: state } };
    }),

  clearCurrentGame: (gameName) =>
    set((s) => {
      const cg = s.currentGame;
      if (cg === null || cg.gameName !== cleanGameName(gameName)) {
        return {};
      }
      return { currentGame: null };
    }),
}));

/** True if a {@link CurrentGame}'s state means setup/play has begun. */
export function isGameStarted(cg: CurrentGame | null): boolean {
  return cg !== null && cg.gameState >= GAME_STATE_MIN_STARTED;
}

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
    useGameStore.getState().clearCurrentGame(g.game);
  });

  // --- Game-option / scenario registry replies ---

  conn.on(MessageType.GAMEOPTIONGETDEFAULTS, (msg: SOCMessage) => {
    // Step 2 of the defaults-first discovery flow (mirrors the Swing client's
    // MessageHandler.handleGAMEOPTIONGETDEFAULTS): the server's reply lists ALL
    // known option keys with their default values. We extract that explicit key
    // list and ask for full type/desc info per key with GAMEOPTIONGETINFOS — the
    // ONLY request form that makes the server return fully-typed descriptors for
    // unchanged options (a bare "-"/"?CHANGES" yields OTYPE_UNKNOWN for them).
    const def = msg as SOCGameOptionGetDefaults;
    const { keys, values } = parseDefaultsKeys(def.opts ?? '');
    useGameStore
      .getState()
      .setPendingOptionDefaults(Object.fromEntries(values));

    if (keys.length === 0) {
      // No options to ask about: discovery is already complete.
      useGameStore.getState().setOptionsLoaded(true);
      return; // <--- Early return: empty defaults, nothing to request ---
    }
    // Explicit key list (NOT "-"), plus localized descriptions.
    conn.send(new SOCGameOptionGetInfos(keys, true, false));
  });

  conn.on(MessageType.GAMEOPTIONINFO, (msg: SOCMessage) => {
    const info = msg as SOCGameOptionInfo;
    if (info.isNoMoreOpts()) {
      useGameStore.getState().setOptionsLoaded(true);
      return; // <--- Early return: end-of-list marker, not a real option ---
    }
    useGameStore.getState().upsertOption(descriptorFromInfo(info));
  });

  conn.on(MessageType.SCENARIOINFO, (msg: SOCMessage) => {
    const sc = msg as SOCScenarioInfo;
    if (sc.isFromServer && sc.scenario !== null) {
      useGameStore.getState().upsertScenario(sc.scenario);
    }
  });

  // --- Current-game room messages ---

  conn.on(MessageType.JOINGAMEAUTH, (msg: SOCMessage) => {
    const a = msg as SOCJoinGameAuth;
    useGameStore.getState().joinGameAuth(a.game);
  });

  conn.on(MessageType.GAMEMEMBERS, (msg: SOCMessage) => {
    const m = msg as SOCGameMembers;
    useGameStore.getState().setGameMembers(m.game, [...m.members]);
  });

  conn.on(MessageType.SITDOWN, (msg: SOCMessage) => {
    const sd = msg as SOCSitDown;
    useGameStore
      .getState()
      .applySitDown(sd.game, sd.playerNumber, sd.nickname, sd.robotFlag);
  });

  conn.on(MessageType.SETSEATLOCK, (msg: SOCMessage) => {
    useGameStore.getState().applySeatLock(msg as SOCSetSeatLock);
  });

  conn.on(MessageType.GAMESTATE, (msg: SOCMessage) => {
    const gs = msg as SOCGameState;
    useGameStore.getState().setGameState(gs.game, gs.state);
  });

  conn.on(MessageType.STARTGAME, (msg: SOCMessage) => {
    const sg = msg as SOCStartGame;
    // SOCStartGame may carry the new game state (>0); when present, advance the
    // room state so the UI flips to the started view. A bare STARTGAME (state 0)
    // is the client's own request echo and leaves state untouched.
    if (sg.gameState > 0) {
      useGameStore.getState().setGameState(sg.game, sg.gameState);
    }
  });

  conn.on(MessageType.LEAVEGAME, (msg: SOCMessage) => {
    const lg = msg as SOCLeaveGame;
    // Only clear our room if WE are the one leaving; another member leaving is
    // handled by the room reducers via their own SITDOWN/members updates.
    if (lg.nickname === useGameStore.getState().nickname) {
      useGameStore.getState().clearCurrentGame(lg.game);
    }
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

// ---------------------------------------------------------------------------
// Lobby / game-setup actions (send protocol messages over the connection).
//
// Each is a thin wrapper that builds the right SOCMessage and calls
// connection.send(). They mirror the Java client flows verified against the
// live server (see web/docs/protocol.md):
//   create:  SOCNewGameWithOptionsRequest -> server auto-joins requester
//            (SOCJoinGameAuth + board + SOCGameMembers); creator is an OBSERVER
//            and must SITDOWN explicitly to take a seat.
//   sit:     SOCSitDown -> server broadcasts SOCSitDown + SOCGameState.
//   start:   SOCStartGame -> server fills unlocked empty seats with bots
//            (SOCJoinGame + SOCSitDown per bot) then broadcasts
//            SOCStartGame(state=START1A).
// ---------------------------------------------------------------------------

/**
 * The "host" field every join/create message carries is unused by the server
 * (v2.0.00+ clients send EMPTYSTR); see SOCJoinGame / SOCNewGameWithOptionsRequest.
 */
const UNUSED_HOST = EMPTYSTR;

/**
 * Ask the server for game-option descriptors so the New Game dialog can be
 * populated, using the server's defaults-first discovery flow (mirrors the
 * Swing client; see web/docs/protocol.md):
 *
 *   1. Send SOCGameOptionGetDefaults (this function). The server replies with
 *      SOCGameOptionGetDefaults packing EVERY known option key + default value.
 *   2. The GAMEOPTIONGETDEFAULTS handler extracts that explicit key list and
 *      sends SOCGameOptionGetInfos(keys), which makes the server return a
 *      fully-typed SOCGameOptionInfo per key (NOT OTYPE_UNKNOWN), plus an
 *      end-of-list marker.
 *   3. The GAMEOPTIONINFO handler builds descriptors and merges the captured
 *      default values into the known-options registry.
 *
 * A bare SOCGameOptionGetInfos("-") would instead return most options as
 * OTYPE_UNKNOWN for a same-version client, so the dialog would only show PL.
 *
 * No-op if options are already loaded or discovery is already in flight.
 */
export function requestGameOptions(): void {
  const conn = connection;
  if (conn === null) {
    return; // <--- Early return: not connected ---
  }
  const store = useGameStore.getState();
  if (store.optionsLoaded || store.optionsRequested) {
    return; // <--- Early return: already have / are fetching option info ---
  }
  store.setOptionsRequested(true);
  // Step 1: ask for the defaults (opts=null => bare "1080" request).
  conn.send(new SOCGameOptionGetDefaults(null));
}

/**
 * Create a new game with options and (per the server flow) auto-join it.
 *
 * Sends SOCNewGameWithOptionsRequest with the local nickname (which names the
 * connection on first create/join), the packed option string, and the scenario
 * choice folded into the options as "SC=<key>" when provided. The server
 * replies with SOCNewGameWithOptions (lobby broadcast) then auto-joins the
 * requester (SOCJoinGameAuth + members).
 *
 * @param name          game name
 * @param nick          nickname to use (also stored as the local nickname)
 * @param opts          chosen option descriptors from the New Game dialog
 * @param scenarioKey   optional scenario keyname (becomes the "SC" option)
 */
export function createGame(
  name: string,
  nick: string,
  opts: readonly GameOptionDescriptor[],
  scenarioKey?: string,
): void {
  const conn = connection;
  if (conn === null) {
    return; // <--- Early return: not connected ---
  }
  const store = useGameStore.getState();
  store.setNickname(nick);

  // Fold the chosen scenario into the options as the "SC" string option, so it
  // travels in the same packed string the server expects (matches the Swing
  // client, which sets SC alongside the other options).
  const effective: GameOptionDescriptor[] = opts.filter(
    (o) => o.key !== 'SC' || scenarioKey == null,
  );
  if (scenarioKey != null && scenarioKey !== '') {
    effective.push({
      key: 'SC',
      optType: 'str',
      desc: 'Game Scenario',
      curStrValue: scenarioKey,
    });
  }

  // Pack with hideEmptyStringOpts so an empty SC ("no scenario") is dropped.
  const optsStr = serializeOptions(effective, true);
  conn.send(
    new SOCNewGameWithOptionsRequest(nick, null, UNUSED_HOST, name, optsStr),
  );
}

/**
 * Join an existing game by name (as a player/observer). Sends SOCJoinGame with
 * the local nickname; the server replies with SOCJoinGameAuth + members.
 *
 * @param name  game name to join
 * @param nick  nickname to use (also stored as the local nickname)
 */
export function joinGame(name: string, nick: string): void {
  const conn = connection;
  if (conn === null) {
    return; // <--- Early return: not connected ---
  }
  useGameStore.getState().setNickname(nick);
  conn.send(new SOCJoinGame(nick, null, UNUSED_HOST, name));
}

/**
 * Sit down at a seat in the currently-joined game. Sends SOCSitDown; the server
 * broadcasts the seating to the game. No-op if no game is joined.
 *
 * @param seat  seat (player) number to sit at
 */
export function sitDown(seat: number): void {
  const conn = connection;
  const cg = useGameStore.getState().currentGame;
  if (conn === null || cg === null) {
    return; // <--- Early return: not in a game ---
  }
  // robotFlag is ignored from the client by v2.5.00+ servers; send false.
  conn.send(new SOCSitDown(cg.gameName, useGameStore.getState().nickname, seat, false));
}

/**
 * Request that the currently-joined game start. Sends SOCStartGame; the server
 * fills unlocked empty seats with bots and then announces the start.
 */
export function startGame(): void {
  const conn = connection;
  const cg = useGameStore.getState().currentGame;
  if (conn === null || cg === null) {
    return; // <--- Early return: not in a game ---
  }
  conn.send(new SOCStartGame(cg.gameName));
}

/**
 * Set a seat's lock state in the currently-joined game. Locking a vacant seat
 * prevents the server from placing a bot there at start; unlocking allows it.
 *
 * @param seat   seat (player) number
 * @param state  the new {@link SeatLockState}
 */
export function setSeatLock(seat: number, state: SeatLockStateValue): void {
  const conn = connection;
  const cg = useGameStore.getState().currentGame;
  if (conn === null || cg === null) {
    return; // <--- Early return: not in a game ---
  }
  conn.send(SOCSetSeatLock.forSeat(cg.gameName, seat, state));
}

/**
 * Leave the currently-joined game. Sends SOCLeaveGame and clears the local
 * room; the server broadcasts the departure to remaining members.
 */
export function leaveGame(): void {
  const conn = connection;
  const cg = useGameStore.getState().currentGame;
  if (cg === null) {
    return; // <--- Early return: not in a game ---
  }
  if (conn !== null) {
    conn.send(
      new SOCLeaveGame(useGameStore.getState().nickname, '-', cg.gameName),
    );
  }
  useGameStore.getState().clearCurrentGame(cg.gameName);
}
