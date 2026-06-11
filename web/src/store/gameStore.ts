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
  GameElementType,
  GameState,
  MessageType,
  PlayerElementAction,
  PlayerElementType,
  SeatLockState,
  type SeatLockStateValue,
  type SOCMessage,
  SOCBoardLayout2,
  SOCChannels,
  SOCDeleteGame,
  SOCDiceResult,
  SOCDiceResultResources,
  SOCGameElements,
  SOCGameMembers,
  SOCGameOptionGetDefaults,
  SOCGameOptionGetInfos,
  SOCGameOptionInfo,
  SOCGames,
  SOCGameServerText,
  SOCGameState,
  SOCGamesWithOptions,
  SOCGameTextMsg,
  SOCJoinGame,
  SOCJoinGameAuth,
  SOCLargestArmy,
  SOCLeaveGame,
  SOCLongestRoad,
  SOCMovePiece,
  SOCNewGame,
  SOCNewGameWithOptions,
  SOCNewGameWithOptionsRequest,
  SOCPlayerElement,
  SOCPlayerElements,
  SOCPotentialSettlements,
  SOCPutPiece,
  SOCRollDice,
  SOCBuildRequest,
  SOCCancelBuildRequest,
  SOCEndTurn,
  SOCScenarioInfo,
  type ScenarioDetails,
  SOCSetSeatLock,
  SOCSetTurn,
  SOCSitDown,
  SOCStartGame,
  SOCStatusMessage,
  SOCTurn,
  SOCVersion,
  PieceTypeConst,
  StatusValue,
  type GameOptionDescriptor,
  descriptorFromInfo,
  mergeDefaultValue,
  parseDefaultsKeys,
  serializeOptions,
} from '../protocol';
import {
  type BoardModel,
  type BoardPiece,
  PIECE_SETTLEMENT,
  PIECE_SHIP,
} from '../board/types';
import { boardFromLayout2 } from '../board/boardModel';
import {
  type PlayerView,
  type ResourceCounts,
  colorForSeat,
  makePlayerView,
} from './types';
import {
  type ConnectionState,
  DEFAULT_HOST,
  DEFAULT_PORT,
  GameConnection,
} from '../net/GameConnection';

export { PLAYER_COLORS, type PlayerView, type ResourceCounts } from './types';

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

  // --- In-game state (Phase 3); populated once setup/play begins ---

  /** Decoded board model for the SVG renderer, or null until BOARDLAYOUT2. */
  board: BoardModel | null;
  /** Pieces placed on the board (roads/ships at edges, settlements/cities at nodes). */
  pieces: BoardPiece[];
  /** Legal/potential settlement node coords (from POTENTIALSETTLEMENTS). */
  potentialNodes: number[];
  /** Per-seat render view, indexed by seat number. Length maxPlayers. */
  playerViews: PlayerView[];
  /** Current player's seat number, or -1 if none yet. */
  currentPlayerNumber: number;
  /** Last dice roll, or null before the first roll / after a clear. */
  lastDice: DiceRoll | null;
  /**
   * Node coord of the settlement the local player most recently placed during
   * initial placement, used to constrain the following initial-road highlight.
   * Null outside initial placement.
   */
  lastInitSettlement: number | null;
  /** Number of dev cards left in the deck (from GAMEELEMENTS). */
  deckDevCardCount: number;
  /** Rolling chat/announcement log (server text + chat), newest last. */
  gameLog: string[];
}

/** A resolved dice roll. d1/d2 are 0 when only the total is known. */
export interface DiceRoll {
  d1: number;
  d2: number;
  total: number;
}

