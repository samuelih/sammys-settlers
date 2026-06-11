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
  // Phase 4 — full in-game interactions
  DevCardAction,
  DevCardType,
  GameStatsType,
  Resource,
  type ResourceValue,
  SimpleActionType,
  SOCAcceptOffer,
  SOCBankTrade,
  SOCBuyDevCardRequest,
  SOCChoosePlayer,
  SOCChoosePlayerRequest,
  SOCClearOffer,
  SOCClearTradeMsg,
  SOCDevCardAction,
  SOCDevCardCount,
  SOCDiscard,
  SOCDiscardRequest,
  SOCGameStats,
  SOCMakeOffer,
  SOCMoveRobber,
  SOCPickResources,
  SOCPickResourceType,
  SOCPlayDevCardRequest,
  SOCRejectOffer,
  RejectOfferReason,
  SOCRobberyResult,
  SOCSetPlayedDevCard,
  SOCDeclinePlayerRequest,
  DeclineReason,
  SOCSimpleAction,
  type TradeOffer,
  type ResourceSet,
  resourceSet,
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

  // --- In-game interactions (Phase 4) ---

  /**
   * The local player's development-card inventory (only the local player sees
   * real card types; opponents' cards arrive as UNKNOWN counts in
   * {@link PlayerView.devCardCount}). Built from DEVCARDACTION DRAW/PLAY/ADD.
   */
  myInventory: DevCardInventory;
  /**
   * Current trade offers indexed by the offering player's seat number; null =
   * no live offer from that seat. Populated from MAKEOFFER / cleared by
   * CLEAROFFER / CLEARTRADEMSG. Length maxPlayers.
   */
  offers: (TradeOffer | null)[];
  /**
   * Per-seat trade response to the local player's current offer, indexed by
   * responder seat: 'accept' (rare — accept is a server broadcast),
   * 'reject' (REJECTOFFER), or null (no response yet). Cleared with the offer.
   */
  offerResponses: (OfferResponse | null)[];
  /**
   * Number of cards the local player must discard, or 0 when not required.
   * Set by DISCARDREQUEST, cleared once the local SOCDiscard is sent / state
   * leaves WAITING_FOR_DISCARDS.
   */
  discardRequired: number;
  /**
   * When the local player must choose a robbery victim (CHOOSEPLAYERREQUEST),
   * the seat numbers of the candidate victims; null when no choice is pending.
   */
  robVictims: number[] | null;
  /** True if the victim chooser also offers a "steal from no one" option. */
  robCanChooseNone: boolean;
  /**
   * The winner's seat number once the game is OVER (from CURRENT_PLAYER at the
   * OVER transition), or -1 if not over / unknown.
   */
  winnerPlayerNumber: number;
  /**
   * Final per-seat scores from GAMESTATS (TYPE_PLAYERS) at game over, indexed
   * by seat number; null until the final-stats message arrives.
   */
  finalScores: number[] | null;
}

/** A response by another seat to the local player's outstanding trade offer. */
export type OfferResponse = 'accept' | 'reject';

/**
 * The local player's dev-card inventory. "Old" cards were drawn on a previous
 * turn and are playable now; "new" cards were drawn this turn and can't be
 * played until next turn. Each is a multiset keyed by {@link DevCardType}.
 * Victory-point cards (CAP..CHAPEL) are kept in {@link vpCards} since they're
 * never "played" and just count toward VP.
 */
export interface DevCardInventory {
  /** Playable dev cards (drawn on a prior turn), keyed by card type -> count. */
  playable: Record<number, number>;
  /** New dev cards (drawn this turn; not yet playable), keyed by type -> count. */
  newCards: Record<number, number>;
  /** Victory-point cards held, keyed by card type -> count. */
  vpCards: Record<number, number>;
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

  // --- In-game interaction reducers (Phase 4) ---

  /** Record/replace one seat's live trade offer (from SOCMakeOffer). */
  applyMakeOffer: (msg: SOCMakeOffer) => void;
  /** Clear one seat's (or all) live trade offer + responses (SOCClearOffer). */
  applyClearOffer: (gameName: string, playerNumber: number) => void;
  /** Record a seat's rejection of the local player's offer (SOCRejectOffer). */
  applyRejectOffer: (gameName: string, playerNumber: number) => void;
  /** Clear pending trade responses in the UI (from SOCClearTradeMsg). */
  applyClearTradeMsg: (gameName: string, playerNumber: number) => void;
  /** Apply an accepted trade (clears the offer); responses cleared (SOCAcceptOffer). */
  applyAcceptOffer: (msg: SOCAcceptOffer) => void;
  /** Update the local dev-card inventory / opponents' counts (SOCDevCardAction). */
  applyDevCardAction: (msg: SOCDevCardAction) => void;
  /** Set the deck dev-card count for older-style DEVCARDCOUNT messages. */
  applyDevCardCount: (gameName: string, count: number) => void;
  /**
   * Set/clear a seat's "played a dev card this turn" flag (from the legacy
   * SOCSetPlayedDevCard; modern servers use SOCPlayerElement(PLAYED_DEV_CARD_FLAG)).
   */
  applySetPlayedDevCard: (gameName: string, playerNumber: number, played: boolean) => void;
  /** Set/clear the local player's discard requirement (from SOCDiscardRequest). */
  applyDiscardRequest: (gameName: string, numDiscards: number) => void;
  /** Move the robber/pirate to a hex on the board (from SOCMoveRobber). */
  applyMoveRobber: (msg: SOCMoveRobber) => void;
  /** Set the victim-chooser candidate list (from SOCChoosePlayerRequest). */
  applyChoosePlayerRequest: (msg: SOCChoosePlayerRequest) => void;
  /** Clear the pending victim chooser (after a choice is sent / state moves on). */
  clearRobVictims: (gameName: string) => void;
  /** Record a robbery result into the game log (from SOCRobberyResult). */
  applyRobberyResult: (msg: SOCRobberyResult) => void;
  /** Record final per-seat scores + winner at game over (from SOCGameStats). */
  applyGameStats: (msg: SOCGameStats) => void;
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
    myInventory: emptyInventory(),
    offers: new Array<TradeOffer | null>(maxPlayers).fill(null),
    offerResponses: new Array<OfferResponse | null>(maxPlayers).fill(null),
    discardRequired: 0,
    robVictims: null,
    robCanChooseNone: false,
    winnerPlayerNumber: -1,
    finalScores: null,
  };
}

