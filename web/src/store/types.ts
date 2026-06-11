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
  };
}