/** Cap the game log so it doesn't grow without bound. */
const GAME_LOG_MAX = 200;

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

  // --- In-game reducers (Phase 3) ---

  /** Decode + store the board layout (from SOCBoardLayout2). */
  applyBoardLayout: (msg: SOCBoardLayout2) => void;
  /** Store the legal/potential settlement nodes (from SOCPotentialSettlements). */
  applyPotentialSettlements: (msg: SOCPotentialSettlements) => void;
  /** Add a placed piece to the board (from SOCPutPiece). */
  applyPutPiece: (msg: SOCPutPiece) => void;
  /** Move an existing piece (ship) to a new edge (from SOCMovePiece). */
  applyMovePiece: (msg: SOCMovePiece) => void;
  /** Apply a single player-element change (from SOCPlayerElement). */
  applyPlayerElement: (msg: SOCPlayerElement) => void;
  /** Apply a batch of player-element changes (from SOCPlayerElements). */
  applyPlayerElements: (msg: SOCPlayerElements) => void;
  /** Apply a batch of game-element changes (from SOCGameElements). */
  applyGameElements: (msg: SOCGameElements) => void;
  /** Record a dice result total (from SOCDiceResult). */
  applyDiceResult: (msg: SOCDiceResult) => void;
  /** Record dice gains + per-player resource totals (from SOCDiceResultResources). */
  applyDiceResultResources: (msg: SOCDiceResultResources) => void;
  /** Advance the turn (current player + optional new state) (from SOCTurn). */
  applyTurn: (msg: SOCTurn) => void;
  /** Set the current player number (from SOCSetTurn). */
  applySetTurn: (msg: SOCSetTurn) => void;
  /** Set the Longest Road holder (from SOCLongestRoad), -1 = none. */
  applyLongestRoad: (gameName: string, playerNumber: number) => void;
  /** Set the Largest Army holder (from SOCLargestArmy), -1 = none. */
  applyLargestArmy: (gameName: string, playerNumber: number) => void;
  /** Append a line to the rolling game log. */
  appendGameLog: (gameName: string, line: string) => void;
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

/** Build a per-seat {@link PlayerView} array sized to `maxPlayers`. */
function makePlayerViews(maxPlayers: number): PlayerView[] {
  const out: PlayerView[] = [];
  for (let pn = 0; pn < maxPlayers; ++pn) {
    out.push(makePlayerView(pn));
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
    board: null,
    pieces: [],
    potentialNodes: [],
    playerViews: makePlayerViews(maxPlayers),
    currentPlayerNumber: -1,
    lastDice: null,
    lastInitSettlement: null,
    deckDevCardCount: 0,
    gameLog: [],
  };
}

/**
 * Map a {@link PlayerElementType} resource value (CLAY..WOOD) to its
 * {@link ResourceCounts} field name, or null for a non-resource type.
 */
function resourceField(elementType: number): keyof ResourceCounts | null {
  switch (elementType) {
    case PlayerElementType.CLAY:
      return 'clay';
    case PlayerElementType.ORE:
      return 'ore';
    case PlayerElementType.SHEEP:
      return 'sheep';
    case PlayerElementType.WHEAT:
      return 'wheat';
    case PlayerElementType.WOOD:
      return 'wood';
    default:
      return null;
  }
}

/** Apply a SET/GAIN/LOSE action to a current value, clamping at 0. */
function applyElementAction(current: number, action: number, amount: number): number {
  switch (action) {
    case PlayerElementAction.SET:
      return amount;
    case PlayerElementAction.GAIN:
      return current + amount;
    case PlayerElementAction.LOSE:
      return Math.max(0, current - amount);
    default:
      return current;
  }
}

/**
 * Apply one player-element change to a {@link PlayerView}, returning a new view
 * (immutable). Handles resource counts, piece-supply counts, knights, and the
 * authoritative total/unknown-resource count. Unknown element types are ignored.
 *
 * Resource semantics mirror the server: the local player receives per-resource
 * CLAY..WOOD updates; opponents receive only a single UNKNOWN_RESOURCE or
 * RESOURCE_COUNT total. We update {@link PlayerView.resources} for the typed
 * resources and recompute {@link PlayerView.resourceTotal} from them, but a
 * RESOURCE_COUNT/UNKNOWN_RESOURCE update overrides the total directly (used for
 * opponents whose per-resource breakdown we never see).
 */