/** A fresh, empty dev-card inventory. */
function emptyInventory(): DevCardInventory {
  return { playable: {}, newCards: {}, vpCards: {} };
}

/** True if the card type is a Victory-Point card (CAP..CHAPEL, 4..8). */
function isVpCard(cardType: number): boolean {
  return cardType >= DevCardType.CAP && cardType <= DevCardType.CHAPEL;
}

/** Add `delta` (may be negative) to `bag[key]`, clamping at 0; deletes empties. */
function bumpBag(bag: Record<number, number>, key: number, delta: number): Record<number, number> {
  const next = { ...bag };
  const v = (next[key] ?? 0) + delta;
  if (v > 0) {
    next[key] = v;
  } else {
    delete next[key];
  }
  return next;
}

/** True if a card bag holds at least one card (any positive count). */
function hasAnyCards(bag: Record<number, number>): boolean {
  for (const k in bag) {
    if (bag[k] > 0) {
      return true;
    }
  }
  return false;
}

/** Total number of cards held across all three bags of an inventory. */
export function inventorySize(inv: DevCardInventory): number {
  const sum = (bag: Record<number, number>): number =>
    Object.values(bag).reduce((a, b) => a + b, 0);
  return sum(inv.playable) + sum(inv.newCards) + sum(inv.vpCards);
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
    case PlayerElementType.NUM_PICK_GOLD_HEX_RESOURCES:
      return {
        ...view,
        numPickGoldRes: applyElementAction(view.numPickGoldRes, action, amount),
      };
    case PlayerElementType.PLAYED_DEV_CARD_FLAG:
      // Boolean flag: the server sends SET with amount 1 (played) or 0 (cleared).
      // Mirrors SOCPlayer.setPlayedDevCard / hasPlayedDevCard. The per-turn clear
      // for v2.5.00+ clients is folded into SOCTurn (see applyTurn), but a SET-to-0
      // PLAYERELEMENT (e.g. road-building cancel) is still honored here.
      return { ...view, playedDevCard: action === PlayerElementAction.SET && amount !== 0 };
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
      // On the transition to OVER, the winner is the current player (the server
      // sets GAMEELEMENTS(CURRENT_PLAYER) just before GAMESTATE OVER; see
      // doc/Message-Sequences-for-Game-Actions.md "Game over").
      const winnerPlayerNumber =
        state === GameState.OVER && cg.currentPlayerNumber >= 0
          ? cg.currentPlayerNumber
          : cg.winnerPlayerNumber;
      // Leaving WAITING_FOR_DISCARDS clears any stale discard requirement.
      const discardRequired =
        state !== GameState.WAITING_FOR_DISCARDS ? 0 : cg.discardRequired;
      return {
        currentGame: { ...cg, gameState: state, winnerPlayerNumber, discardRequired },
      };
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
      // A SOCTurn that announces OVER (won at start of own turn) names the winner.
      const winnerPlayerNumber =
        gameState === GameState.OVER ? msg.playerNumber : cg.winnerPlayerNumber;

      // Start-of-turn bookkeeping the server does NOT send explicit wire messages
      // for (v2.5.00+ folds these into SOCTurn — see SOCGame.updateAtTurn /
      // SOCPlayer.updateAtOurTurn):
      //  1. The new current player's dev cards drawn last turn become playable
      //     now (SOCInventory.newToOld). Only the local player has a real
      //     inventory, so only fold ours when this turn is ours.
      //  2. The new current player's "played a dev card this turn" flag clears
      //     (SOCPlayer.playedDevCard = false). Modern servers do NOT send a
      //     SET-to-0 PLAYERELEMENT for this, so do it here.
      const isMyTurn = msg.playerNumber === cg.mySeat && cg.mySeat >= 0;
      let myInventory = cg.myInventory;
      if (isMyTurn && hasAnyCards(myInventory.newCards)) {
        const playable = { ...myInventory.playable };
        for (const [t, n] of Object.entries(myInventory.newCards)) {
          const ct = Number(t);
          playable[ct] = (playable[ct] ?? 0) + n;
        }
        myInventory = { ...myInventory, playable, newCards: {} };
      }
      const playerViews = updateView(cg.playerViews, msg.playerNumber, (v) =>
        v.playedDevCard ? { ...v, playedDevCard: false } : v,
      );

      return {
        currentGame: {
          ...cg,
          currentPlayerNumber: msg.playerNumber,
          gameState,
          myInventory,
          playerViews,
          // A new turn clears the previous turn's dice display and any stale
          // trade offers / responses / discard prompt.
          lastDice: null,
          offers: new Array<TradeOffer | null>(cg.maxPlayers).fill(null),
          offerResponses: new Array<OfferResponse | null>(cg.maxPlayers).fill(null),
          discardRequired: 0,
          robVictims: null,
          winnerPlayerNumber,
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

  // --- In-game interaction reducers (Phase 4) ---

  applyMakeOffer: (msg) =>
    set((s) => {
      const cg = guardGame(s.currentGame, msg.game);
      if (cg === null) {
        return {};
      }
      const from = msg.offer.from;
      if (from < 0 || from >= cg.offers.length) {
        return {};
      }
      const offers = cg.offers.slice();
      offers[from] = msg.offer;
      // A fresh offer clears prior responses to that seat's earlier offer.
      const offerResponses = cg.offerResponses.slice();
      offerResponses[from] = null;
      return { currentGame: { ...cg, offers, offerResponses } };
    }),

  applyClearOffer: (gameName, playerNumber) =>
    set((s) => {
      const cg = guardGame(s.currentGame, gameName);
      if (cg === null) {
        return {};
      }
      if (playerNumber < 0) {
        // -1 = clear all offers + responses.
        return {
          currentGame: {
            ...cg,
            offers: new Array<TradeOffer | null>(cg.maxPlayers).fill(null),
            offerResponses: new Array<OfferResponse | null>(cg.maxPlayers).fill(null),
          },
        };
      }
      if (playerNumber >= cg.offers.length) {
        return {};
      }
      const offers = cg.offers.slice();
      offers[playerNumber] = null;
      const offerResponses = cg.offerResponses.slice();
      offerResponses[playerNumber] = null;
      return { currentGame: { ...cg, offers, offerResponses } };
    }),

  applyRejectOffer: (gameName, playerNumber) =>
    set((s) => {
      const cg = guardGame(s.currentGame, gameName);
      if (cg === null || playerNumber < 0 || playerNumber >= cg.offerResponses.length) {
        return {};
      }
      const offerResponses = cg.offerResponses.slice();
      offerResponses[playerNumber] = 'reject';
      return { currentGame: { ...cg, offerResponses } };
    }),

  applyClearTradeMsg: (gameName, playerNumber) =>
    set((s) => {
      const cg = guardGame(s.currentGame, gameName);
      if (cg === null) {
        return {};
      }
      // Clear trade RESPONSES (not the offers themselves), per seat or all (-1).
      if (playerNumber < 0) {
        return {
          currentGame: {
            ...cg,
            offerResponses: new Array<OfferResponse | null>(cg.maxPlayers).fill(null),
          },
        };
      }
      if (playerNumber >= cg.offerResponses.length) {
        return {};
      }
      const offerResponses = cg.offerResponses.slice();
      offerResponses[playerNumber] = null;
      return { currentGame: { ...cg, offerResponses } };
    }),

  applyAcceptOffer: (msg) =>
    set((s) => {
      const cg = guardGame(s.currentGame, msg.game);
      if (cg === null) {
        return {};
      }
      // The trade completed; the offering seat's offer is gone and the matching
      // resource PLAYERELEMENT updates arrive separately. Clear the offer +
      // responses; record a log line.
      const offers = cg.offers.slice();
      if (msg.offering >= 0 && msg.offering < offers.length) {
        offers[msg.offering] = null;
      }
      const offerResponses = new Array<OfferResponse | null>(cg.maxPlayers).fill(null);
      const line = `${seatLabel(cg, msg.accepting)} accepted ${seatLabel(cg, msg.offering)}'s trade offer.`;
      const gameLog = pushLog(cg.gameLog, line);
      return { currentGame: { ...cg, offers, offerResponses, gameLog } };
    }),

  applyDevCardAction: (msg) =>
    set((s) => {
      const cg = guardGame(s.currentGame, msg.game);
      if (cg === null) {
        return {};
      }
      // Opponents' dev cards arrive as UNKNOWN (type 0); only update the local
      // player's real inventory. The devCardCount (in PlayerView) is driven by
      // PLAYERELEMENT-less derivation here too, so keep the per-player count.
      const isMine = msg.playerNumber === cg.mySeat && cg.mySeat >= 0;
      let myInventory = cg.myInventory;
      let playerViews = cg.playerViews;

      // Per-seat dev-card count delta (how many cards the action adds/removes).
      const countDelta = devCountDelta(msg.actionType);
      if (msg.playerNumber >= 0 && countDelta !== 0) {
        playerViews = updateView(playerViews, msg.playerNumber, (v) => ({
          ...v,
          devCardCount: Math.max(0, v.devCardCount + countDelta),
        }));
      }

      if (isMine && msg.cardTypes === null && msg.cardType !== DevCardType.UNKNOWN) {
        myInventory = applyInventoryAction(myInventory, msg.actionType, msg.cardType);
      } else if (isMine && msg.cardTypes !== null) {
        // Multi-card reveal (end of game): treat each as the same action.
        for (const ct of msg.cardTypes) {
          myInventory = applyInventoryAction(myInventory, msg.actionType, ct);
        }
      }

      if (myInventory === cg.myInventory && playerViews === cg.playerViews) {
        return {};
      }
      return { currentGame: { ...cg, myInventory, playerViews } };
    }),

  applyDevCardCount: (gameName, count) =>
    set((s) => {
      const cg = guardGame(s.currentGame, gameName);
      if (cg === null) {
        return {};
      }
      return { currentGame: { ...cg, deckDevCardCount: count } };
    }),

  applySetPlayedDevCard: (gameName, playerNumber, played) =>
    set((s) => {
      const cg = guardGame(s.currentGame, gameName);
      if (cg === null) {
        return {};
      }
      const playerViews = updateView(cg.playerViews, playerNumber, (v) =>
        v.playedDevCard === played ? v : { ...v, playedDevCard: played },
      );
      if (playerViews === cg.playerViews) {
        return {};
      }
      return { currentGame: { ...cg, playerViews } };
    }),

  applyDiscardRequest: (gameName, numDiscards) =>
    set((s) => {
      const cg = guardGame(s.currentGame, gameName);
      if (cg === null) {
        return {};
      }
      return { currentGame: { ...cg, discardRequired: numDiscards } };
    }),

  applyMoveRobber: (msg) =>
    set((s) => {
      const cg = guardGame(s.currentGame, msg.game);
      if (cg === null || cg.board === null) {
        return {};
      }
      // Positive coord => robber hex; negative/0 => pirate (store its abs coord).
      const board =
        msg.coordinates > 0
          ? { ...cg.board, robberHex: msg.coordinates }
          : { ...cg.board, pirateHex: -msg.coordinates };
      return { currentGame: { ...cg, board } };
    }),

  applyChoosePlayerRequest: (msg) =>
    set((s) => {
      const cg = guardGame(s.currentGame, msg.game);
      if (cg === null) {
        return {};
      }
      const robVictims: number[] = [];
      for (let pn = 0; pn < msg.choices.length; ++pn) {
        if (msg.choices[pn]) {
          robVictims.push(pn);
        }
      }
      return {
        currentGame: { ...cg, robVictims, robCanChooseNone: msg.canChooseNone },
      };
    }),

  clearRobVictims: (gameName) =>
    set((s) => {
      const cg = guardGame(s.currentGame, gameName);
      if (cg === null || cg.robVictims === null) {
        return {};
      }
      return { currentGame: { ...cg, robVictims: null, robCanChooseNone: false } };
    }),

  applyRobberyResult: (msg) =>
    set((s) => {
      const cg = guardGame(s.currentGame, msg.game);
      if (cg === null) {
        return {};
      }
      const line = robberyLogLine(cg, msg);
      const gameLog = pushLog(cg.gameLog, line);
      return { currentGame: { ...cg, gameLog } };
    }),

  applyGameStats: (msg) =>
    set((s) => {
      const cg = guardGame(s.currentGame, msg.game);
      if (cg === null || msg.statType !== GameStatsType.TYPE_PLAYERS) {
        return {}; // only final player scores are shown
      }
      const finalScores = [...msg.scores];
      // Pick the winner as the highest score if not already known from the
      // OVER transition (a robustness fallback).
      let winnerPlayerNumber = cg.winnerPlayerNumber;
      if (winnerPlayerNumber < 0) {
        let best = -1;
        let bestScore = -1;
        for (let pn = 0; pn < finalScores.length; ++pn) {
          if (finalScores[pn] > bestScore) {
            bestScore = finalScores[pn];
            best = pn;
          }
        }
        winnerPlayerNumber = best;
      }
      return { currentGame: { ...cg, finalScores, winnerPlayerNumber } };
    }),
}));

