// Shared store value types for the in-game view (Phase 3).
//
// PlayerView is the render-friendly per-seat snapshot the GameScreen consumes;
// the gameStore reducers keep it in sync with the authoritative server state.
// The player-color palette lives here too so both the store and the SVG board
// renderer (which takes playerColors) draw from one source.

/**
 * A player's per-resource hand counts, indexed by resource. For the local
 * player these are the real amounts (the server sends per-resource
 * SOCPlayerElement updates only to that client); for opponents the per-resource
 * fields stay 0 and only {@link PlayerView.resourceTotal} is meaningful (the
 * server sends opponents a single UNKNOWN/RESOURCE_COUNT total).
 */
export interface ResourceCounts {
  clay: number;
  ore: number;
  sheep: number;
  wheat: number;
  wood: number;
}

/** A fresh, all-zero {@link ResourceCounts}. */
export function emptyResources(): ResourceCounts {
  return { clay: 0, ore: 0, sheep: 0, wheat: 0, wood: 0 };
}

/**
 * A player's Cities & Knights commodity counts (cloth/coin/paper; per-player
 * counters separate from the 5-resource hand). From SOCPlayerElement(s)
 * PETypes CK_CLOTH_COUNT(110)..CK_PAPER_COUNT(112) — GAIN on production,
 * SET on join/loss, LOSE honored too. See
 * doc/Cities-and-Knights-Implemented.md ("Commodities").
 */
export interface CKCommodityCounts {
  cloth: number;
  coin: number;
  paper: number;
}

/**
 * A player's Cities & Knights knight counts by level (1=basic, 2=strong,
 * 3=mighty): totals plus the active subset. From SOCPlayerElement(s) PETypes
 * CK_KNIGHTS_LV1..LV3(113..115) and CK_KNIGHTS_ACTIVE_LV1..LV3(116..118),
 * always SET. See doc/Cities-and-Knights-Implemented.md ("Knights").
 */
export interface CKKnightCounts {
  /** Total basic (level-1) knights. */
  lv1: number;
  /** Total strong (level-2) knights. */
  lv2: number;
  /** Total mighty (level-3) knights. */
  lv3: number;
  /** Active basic knights (subset of {@link lv1}). */
  activeLv1: number;
  /** Active strong knights (subset of {@link lv2}). */
  activeLv2: number;
  /** Active mighty knights (subset of {@link lv3}). */
  activeLv3: number;
}

/**
 * A player's Cities & Knights city-improvement track levels (0..5 each).
 * From SOCSetSpecialItem OP_SET / OP_SET_PICK with typeKeys '_CK_IMP/T'
 * (Trade, costs cloth), '_CK_IMP/P' (Politics, costs coin), '_CK_IMP/S'
 * (Science, costs paper). See doc/Cities-and-Knights-Implemented.md
 * ("City improvements").
 */
export interface CKImprovementLevels {
  trade: number;
  politics: number;
  science: number;
}

/**
 * The Cities & Knights per-seat state slice of a {@link PlayerView}. Present
 * on every view (all zeros outside C&K games, where the driving messages
 * never arrive). @since (web) C&K phase
 */
export interface CKPlayerView {
  /** Commodity counts (cloth/coin/paper). */
  commodities: CKCommodityCounts;
  /** Knight counts by level, total + active. */
  knights: CKKnightCounts;
  /** City-improvement track levels (0..5). */
  improvements: CKImprovementLevels;
  /**
   * Number of hidden progress cards held. For opponents this is tracked from
   * SOCInventoryItemAction ADD_PLAYABLE announcements with itemType 0 (hidden
   * draw) and PLAYED; for the local player it mirrors the real hand
   * (CurrentGame.myProgressHand).
   */
  progressCards: number;
  /**
   * Revealed victory-point progress-card itypes (Constitution=16, Printer=19),
   * announced to all players as ADD_OTHER with isVP=true. Worth +1 SVP each.
   */
  vpProgressCards: number[];
}

/** A fresh, all-zero {@link CKPlayerView}. */
export function emptyCKPlayerView(): CKPlayerView {
  return {
    commodities: { cloth: 0, coin: 0, paper: 0 },
    knights: { lv1: 0, lv2: 0, lv3: 0, activeLv1: 0, activeLv2: 0, activeLv3: 0 },
    improvements: { trade: 0, politics: 0, science: 0 },
    progressCards: 0,
    vpProgressCards: [],
  };
}