function applyElementToView(
  view: PlayerView,
  elementType: number,
  action: number,
  amount: number,
): PlayerView {
  const resField = resourceField(elementType);
  if (resField !== null) {
    const resources: ResourceCounts = { ...view.resources };
    resources[resField] = applyElementAction(resources[resField], action, amount);
    const resourceTotal =
      resources.clay + resources.ore + resources.sheep + resources.wheat + resources.wood;
    return { ...view, resources, resourceTotal };
  }

  switch (elementType) {
    case PlayerElementType.RESOURCE_COUNT:
    case PlayerElementType.UNKNOWN_RESOURCE:
      // Authoritative total for opponents (we never see their breakdown).
      return { ...view, resourceTotal: applyElementAction(view.resourceTotal, action, amount) };
    case PlayerElementType.ROADS:
      return { ...view, roads: applyElementAction(view.roads, action, amount) };
    case PlayerElementType.SETTLEMENTS:
      return { ...view, settlements: applyElementAction(view.settlements, action, amount) };
    case PlayerElementType.CITIES:
      return { ...view, cities: applyElementAction(view.cities, action, amount) };
    case PlayerElementType.SHIPS:
      return { ...view, ships: applyElementAction(view.ships, action, amount) };
    case PlayerElementType.NUMKNIGHTS:
      return { ...view, knights: applyElementAction(view.knights, action, amount) };
    default:
      return view; // flags / scenario / not-shown element types: ignore
  }
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
      // Mirror the seating into the in-game player view (name/robot/seated),
      // assigning the seat's palette color.
      const playerViews = cg.playerViews.slice();
      const pv = playerViews[playerNumber] ?? makePlayerView(playerNumber);
      playerViews[playerNumber] = {
        ...pv,
        name,
        isRobot,
        seated: true,
        color: colorForSeat(playerNumber),
      };
      return { currentGame: { ...cg, players, mySeat, playerViews } };
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
        // Keep the in-game player views in lockstep with the authoritative
        // seat count, seeding any newly-revealed seats with a fresh view.
        const playerViews =
          count === cg.playerViews.length
            ? cg.playerViews
            : (() => {
                const out: PlayerView[] = [];
                for (let pn = 0; pn < count; ++pn) {
                  out.push(cg.playerViews[pn] ?? makePlayerView(pn));
                }
                return out;
              })();
        return {
          currentGame: { ...cg, players, seatLocks, maxPlayers: count, playerViews },
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

  // --- In-game reducers (Phase 3) ---

  applyBoardLayout: (msg) =>
    set((s) => {
      const cg = guardGame(s.currentGame, msg.game);
      if (cg === null) {
        return {};
      }
      return { currentGame: { ...cg, board: boardFromLayout2(msg) } };
    }),

  applyPotentialSettlements: (msg) =>
    set((s) => {
      const cg = guardGame(s.currentGame, msg.game);
      if (cg === null) {
        return {};
      }
      const potentialNodes = potentialNodesOf(msg);
      return { currentGame: { ...cg, potentialNodes } };
    }),

  applyPutPiece: (msg) =>
    set((s) => {
      const cg = guardGame(s.currentGame, msg.game);
      if (cg === null) {
        return {};
      }
      const piece = pieceFromPutPiece(msg);
      if (piece === null) {
        return {}; // non-rendered piece type (fortress/village); ignore
      }
      // Avoid duplicates: a city upgrade replaces the settlement at that node.
      const pieces = cg.pieces.filter(
        (p) => !(isNodePiece(p.ptype) && isNodePiece(piece.ptype) && p.coord === piece.coord),
      );
      pieces.push(piece);
      // VP is NOT sent over the wire as a player element (the Java client derives
      // public VP locally). Recompute the owner's VP from their pieces + awards.
      const playerViews = recomputeVp(cg.playerViews, pieces, piece.playerNumber);
      // Remember our own initial settlement so the following initial-road
      // highlight can be limited to edges touching it.
      let lastInitSettlement = cg.lastInitSettlement;
      if (
        piece.playerNumber === cg.mySeat &&
        piece.ptype === PIECE_SETTLEMENT &&
        isInitialPlacementState(cg.gameState)
      ) {
        lastInitSettlement = piece.coord;
      }
      return { currentGame: { ...cg, pieces, playerViews, lastInitSettlement } };
    }),

  applyMovePiece: (msg) =>
    set((s) => {
      const cg = guardGame(s.currentGame, msg.game);
      if (cg === null) {
        return {};
      }
      // Move the matching ship (type+from+owner) to its new edge.
      const pieces = cg.pieces.map((p) =>
        p.ptype === PIECE_SHIP &&
        p.coord === msg.fromCoord &&
        p.playerNumber === msg.playerNumber
          ? { ...p, coord: msg.toCoord }
          : p,
      );
      return { currentGame: { ...cg, pieces } };
    }),

  applyPlayerElement: (msg) =>
    set((s) => {
      const cg = guardGame(s.currentGame, msg.game);
      if (cg === null) {
        return {};
      }
      const playerViews = updateView(cg.playerViews, msg.playerNumber, (v) =>
        applyElementToView(v, msg.elementType, msg.actionType, msg.amount),
      );
      if (playerViews === cg.playerViews) {
        return {};
      }
      return { currentGame: { ...cg, playerViews } };
    }),

  applyPlayerElements: (msg) =>
    set((s) => {
      const cg = guardGame(s.currentGame, msg.game);
      if (cg === null) {
        return {};
      }
      const playerViews = updateView(cg.playerViews, msg.playerNumber, (v) => {
        let next = v;
        for (let i = 0; i < msg.elementTypes.length; ++i) {
          next = applyElementToView(next, msg.elementTypes[i], msg.actionType, msg.amounts[i]);
        }
        return next;
      });
      if (playerViews === cg.playerViews) {
        return {};
      }
      return { currentGame: { ...cg, playerViews } };
    }),

  applyGameElements: (msg) =>
    set((s) => {
      const cg = guardGame(s.currentGame, msg.game);
      if (cg === null) {
        return {};
      }
      let currentPlayerNumber = cg.currentPlayerNumber;
      let deckDevCardCount = cg.deckDevCardCount;
      let playerViews = cg.playerViews;
      for (let i = 0; i < msg.elementTypes.length; ++i) {
        const et = msg.elementTypes[i];
        const val = msg.values[i];
        switch (et) {
          case GameElementType.CURRENT_PLAYER:
            currentPlayerNumber = val;
            break;
          case GameElementType.DEV_CARD_COUNT:
            deckDevCardCount = val;
            break;
          case GameElementType.LONGEST_ROAD_PLAYER:
            playerViews = recomputeVpAll(
              setExclusiveFlag(playerViews, val, 'longestRoad'),
              cg.pieces,
            );
            break;
          case GameElementType.LARGEST_ARMY_PLAYER:
            playerViews = recomputeVpAll(
              setExclusiveFlag(playerViews, val, 'largestArmy'),
              cg.pieces,
            );
            break;
          default:
            break; // ROUND_COUNT / FIRST_PLAYER / scenario fields: not shown
        }
      }
      return {
        currentGame: { ...cg, currentPlayerNumber, deckDevCardCount, playerViews },
      };
    }),

  applyDiceResult: (msg) =>
    set((s) => {
      const cg = guardGame(s.currentGame, msg.game);
      if (cg === null) {
        return {};
      }
      const lastDice = msg.result > 0 ? { d1: 0, d2: 0, total: msg.result } : null;
      return { currentGame: { ...cg, lastDice } };
    }),

  applyDiceResultResources: (msg) =>
    set((s) => {
      const cg = guardGame(s.currentGame, msg.game);
      if (cg === null) {
        return {};
      }
      // Update each gaining player's authoritative total; per-resource gains for
      // the local player arrive separately as SOCPlayerElement(GAIN), so we set
      // the total here and let those refine the local breakdown.
      let playerViews = cg.playerViews;
      for (const p of msg.players) {
        playerViews = updateView(playerViews, p.playerNumber, (v) => ({
          ...v,
          resourceTotal: p.total,
        }));
      }
      return { currentGame: { ...cg, playerViews } };
    }),

  applyTurn: (msg) =>
    set((s) => {
      const cg = guardGame(s.currentGame, msg.game);
      if (cg === null) {
        return {};
      }
      const gameState = msg.gameState > 0 ? msg.gameState : cg.gameState;
      return {
        currentGame: {
          ...cg,
          currentPlayerNumber: msg.playerNumber,
          gameState,
          // A new turn clears the previous turn's dice display.
          lastDice: null,
        },
      };
    }),

  applySetTurn: (msg) =>
    set((s) => {
      const cg = guardGame(s.currentGame, msg.game);
      if (cg === null) {
        return {};
      }
      return { currentGame: { ...cg, currentPlayerNumber: msg.playerNumber } };
    }),

  applyLongestRoad: (gameName, playerNumber) =>
    set((s) => {
      const cg = guardGame(s.currentGame, gameName);
      if (cg === null) {
        return {};
      }
      const playerViews = recomputeVpAll(
        setExclusiveFlag(cg.playerViews, playerNumber, 'longestRoad'),
        cg.pieces,
      );
      return { currentGame: { ...cg, playerViews } };
    }),

  applyLargestArmy: (gameName, playerNumber) =>
    set((s) => {
      const cg = guardGame(s.currentGame, gameName);
      if (cg === null) {
        return {};
      }
      const playerViews = recomputeVpAll(
        setExclusiveFlag(cg.playerViews, playerNumber, 'largestArmy'),
        cg.pieces,
      );
      return { currentGame: { ...cg, playerViews } };
    }),

  appendGameLog: (gameName, line) =>
    set((s) => {
      const cg = guardGame(s.currentGame, gameName);
      if (cg === null || line === '') {
        return {};
      }
      const gameLog = [...cg.gameLog, line];
      if (gameLog.length > GAME_LOG_MAX) {
        gameLog.splice(0, gameLog.length - GAME_LOG_MAX);
      }
      return { currentGame: { ...cg, gameLog } };
    }),
}));