/** Per-seat dev-card-count delta for a {@link DevCardAction}. */
function devCountDelta(action: number): number {
  switch (action) {
    case DevCardAction.DRAW:
    case DevCardAction.ADD_NEW:
    case DevCardAction.ADD_OLD:
      return 1;
    case DevCardAction.PLAY:
    case DevCardAction.REMOVE_NEW:
    case DevCardAction.REMOVE_OLD:
      return -1;
    default:
      return 0; // CANNOT_PLAY
  }
}

/**
 * Apply one {@link SOCDevCardAction} to the local player's inventory, returning
 * a new inventory. VP cards live in their own bag (never "played"); other cards
 * go to playable (drawn previously) or newCards (drawn this turn).
 *
 *  * DRAW / ADD_NEW: a new card this turn (not yet playable), unless it's a VP card.
 *  * ADD_OLD: a playable (old) card, unless a VP card.
 *  * PLAY / REMOVE_OLD: remove from the playable bag (fall back to newCards).
 *  * REMOVE_NEW: remove from the newCards bag.
 */
function applyInventoryAction(
  inv: DevCardInventory,
  action: number,
  cardType: number,
): DevCardInventory {
  if (isVpCard(cardType)) {
    switch (action) {
      case DevCardAction.DRAW:
      case DevCardAction.ADD_NEW:
      case DevCardAction.ADD_OLD:
        return { ...inv, vpCards: bumpBag(inv.vpCards, cardType, 1) };
      case DevCardAction.REMOVE_NEW:
      case DevCardAction.REMOVE_OLD:
        return { ...inv, vpCards: bumpBag(inv.vpCards, cardType, -1) };
      default:
        return inv;
    }
  }

  switch (action) {
    case DevCardAction.DRAW:
    case DevCardAction.ADD_NEW:
      return { ...inv, newCards: bumpBag(inv.newCards, cardType, 1) };
    case DevCardAction.ADD_OLD:
      return { ...inv, playable: bumpBag(inv.playable, cardType, 1) };
    case DevCardAction.PLAY:
    case DevCardAction.REMOVE_OLD:
      if ((inv.playable[cardType] ?? 0) > 0) {
        return { ...inv, playable: bumpBag(inv.playable, cardType, -1) };
      }
      return { ...inv, newCards: bumpBag(inv.newCards, cardType, -1) };
    case DevCardAction.REMOVE_NEW:
      return { ...inv, newCards: bumpBag(inv.newCards, cardType, -1) };
    default:
      return inv;
  }
}