/**
 * Render-ready per-seat view of a player in the started game. Mirrors the
 * subset of {@code soc.game.SOCPlayer} the in-game UI shows. Built and updated
 * from SITDOWN / PLAYERELEMENT(S) / GAMEELEMENTS / PUTPIECE / dice messages.
 */
export interface PlayerView {
  /** Seat (player) number, 0-based. */
  playerNumber: number;
  /** Occupant nickname, or '' if the seat is vacant. */
  name: string;
  /** True if this seat is held by a robot/bot. */
  isRobot: boolean;
  /** True once a player (human or bot) is seated here. */
  seated: boolean;
  /** This seat's player color (from {@link PLAYER_COLORS}). */
  color: string;
  /** Total resource cards held (authoritative; from RESOURCE_COUNT/UNKNOWN). */
  resourceTotal: number;
  /**
   * Per-resource hand counts. Only meaningful (non-zero) for the local player;
   * opponents keep zeros here and rely on {@link resourceTotal}.
   */
  resources: ResourceCounts;
  /** Road pieces left to place. */
  roads: number;
  /** Settlement pieces left to place. */
  settlements: number;
  /** City pieces left to place. */
  cities: number;
  /** Ship pieces left to place (sea board). */
  ships: number;
  /** Number of development cards held (from GAMEELEMENTS / counted on play). */
  devCardCount: number;
  /** Knights/soldiers played (army size). */
  knights: number;
  /** Current victory points (public total). */
  vp: number;
  /** True if this player currently holds Longest Road/Route. */
  longestRoad: boolean;
  /** True if this player currently holds Largest Army. */
  largestArmy: boolean;
  /**
   * Number of resources this player must pick from a gold hex (sea board); 0
   * when not picking. From SOCPlayerElement(NUM_PICK_GOLD_HEX_RESOURCES).
   */
  numPickGoldRes: number;
  /**
   * True if this player has already played a development card this turn (at most
   * one is allowed). From SOCPlayerElement(PLAYED_DEV_CARD_FLAG) / the legacy
   * SOCSetPlayedDevCard. Cleared at the start of this player's next turn (the
   * server folds the flag-clear into SOCTurn for v2.5.00+ clients, so the
   * applyTurn reducer clears it rather than waiting for a SET-to-0 element).
   */
  playedDevCard: boolean;
  /**
   * Cities & Knights per-seat state (commodities, knights, improvement levels,
   * progress-card counts). Always present; stays all-zero outside C&K games.
   */
  ck: CKPlayerView;
}

/**
 * Player seat colors, indexed by seat number. Mirrors the Swing client ordering
 * (see SOCPlayerInterface / ColorSquare): 0=blue, 1=red, 2=green, 3=orange, and
 * 6-player purple/brown for seats 4 and 5. Hex values match the theme tokens'
 * --color-player-* so the board and panels read the same in CSS and SVG.
 */
export const PLAYER_COLORS: readonly string[] = [
  '#2a6fd6', // seat 0 — blue
  '#d62a2a', // seat 1 — red
  '#2aa84a', // seat 2 — green
  '#e08a1e', // seat 3 — orange
  '#8a4fd6', // seat 4 — purple (6-player)
  '#8a5a2b', // seat 5 — brown (6-player)
];

/** The color for a seat number, falling back to a neutral if out of range. */
export function colorForSeat(playerNumber: number): string {
  return PLAYER_COLORS[playerNumber] ?? '#999999';
}

/** Build a fresh, vacant {@link PlayerView} for the given seat. */
export function makePlayerView(playerNumber: number): PlayerView {
  return {
    playerNumber,
    name: '',
    isRobot: false,
    seated: false,
    color: colorForSeat(playerNumber),
    resourceTotal: 0,
    resources: emptyResources(),
    roads: 15,
    settlements: 5,
    cities: 4,
    ships: 15,
    devCardCount: 0,
    knights: 0,
    vp: 0,
    longestRoad: false,
    largestArmy: false,
    numPickGoldRes: 0,
    playedDevCard: false,
    ck: emptyCKPlayerView(),
  };
}