/**
 * Return the current game iff it matches `gameName` (after marker stripping),
 * else null. Centralizes the "is this our joined game" guard the in-game
 * reducers share.
 */
function guardGame(cg: CurrentGame | null, gameName: string): CurrentGame | null {
  if (cg === null || cg.gameName !== cleanGameName(gameName)) {
    return null;
  }
  return cg;
}

/** True for piece types that sit on a node (settlement/city) vs an edge (road/ship). */
function isNodePiece(ptype: number): boolean {
  return ptype === 1 /* settlement */ || ptype === 2 /* city */;
}

/**
 * Build a {@link BoardPiece} from a {@link SOCPutPiece}, or null for piece types
 * the core renderer doesn't draw (fortress=4, village=5). Roads(0)/ships(3) sit
 * on edges; settlements(1)/cities(2) sit on nodes.
 */
function pieceFromPutPiece(msg: SOCPutPiece): BoardPiece | null {
  if (msg.pieceType > 3) {
    return null; // fortress/village: not rendered in the core loop
  }
  return {
    ptype: msg.pieceType as BoardPiece['ptype'],
    coord: msg.coordinates,
    playerNumber: msg.playerNumber,
  };
}

/**
 * Extract the legal/potential settlement node coords from a
 * {@link SOCPotentialSettlements}: the per-player psNodes when present, else the
 * de-duplicated union of all land-area legal nodes (sea board, pn -1 before start).
 */