/** Append a line to a capped game-log array (immutable). */
function pushLog(log: readonly string[], line: string): string[] {
  if (line === '') {
    return [...log];
  }
  const out = [...log, line];
  if (out.length > GAME_LOG_MAX) {
    out.splice(0, out.length - GAME_LOG_MAX);
  }
  return out;
}

/** Human-readable name for a seat number in the current game. */
function seatLabel(cg: CurrentGame, pn: number): string {
  if (pn < 0 || pn >= cg.playerViews.length) {
    return 'someone';
  }
  const v = cg.playerViews[pn];
  return v.seated && v.name !== '' ? v.name : `Seat ${pn + 1}`;
}

/** Build a game-log line describing a {@link SOCRobberyResult}. */
function robberyLogLine(cg: CurrentGame, msg: SOCRobberyResult): string {
  const perp = seatLabel(cg, msg.perpPN);
  const victim = seatLabel(cg, msg.victimPN);
  if (msg.stolen.kind === 'res') {
    const amt = Math.abs(msg.amount);
    const res = resourceName(msg.stolen.resType);
    return `${perp} robbed ${amt} ${res} from ${victim}.`;
  }
  if (msg.stolen.kind === 'peType') {
    return `${perp} robbed ${Math.abs(msg.amount)} from ${victim}.`;
  }
  // Resource set (multi).
  const rs = msg.stolen.resSet;
  const parts: string[] = [];
  const order: [number, ResourceValue][] = [
    [rs.clay, Resource.CLAY],
    [rs.ore, Resource.ORE],
    [rs.sheep, Resource.SHEEP],
    [rs.wheat, Resource.WHEAT],
    [rs.wood, Resource.WOOD],
  ];
  for (const [amt, type] of order) {
    if (amt > 0) {
      parts.push(`${amt} ${resourceName(type)}`);
    }
  }
  const what = parts.length > 0 ? parts.join(', ') : 'resources';
  return `${perp} robbed ${what} from ${victim}.`;
}

/** Lower-case display name for a resource type (CLAY..WOOD). */
export function resourceName(type: number): string {
  switch (type) {
    case Resource.CLAY:
      return 'clay';
    case Resource.ORE:
      return 'ore';
    case Resource.SHEEP:
      return 'sheep';
    case Resource.WHEAT:
      return 'wheat';
    case Resource.WOOD:
      return 'wood';
    default:
      return 'resource';
  }
}

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

  // --- Full in-game interaction messages (Phase 4) ---

  // Trade
  conn.on(MessageType.MAKEOFFER, (msg: SOCMessage) => {
    useGameStore.getState().applyMakeOffer(msg as SOCMakeOffer);
  });

  conn.on(MessageType.CLEAROFFER, (msg: SOCMessage) => {
    const c = msg as SOCClearOffer;
    useGameStore.getState().applyClearOffer(c.game, c.playerNumber);
  });

  conn.on(MessageType.REJECTOFFER, (msg: SOCMessage) => {
    const r = msg as SOCRejectOffer;
    // A nonzero reasonCode (or pn < 0) is a server reply-reason, not a seat's
    // plain "no thanks": surface it to the user instead of recording it as a
    // trade response. Mirrors the Java client surfacing these rejections
    // (SOCGameMessageHandler.handleBANKTRADE / executeTrade send REJECTOFFER
    // with a REASON_* code when a trade can't be made). A plain reject
    // (reasonCode 0, pn >= 0) routes to applyRejectOffer as before.
    if (r.reasonCode !== 0 || r.playerNumber < 0) {
      const text = rejectOfferReasonText(r.reasonCode);
      const st = useGameStore.getState();
      st.appendGameLog(r.game, text);
      st.setError(text);
      return; // <--- Early return: reply-reason surfaced, not a seat response ---
    }
    useGameStore.getState().applyRejectOffer(r.game, r.playerNumber);
  });

  conn.on(MessageType.CLEARTRADEMSG, (msg: SOCMessage) => {
    const c = msg as SOCClearTradeMsg;
    useGameStore.getState().applyClearTradeMsg(c.game, c.playerNumber);
  });

  conn.on(MessageType.ACCEPTOFFER, (msg: SOCMessage) => {
    useGameStore.getState().applyAcceptOffer(msg as SOCAcceptOffer);
  });

  conn.on(MessageType.BANKTRADE, (msg: SOCMessage) => {
    // The traded resources arrive as PLAYERELEMENT updates; just log the trade.
    const bt = msg as SOCBankTrade;
    if (bt.playerNumber < 0) {
      return; // <--- Early return: our own request echo, not an announcement ---
    }
    const st = useGameStore.getState();
    const cg = st.currentGame;
    if (cg === null) {
      return;
    }
    const give = describeResourceSet(bt.give);
    const get = describeResourceSet(bt.get);
    st.appendGameLog(bt.game, `${seatLabel(cg, bt.playerNumber)} traded ${give} for ${get} with the bank.`);
  });

  // Dev cards
  conn.on(MessageType.DEVCARDACTION, (msg: SOCMessage) => {
    useGameStore.getState().applyDevCardAction(msg as SOCDevCardAction);
  });

  conn.on(MessageType.DEVCARDCOUNT, (msg: SOCMessage) => {
    const d = msg as SOCDevCardCount;
    useGameStore.getState().applyDevCardCount(d.game, d.numDevCards);
  });

  // Legacy "played a dev card this turn" flag for pre-2.0.00 servers; modern
  // servers (incl. WS 8888) send SOCPlayerElement(PLAYED_DEV_CARD_FLAG) instead,
  // handled via applyPlayerElement/applyElementToView. Kept for compatibility.
  conn.on(MessageType.SETPLAYEDDEVCARD, (msg: SOCMessage) => {
    const m = msg as SOCSetPlayedDevCard;
    useGameStore.getState().applySetPlayedDevCard(m.game, m.playerNumber, m.playedDevCard);
  });

  // Server declined a player request (e.g. a second dev-card play, build here,
  // not your turn). The Java client surfaces the decline reason; do the same so
  // a rejected request produces visible feedback instead of failing silently.
  conn.on(MessageType.DECLINEPLAYERREQUEST, (msg: SOCMessage) => {
    const d = msg as SOCDeclinePlayerRequest;
    const text =
      d.reasonText !== null && d.reasonText !== '' ? d.reasonText : declineReasonText(d.reasonCode);
    const st = useGameStore.getState();
    st.appendGameLog(d.game, text);
    st.setError(text);
  });

  // Robber / discard
  conn.on(MessageType.DISCARDREQUEST, (msg: SOCMessage) => {
    const d = msg as SOCDiscardRequest;
    useGameStore.getState().applyDiscardRequest(d.game, d.numDiscards);
  });

  conn.on(MessageType.MOVEROBBER, (msg: SOCMessage) => {
    useGameStore.getState().applyMoveRobber(msg as SOCMoveRobber);
  });

  conn.on(MessageType.CHOOSEPLAYERREQUEST, (msg: SOCMessage) => {
    useGameStore.getState().applyChoosePlayerRequest(msg as SOCChoosePlayerRequest);
  });

  conn.on(MessageType.ROBBERYRESULT, (msg: SOCMessage) => {
    useGameStore.getState().applyRobberyResult(msg as SOCRobberyResult);
  });

  // Misc
  conn.on(MessageType.SIMPLEACTION, (msg: SOCMessage) => {
    const a = msg as SOCSimpleAction;
    const st = useGameStore.getState();
    const cg = st.currentGame;
    if (cg === null) {
      return;
    }
    if (a.actType === SimpleActionType.DEVCARD_BOUGHT) {
      // value1 = remaining unbought cards in the deck.
      st.applyDevCardCount(a.game, a.value1);
      st.appendGameLog(a.game, `${seatLabel(cg, a.playerNumber)} bought a development card.`);
    } else if (a.actType === SimpleActionType.RSRC_TYPE_MONOPOLIZED) {
      // value1 = total taken, value2 = resource type.
      st.appendGameLog(
        a.game,
        `${seatLabel(cg, a.playerNumber)} monopolized ${a.value1} ${resourceName(a.value2)}.`,
      );
    }
  });

  conn.on(MessageType.GAMESTATS, (msg: SOCMessage) => {
    useGameStore.getState().applyGameStats(msg as SOCGameStats);
  });

  conn.connect();
  return conn;
}