function potentialNodesOf(msg: SOCPotentialSettlements): number[] {
  if (msg.psNodes !== null && msg.psNodes.length > 0) {
    return [...msg.psNodes];
  }
  const lan = msg.landAreasLegalNodes;
  if (lan !== null) {
    const seen = new Set<number>();
    for (let i = 1; i < lan.length; ++i) {
      const nodes = lan[i];
      if (nodes !== null) {
        for (const n of nodes) {
          seen.add(n);
        }
      }
    }
    return Array.from(seen);
  }
  return msg.psNodes !== null ? [...msg.psNodes] : [];
}

/**
 * Return a new player-views array with seat `pn` transformed by `fn`, or the
 * same array reference (no-op) if `pn` is out of range. Immutable: only the one
 * changed view is a new object.
 */
function updateView(
  views: readonly PlayerView[],
  pn: number,
  fn: (v: PlayerView) => PlayerView,
): PlayerView[] {
  if (pn < 0 || pn >= views.length) {
    return views as PlayerView[];
  }
  const out = views.slice();
  out[pn] = fn(out[pn]);
  return out;
}

/**
 * Set a boolean award flag (longestRoad/largestArmy) exclusively on seat
 * `playerNumber` (or clear it on all if -1). Returns a new array.
 */
function setExclusiveFlag(
  views: readonly PlayerView[],
  playerNumber: number,
  flag: 'longestRoad' | 'largestArmy',
): PlayerView[] {
  return views.map((v) => {
    const should = v.playerNumber === playerNumber;
    if (v[flag] === should) {
      return v;
    }
    return { ...v, [flag]: should };
  });
}