/** Describe a resource set as "3 ore" / "1 sheep, 2 wood" / "nothing" for the log. */
function describeResourceSet(rs: ResourceSet): string {
  const order: [number, ResourceValue][] = [
    [rs.clay, Resource.CLAY],
    [rs.ore, Resource.ORE],
    [rs.sheep, Resource.SHEEP],
    [rs.wheat, Resource.WHEAT],
    [rs.wood, Resource.WOOD],
  ];
  const parts: string[] = [];
  for (const [amt, type] of order) {
    if (amt > 0) {
      parts.push(`${amt} ${resourceName(type)}`);
    }
  }
  return parts.length > 0 ? parts.join(', ') : 'nothing';
}

/**
 * User-facing text for a {@link SOCRejectOffer} reply-reason code, mirroring the
 * Java client's SOCPlayerInterface.playerTradeDisallowed strings (the i18n keys
 * reply.common.trade.cannot_make / trade.msg.cant.make.offer /
 * base.reply.not.your.turn). Used to surface bank/port-trade rejections.
 */
function rejectOfferReasonText(reasonCode: number): string {
  switch (reasonCode) {
    case RejectOfferReason.REASON_CANNOT_MAKE_TRADE:
      return "You can't make that trade.";
    case RejectOfferReason.REASON_NOT_YOUR_TURN:
      return "It's not your turn.";
    case RejectOfferReason.REASON_CANNOT_MAKE_OFFER:
      return "You can't make that offer.";
    default:
      return "You can't make that trade.";
  }
}