/**
 * Derive a player's public victory points: 1 per settlement, 2 per city on the
 * board, plus 2 each for Longest Road and Largest Army. The Java server does NOT
 * send VP as a player element (it's computed by each client; see
 * SOCPlayerElement, which has no VP type), so the store derives it the same way.
 * Special VP and dev-card VP aren't visible in the core loop and are omitted.
 */
function deriveVp(view: PlayerView, pieces: readonly BoardPiece[]): number {
  let vp = 0;
  for (const p of pieces) {
    if (p.playerNumber !== view.playerNumber) {
      continue;
    }
    if (p.ptype === 1 /* settlement */) {
      vp += 1;
    } else if (p.ptype === 2 /* city */) {
      vp += 2;
    }
  }
  if (view.longestRoad) {
    vp += 2;
  }
  if (view.largestArmy) {
    vp += 2;
  }
  return vp;
}

/** Recompute one seat's VP from `pieces` + its award flags. */
function recomputeVp(
  views: readonly PlayerView[],
  pieces: readonly BoardPiece[],
  playerNumber: number,
): PlayerView[] {
  return updateView(views, playerNumber, (v) => {
    const vp = deriveVp(v, pieces);
    return vp === v.vp ? v : { ...v, vp };
  });
}

/** Recompute every seat's VP (used after an award changes hands). */
function recomputeVpAll(
  views: readonly PlayerView[],
  pieces: readonly BoardPiece[],
): PlayerView[] {
  return views.map((v) => {
    const vp = deriveVp(v, pieces);
    return vp === v.vp ? v : { ...v, vp };
  });
}

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

  // --- In-game core-loop messages (Phase 3) ---

  conn.on(MessageType.BOARDLAYOUT2, (msg: SOCMessage) => {
    useGameStore.getState().applyBoardLayout(msg as SOCBoardLayout2);
  });

  conn.on(MessageType.POTENTIALSETTLEMENTS, (msg: SOCMessage) => {
    useGameStore.getState().applyPotentialSettlements(msg as SOCPotentialSettlements);
  });

  conn.on(MessageType.PUTPIECE, (msg: SOCMessage) => {
    useGameStore.getState().applyPutPiece(msg as SOCPutPiece);
  });

  conn.on(MessageType.MOVEPIECE, (msg: SOCMessage) => {
    useGameStore.getState().applyMovePiece(msg as SOCMovePiece);
  });

  conn.on(MessageType.PLAYERELEMENT, (msg: SOCMessage) => {
    useGameStore.getState().applyPlayerElement(msg as SOCPlayerElement);
  });

  conn.on(MessageType.PLAYERELEMENTS, (msg: SOCMessage) => {
    useGameStore.getState().applyPlayerElements(msg as SOCPlayerElements);
  });

  conn.on(MessageType.GAMEELEMENTS, (msg: SOCMessage) => {
    useGameStore.getState().applyGameElements(msg as SOCGameElements);
  });

  conn.on(MessageType.DICERESULT, (msg: SOCMessage) => {
    useGameStore.getState().applyDiceResult(msg as SOCDiceResult);
  });

  conn.on(MessageType.DICERESULTRESOURCES, (msg: SOCMessage) => {
    useGameStore.getState().applyDiceResultResources(msg as SOCDiceResultResources);
  });

  conn.on(MessageType.TURN, (msg: SOCMessage) => {
    useGameStore.getState().applyTurn(msg as SOCTurn);
  });

  conn.on(MessageType.SETTURN, (msg: SOCMessage) => {
    useGameStore.getState().applySetTurn(msg as SOCSetTurn);
  });

  conn.on(MessageType.LONGESTROAD, (msg: SOCMessage) => {
    const lr = msg as SOCLongestRoad;
    useGameStore.getState().applyLongestRoad(lr.game, lr.playerNumber);
  });

  conn.on(MessageType.LARGESTARMY, (msg: SOCMessage) => {
    const la = msg as SOCLargestArmy;
    useGameStore.getState().applyLargestArmy(la.game, la.playerNumber);
  });

  conn.on(MessageType.GAMESERVERTEXT, (msg: SOCMessage) => {
    const t = msg as SOCGameServerText;
    useGameStore.getState().appendGameLog(t.game, t.text);
  });

  conn.on(MessageType.GAMETEXTMSG, (msg: SOCMessage) => {
    const t = msg as SOCGameTextMsg;
    // Prefix chat lines with the sender (server text uses "Server"/":"); the
    // log is plain strings so the UI stays simple.
    const line =
      t.nickname === '' || t.nickname === '-' ? t.text : `${t.nickname}: ${t.text}`;
    useGameStore.getState().appendGameLog(t.game, line);
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

/**
 * True if {@code state} is one of the initial-placement states (START1A..START3B),
 * during which pieces are placed for free by sending SOCPutPiece directly.
 */
export function isInitialPlacementState(state: number): boolean {
  return (
    state === GameState.START1A ||
    state === GameState.START1B ||
    state === GameState.START2A ||
    state === GameState.START2B ||
    state === GameState.START3A ||
    state === GameState.START3B
  );
}

/** True if it is the local player's turn in the currently-joined game. */
export function isMyTurn(cg: CurrentGame | null): boolean {
  return cg !== null && cg.mySeat >= 0 && cg.mySeat === cg.currentPlayerNumber;
}

/**
 * Roll the dice on the local player's turn. Sends SOCRollDice; the server replies
 * with the dice result and any resource gains, then advances to PLAY1.
 */
export function rollDice(): void {
  const conn = connection;
  const cg = useGameStore.getState().currentGame;
  if (conn === null || cg === null) {
    return; // <--- Early return: not in a game ---
  }
  conn.send(new SOCRollDice(cg.gameName));
}

/**
 * Place a piece at a node (settlement/city) or edge (road/ship) coordinate.
 * Used both for free initial placement and after a build request has moved the
 * game into a PLACING_* state. Sends SOCPutPiece for the local player.
 *
 * @param pieceType  a {@link PieceTypeConst} value (ROAD/SETTLEMENT/CITY/SHIP)
 * @param coord      0xRRCC node or edge coordinate
 */
export function putPiece(pieceType: number, coord: number): void {
  const conn = connection;
  const cg = useGameStore.getState().currentGame;
  if (conn === null || cg === null || cg.mySeat < 0) {
    return; // <--- Early return: not seated in a game ---
  }
  conn.send(new SOCPutPiece(cg.gameName, cg.mySeat, pieceType, coord));
}

/**
 * Request to build a piece during PLAY1. Sends SOCBuildRequest; if the player can
 * afford it the server moves the game into the matching PLACING_* state, after
 * which {@link putPiece} completes the placement.
 *
 * @param pieceType  a {@link PieceTypeConst} value (ROAD/SETTLEMENT/CITY/SHIP)
 */
export function buildRequest(pieceType: number): void {
  const conn = connection;
  const cg = useGameStore.getState().currentGame;
  if (conn === null || cg === null) {
    return; // <--- Early return: not in a game ---
  }
  conn.send(new SOCBuildRequest(cg.gameName, pieceType));
}

/**
 * Cancel an in-progress build/placement, returning the game to PLAY1.
 * Sends SOCCancelBuildRequest with the piece type currently being placed.
 *
 * @param pieceType  a {@link PieceTypeConst} value being cancelled
 */
export function cancelBuild(pieceType: number): void {
  const conn = connection;
  const cg = useGameStore.getState().currentGame;
  if (conn === null || cg === null) {
    return; // <--- Early return: not in a game ---
  }
  conn.send(new SOCCancelBuildRequest(cg.gameName, pieceType));
}

/** End the local player's turn. Sends SOCEndTurn. */
export function endTurn(): void {
  const conn = connection;
  const cg = useGameStore.getState().currentGame;
  if (conn === null || cg === null) {
    return; // <--- Early return: not in a game ---
  }
  conn.send(new SOCEndTurn(cg.gameName));
}

export { PieceTypeConst, GameState };