/**
 * User-facing text for a {@link SOCDeclinePlayerRequest} reason code, mirroring
 * the Java client's SOCPlayerInterface.showDeclinedPlayerRequest strings. Used
 * when the message carries no localized reasonText of its own.
 */
function declineReasonText(reasonCode: number): string {
  switch (reasonCode) {
    case DeclineReason.REASON_NOT_THIS_GAME:
      return "You can't do that in this game.";
    case DeclineReason.REASON_NOT_YOUR_TURN:
      return "It's not your turn.";
    case DeclineReason.REASON_LOCATION:
      return "You can't do that at that location.";
    default:
      return "You can't do that right now.";
  }
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

// ---------------------------------------------------------------------------
// Phase 4 — full in-game interaction action senders.
//
// Each builds the right SOCMessage and sends it; the server's broadcast then
// updates the store via the reducers above. Resource sets are the five known
// amounts CLAY..WOOD (UNKNOWN excluded), matching the Java messages.
// ---------------------------------------------------------------------------

/** Build a {@link ResourceSet} from a CLAY..WOOD count record. */
function toResourceSet(amounts: Partial<Record<ResourceValue, number>>): ResourceSet {
  return resourceSet(
    amounts[Resource.CLAY] ?? 0,
    amounts[Resource.ORE] ?? 0,
    amounts[Resource.SHEEP] ?? 0,
    amounts[Resource.WHEAT] ?? 0,
    amounts[Resource.WOOD] ?? 0,
  );
}

/**
 * Request a bank/port trade: give one resource set, get another. Sends
 * SOCBankTrade (pn omitted, -1); the server validates the ratio and broadcasts
 * the resulting SOCBankTrade + PLAYERELEMENT updates.
 *
 * @param give  resources offered to the bank/port (CLAY..WOOD counts)
 * @param get   resources requested from the bank/port (CLAY..WOOD counts)
 */
export function bankTrade(
  give: Partial<Record<ResourceValue, number>>,
  get: Partial<Record<ResourceValue, number>>,
): void {
  const conn = connection;
  const cg = useGameStore.getState().currentGame;
  if (conn === null || cg === null) {
    return; // <--- Early return: not in a game ---
  }
  conn.send(new SOCBankTrade(cg.gameName, toResourceSet(give), toResourceSet(get)));
}

/**
 * Propose a player-to-player trade. Sends SOCMakeOffer offering `give` for
 * `get` to the seats flagged in `toPlayers`; the server broadcasts the offer.
 *
 * @param give       resources the local player offers (CLAY..WOOD counts)
 * @param get        resources wanted in return (CLAY..WOOD counts)
 * @param toPlayers  per-seat flags: true = offer made to that seat
 */
export function makeOffer(
  give: Partial<Record<ResourceValue, number>>,
  get: Partial<Record<ResourceValue, number>>,
  toPlayers: boolean[],
): void {
  const conn = connection;
  const cg = useGameStore.getState().currentGame;
  if (conn === null || cg === null || cg.mySeat < 0) {
    return; // <--- Early return: not seated ---
  }
  const offer: TradeOffer = {
    from: cg.mySeat,
    to: toPlayers,
    give: toResourceSet(give),
    get: toResourceSet(get),
  };
  conn.send(new SOCMakeOffer(cg.gameName, offer));
}

/**
 * Accept the trade offer made by `fromPn`. Sends SOCAcceptOffer (accepting is
 * filled by the server); the server broadcasts the completed trade.
 *
 * @param fromPn  the offering seat whose offer to accept
 */
export function acceptOffer(fromPn: number): void {
  const conn = connection;
  const cg = useGameStore.getState().currentGame;
  if (conn === null || cg === null || cg.mySeat < 0) {
    return; // <--- Early return: not seated ---
  }
  conn.send(new SOCAcceptOffer(cg.gameName, cg.mySeat, fromPn));
}

/**
 * Reject all outstanding trade offers ("no thanks"). Sends SOCRejectOffer; the
 * server fills in the rejecting player number and broadcasts.
 */
export function rejectOffer(): void {
  const conn = connection;
  const cg = useGameStore.getState().currentGame;
  if (conn === null || cg === null || cg.mySeat < 0) {
    return; // <--- Early return: not seated ---
  }
  // playerNumber is ignored by the server from the client; send our seat.
  conn.send(new SOCRejectOffer(cg.gameName, cg.mySeat));
}

/**
 * Retract the local player's own trade offer. Sends SOCClearOffer with our seat;
 * the server broadcasts the clear.
 */
export function clearOffer(): void {
  const conn = connection;
  const cg = useGameStore.getState().currentGame;
  if (conn === null || cg === null || cg.mySeat < 0) {
    return; // <--- Early return: not seated ---
  }
  conn.send(new SOCClearOffer(cg.gameName, cg.mySeat));
}

/** Request to buy a development card. Sends SOCBuyDevCardRequest. */
export function buyDevCard(): void {
  const conn = connection;
  const cg = useGameStore.getState().currentGame;
  if (conn === null || cg === null) {
    return; // <--- Early return: not in a game ---
  }
  conn.send(new SOCBuyDevCardRequest(cg.gameName));
}

/** Internal: send a SOCPlayDevCardRequest for the given card type. */
function playDevCard(devCardType: number): void {
  const conn = connection;
  const cg = useGameStore.getState().currentGame;
  if (conn === null || cg === null) {
    return; // <--- Early return: not in a game ---
  }
  conn.send(new SOCPlayDevCardRequest(cg.gameName, devCardType));
}

/** Play a Knight/Soldier card. Server moves to PLACING_ROBBER (or pirate). */
export function playKnight(): void {
  playDevCard(DevCardType.KNIGHT);
}

/** Play a Road Building card. Server moves to PLACING_FREE_ROAD1. */
export function playRoadBuilding(): void {
  playDevCard(DevCardType.ROADS);
}

/**
 * Play a Monopoly card. The server moves to WAITING_FOR_MONOPOLY; the UI then
 * calls {@link pickMonopoly} with the chosen resource type.
 */
export function playMonopoly(): void {
  playDevCard(DevCardType.MONO);
}

/**
 * Play a Year of Plenty / Discovery card. The server moves to
 * WAITING_FOR_DISCOVERY; the UI then calls {@link pickResources} with two picks.
 */
export function playYearOfPlenty(): void {
  playDevCard(DevCardType.DISC);
}

/**
 * Pick free resources (Year of Plenty discovery, or a gold-hex pick). Sends
 * SOCPickResources with the chosen CLAY..WOOD amounts.
 *
 * @param amounts  CLAY..WOOD counts to pick (must total the required number)
 */
export function pickResources(amounts: Partial<Record<ResourceValue, number>>): void {
  const conn = connection;
  const cg = useGameStore.getState().currentGame;
  if (conn === null || cg === null) {
    return; // <--- Early return: not in a game ---
  }
  conn.send(new SOCPickResources(cg.gameName, toResourceSet(amounts)));
}

/**
 * Pick the resource type to monopolize (Monopoly card). Sends
 * SOCPickResourceType; the server takes that resource from all other players.
 *
 * @param resType  a {@link Resource} value (CLAY..WOOD)
 */
export function pickMonopoly(resType: number): void {
  const conn = connection;
  const cg = useGameStore.getState().currentGame;
  if (conn === null || cg === null) {
    return; // <--- Early return: not in a game ---
  }
  conn.send(new SOCPickResourceType(cg.gameName, resType));
}

/**
 * Move the robber (positive hex coord) or pirate (negative coord) to `hexCoord`.
 * Sends SOCMoveRobber for the local player. When `pirate` is true the coordinate
 * is negated before sending so the server treats it as a pirate move.
 *
 * @param hexCoord  0xRRCC hex coordinate (positive)
 * @param pirate    when true, send as a pirate move (negative coordinate)
 */
export function moveRobber(hexCoord: number, pirate = false): void {
  const conn = connection;
  const cg = useGameStore.getState().currentGame;
  if (conn === null || cg === null || cg.mySeat < 0) {
    return; // <--- Early return: not seated ---
  }
  const coord = pirate ? -Math.abs(hexCoord) : hexCoord;
  conn.send(new SOCMoveRobber(cg.gameName, cg.mySeat, coord));
}

/**
 * Choose a player to rob from (after moving the robber). Sends SOCChoosePlayer
 * with the victim seat number, then clears the local victim chooser.
 *
 * @param pn  the chosen victim seat number, or a ChoosePlayerChoice special
 */
export function choosePlayer(pn: number): void {
  const conn = connection;
  const cg = useGameStore.getState().currentGame;
  if (conn === null || cg === null) {
    return; // <--- Early return: not in a game ---
  }
  conn.send(new SOCChoosePlayer(cg.gameName, pn));
  useGameStore.getState().clearRobVictims(cg.gameName);
}

/**
 * Discard the chosen resources after a 7 is rolled. Sends SOCDiscard with the
 * five CLAY..WOOD amounts (no player number from the client) and clears the
 * local discard requirement.
 *
 * @param amounts  CLAY..WOOD counts to discard (must total the required number)
 */
export function discard(amounts: Partial<Record<ResourceValue, number>>): void {
  const conn = connection;
  const cg = useGameStore.getState().currentGame;
  if (conn === null || cg === null) {
    return; // <--- Early return: not in a game ---
  }
  // From the client, no player number (pn = -1); five amounts + unknown=0.
  conn.send(new SOCDiscard(cg.gameName, -1, toResourceSet(amounts)));
  useGameStore.getState().applyDiscardRequest(cg.gameName, 0);
}

/**
 * Send a debug chat command (e.g. "rsrcs: 1 0 1 0 1 #0", "*FREEPLACE* 1") as a
 * SOCGameTextMsg in the joined game. The server runs it when debug is enabled
 * (the dev server runs with -Djsettlers.allow.debug=Y). Useful for setting up
 * board states for testing interactions.
 *
 * @param text  the debug command text (as typed into a game's chat box)
 */
export function sendDebug(text: string): void {
  const conn = connection;
  const cg = useGameStore.getState().currentGame;
  if (conn === null || cg === null) {
    return; // <--- Early return: not in a game ---
  }
  const nick = useGameStore.getState().nickname;
  conn.send(new SOCGameTextMsg(cg.gameName, nick, text));
}

export { PieceTypeConst, GameState, DevCardType, Resource };
