import { useEffect, useRef, useState } from 'react';

import { Button, Dialog, Panel, useToast } from '../components';
import { BoardSVG } from '../board';
import {
  getAdjacentEdgesToNode,
  getAdjacentNodesToEdge,
  getAdjacentNodesToHex,
} from '../board/coords';
import {
  type BoardModel,
  HEX_WATER,
  PIECE_ROAD,
  PIECE_SETTLEMENT,
  PIECE_CITY,
  PIECE_SHIP,
} from '../board/types';
import {
  type DevCardTypeValue,
  type ResourceValue,
  ChoosePlayerChoice,
  CKProgressCard,
  DevCardType,
  GameState,
  PieceTypeConst,
  Resource,
} from '../protocol';
import {
  CKBarbarianBanner,
  CKCommodityPickDialog,
  CKPanel,
  CKPlayerSummary,
} from '../components/ck';
import {
  type CurrentGame,
  type DevCardInventory,
  type GameLogEntry,
  type PlayerView,
  CK_TRACK_NAMES,
  PLAYER_COLORS,
  acceptOffer,
  bankTrade,
  buyDevCard,
  cancelBuild,
  choosePlayer,
  clearOffer,
  discard,
  endTurn,
  inventorySize,
  isInitialPlacementState,
  isMyTurn as isMyTurnOf,
  leaveGame,
  makeOffer,
  moveRobber,
  pickMonopoly,
  pickResources,
  playKnight,
  playMonopoly,
  playRoadBuilding,
  playYearOfPlenty,
  putPiece,
  rejectOffer,
  rollDice,
  buildRequest,
  sendChat,
  useGameStore,
} from '../store/gameStore';
import { useSettingsStore } from '../store/settingsStore';
import { useUiStore } from '../store/uiStore';
import { useTheme } from '../theme/useTheme';
import { playSound } from '../util/sound';
import styles from './GameScreen.module.css';

/** Emoji icon for each resource key (used on cards, chips and pickers). */
const RESOURCE_ICONS: Record<string, string> = {
  clay: '🧱',
  ore: '🪨',
  sheep: '🐑',
  wheat: '🌾',
  wood: '🌲',
};

/** Resource picker order + display labels (CLAY..WOOD). */
const RESOURCE_PICK: ReadonlyArray<{ type: ResourceValue; key: string; label: string }> = [
  { type: Resource.CLAY, key: 'clay', label: 'Clay' },
  { type: Resource.ORE, key: 'ore', label: 'Ore' },
  { type: Resource.SHEEP, key: 'sheep', label: 'Sheep' },
  { type: Resource.WHEAT, key: 'wheat', label: 'Wheat' },
  { type: Resource.WOOD, key: 'wood', label: 'Wood' },
];

/** Human-readable dev-card names, keyed by {@link DevCardType}. */
const DEV_CARD_NAMES: Record<number, string> = {
  [DevCardType.KNIGHT]: 'Knight',
  [DevCardType.ROADS]: 'Road Building',
  [DevCardType.DISC]: 'Year of Plenty',
  [DevCardType.MONO]: 'Monopoly',
  [DevCardType.CAP]: 'Capitol (VP)',
  [DevCardType.MARKET]: 'Market (VP)',
  [DevCardType.UNIV]: 'University (VP)',
  [DevCardType.TEMPLE]: 'Temple (VP)',
  [DevCardType.CHAPEL]: 'Chapel (VP)',
};

/** A CLAY..WOOD count map keyed by resource value, for the picker dialogs. */
type ResourceTally = Partial<Record<ResourceValue, number>>;

/** Total resources in a tally. */
function tallyTotal(t: ResourceTally): number {
  return RESOURCE_PICK.reduce((sum, r) => sum + (t[r.type] ?? 0), 0);
}

/** The local player's hand as a {@link ResourceTally}. */
function handTally(view: PlayerView): ResourceTally {
  return {
    [Resource.CLAY]: view.resources.clay,
    [Resource.ORE]: view.resources.ore,
    [Resource.SHEEP]: view.resources.sheep,
    [Resource.WHEAT]: view.resources.wheat,
    [Resource.WOOD]: view.resources.wood,
  };
}

/** Build costs as resource-count deltas (positive = required). */
const COSTS = {
  road: { clay: 1, wood: 1 },
  settlement: { clay: 1, wood: 1, sheep: 1, wheat: 1 },
  city: { ore: 3, wheat: 2 },
} as const;

function canAfford(view: PlayerView, cost: Partial<Record<keyof PlayerView['resources'], number>>): boolean {
  return (Object.keys(cost) as (keyof PlayerView['resources'])[]).every(
    (k) => view.resources[k] >= (cost[k] ?? 0),
  );
}

/** The 2-3 nodes adjacent to {@code node} (the far ends of its incident edges). */
function adjacentNodes(node: number): number[] {
  const out: number[] = [];
  for (const e of getAdjacentEdgesToNode(node)) {
    const [a, b] = getAdjacentNodesToEdge(e);
    out.push(a === node ? b : a);
  }
  return out;
}

/** True if {@code node} is a corner of at least one land (non-water) hex. */
function nodeBordersLand(board: BoardModel, node: number): boolean {
  for (const hex of board.hexes) {
    if (hex.hexType === HEX_WATER) continue;
    if (getAdjacentNodesToHex(hex.coord).indexOf(node) !== -1) {
      return true;
    }
  }
  return false;
}

/**
 * Settlement nodes the local player may legally place on: from the server's
 * potential-settlement set, keep only nodes that border land and satisfy the
 * distance rule (no settlement/city on the node or any node adjacent to it).
 * Mirrors the server's checks so we never offer a placement it would reject.
 */
function legalSettlementNodes(cg: CurrentGame): number[] {
  const board = cg.board;
  const blocked = new Set<number>();
  for (const p of cg.pieces) {
    if (p.ptype === PIECE_SETTLEMENT || p.ptype === PIECE_CITY) {
      blocked.add(p.coord);
      for (const adj of adjacentNodes(p.coord)) blocked.add(adj);
    }
  }
  return cg.potentialNodes.filter(
    (n) => !blocked.has(n) && (board === null || nodeBordersLand(board, n)),
  );
}

/** Node coords of the local player's settlements (upgradeable to cities). */
function mySettlementNodes(cg: CurrentGame): number[] {
  return cg.pieces
    .filter((p) => p.ptype === PIECE_SETTLEMENT && p.playerNumber === cg.mySeat)
    .map((p) => p.coord);
}

/**
 * True if {@code edge} borders at least one land hex (so a road may be built
 * there). On the sea board, edges bordering only water are ship-only and a road
 * placement there is rejected by the server. An edge borders a hex exactly when
 * both its endpoint nodes are corners of that hex.
 */
function edgeBordersLand(board: BoardModel, edge: number): boolean {
  const [n1, n2] = getAdjacentNodesToEdge(edge);
  for (const hex of board.hexes) {
    if (hex.hexType === HEX_WATER) continue;
    const corners = getAdjacentNodesToHex(hex.coord);
    if (corners.indexOf(n1) !== -1 && corners.indexOf(n2) !== -1) {
      return true;
    }
  }
  return false;
}

/** Edge coords already occupied by a road or ship. */
function occupiedEdges(cg: CurrentGame): Set<number> {
  const s = new Set<number>();
  for (const p of cg.pieces) {
    if (p.ptype === PIECE_ROAD || p.ptype === PIECE_SHIP) {
      s.add(p.coord);
    }
  }
  return s;
}

/**
 * A superset of the local player's legal road edges: empty edges adjacent to
 * any of their settlements/cities or touching their existing roads. The server
 * is authoritative and rejects truly-illegal placements, so a generous set is
 * fine for highlighting.
 */
function legalRoadEdges(cg: CurrentGame): number[] {
  const occupied = occupiedEdges(cg);
  const candidates = new Set<number>();
  // Edges adjacent to my settlement/city nodes.
  for (const p of cg.pieces) {
    if ((p.ptype === PIECE_SETTLEMENT || p.ptype === PIECE_CITY) && p.playerNumber === cg.mySeat) {
      for (const e of getAdjacentEdgesToNode(p.coord)) candidates.add(e);
    }
  }
  // Edges touching the endpoints of my existing roads.
  for (const p of cg.pieces) {
    if (p.ptype === PIECE_ROAD && p.playerNumber === cg.mySeat) {
      for (const node of getAdjacentNodesToEdge(p.coord)) {
        for (const e of getAdjacentEdgesToNode(node)) candidates.add(e);
      }
    }
  }
  const board = cg.board;
  return [...candidates].filter(
    (e) => !occupied.has(e) && (board === null || edgeBordersLand(board, e)),
  );
}

/** Initial-road edges: empty land edges touching the just-placed initial settlement. */
function initialRoadEdges(cg: CurrentGame): number[] {
  if (cg.lastInitSettlement === null) return [];
  const occupied = occupiedEdges(cg);
  const board = cg.board;
  return getAdjacentEdgesToNode(cg.lastInitSettlement).filter(
    (e) => !occupied.has(e) && (board === null || edgeBordersLand(board, e)),
  );
}

/**
 * Placement highlights + click handlers for the current state, when it is the
 * local player's turn. Returns empty/no-op when there's nothing to place.
 */
interface Highlights {
  nodes: number[];
  edges: number[];
  onNodeClick?: (coord: number) => void;
  onEdgeClick?: (coord: number) => void;
  /** When set, hexes become clickable (robber/pirate placement). */
  onHexClick?: (coord: number) => void;
}

function computeHighlights(cg: CurrentGame): Highlights {
  if (!isMyTurnOf(cg)) return { nodes: [], edges: [] };
  const st = cg.gameState;
  // Initial settlement / second / third
  if (st === GameState.START1A || st === GameState.START2A || st === GameState.START3A) {
    return { nodes: legalSettlementNodes(cg), edges: [], onNodeClick: (c) => putPiece(PieceTypeConst.SETTLEMENT, c) };
  }
  // Initial road
  if (st === GameState.START1B || st === GameState.START2B || st === GameState.START3B) {
    return { nodes: [], edges: initialRoadEdges(cg), onEdgeClick: (c) => putPiece(PieceTypeConst.ROAD, c) };
  }
  // Normal placement after a build request
  if (st === GameState.PLACING_SETTLEMENT) {
    return { nodes: legalSettlementNodes(cg), edges: [], onNodeClick: (c) => putPiece(PieceTypeConst.SETTLEMENT, c) };
  }
  if (st === GameState.PLACING_ROAD || st === GameState.PLACING_FREE_ROAD1 || st === GameState.PLACING_FREE_ROAD2) {
    return { nodes: [], edges: legalRoadEdges(cg), onEdgeClick: (c) => putPiece(PieceTypeConst.ROAD, c) };
  }
  if (st === GameState.PLACING_CITY) {
    return { nodes: mySettlementNodes(cg), edges: [], onNodeClick: (c) => putPiece(PieceTypeConst.CITY, c) };
  }
  // Robber / pirate placement: click a hex to move it (positive coord robber,
  // negated to a pirate move by moveRobber()).
  if (st === GameState.PLACING_ROBBER) {
    return { nodes: [], edges: [], onHexClick: (c) => moveRobber(c, false) };
  }
  if (st === GameState.PLACING_PIRATE) {
    return { nodes: [], edges: [], onHexClick: (c) => moveRobber(c, true) };
  }
  return { nodes: [], edges: [] };
}

/**
 * Human-readable label for a numeric {@link GameState}. Covers the core-loop
 * states the web client reaches in Phase 3; unknown values fall back to the
 * raw number so nothing silently disappears.
 */
function gameStateLabel(state: number): string {
  switch (state) {
    case GameState.NEW:
      return 'Setting up';
    case GameState.READY:
      return 'Ready';
    case GameState.START1A:
      return 'Initial placement: first settlement';
    case GameState.START1B:
      return 'Initial placement: first road';
    case GameState.START2A:
      return 'Initial placement: second settlement';
    case GameState.START2B:
      return 'Initial placement: second road';
    case GameState.START3A:
      return 'Initial placement: third settlement';
    case GameState.START3B:
      return 'Initial placement: third road';
    case GameState.ROLL_OR_CARD:
      return 'Roll dice or play a card';
    case GameState.PLAY1:
      return 'Build, trade, or buy';
    case GameState.PLACING_ROAD:
      return 'Placing a road';
    case GameState.PLACING_SETTLEMENT:
      return 'Placing a settlement';
    case GameState.PLACING_CITY:
      return 'Placing a city';
    case GameState.PLACING_SHIP:
      return 'Placing a ship';
    case GameState.PLACING_ROBBER:
      return 'Moving the robber';
    case GameState.PLACING_PIRATE:
      return 'Moving the pirate';
    case GameState.PLACING_FREE_ROAD1:
    case GameState.PLACING_FREE_ROAD2:
      return 'Placing a free road';
    case GameState.WAITING_FOR_DISCARDS:
      return 'Waiting for discards';
    case GameState.WAITING_FOR_ROB_CHOOSE_PLAYER:
      return 'Choosing a player to rob';
    case GameState.WAITING_FOR_DISCOVERY:
      return 'Choosing Year of Plenty resources';
    case GameState.WAITING_FOR_MONOPOLY:
      return 'Choosing a Monopoly resource';
    case GameState.WAITING_FOR_ROBBER_OR_PIRATE:
      return 'Choosing robber or pirate';
    case GameState.WAITING_FOR_PICK_GOLD_RESOURCE:
      return 'Picking a gold-hex resource';
    case GameState.SPECIAL_BUILDING:
      return 'Special building phase';
    case GameState.OVER:
      return 'Game over';
    default:
      return `State ${state}`;
  }
}

/** Resource breakdown rows for the local player's hand, in canonical order. */
const RESOURCE_ROWS: ReadonlyArray<{ key: keyof PlayerView['resources']; label: string }> = [
  { key: 'clay', label: 'Clay' },
  { key: 'ore', label: 'Ore' },
  { key: 'sheep', label: 'Sheep' },
  { key: 'wheat', label: 'Wheat' },
  { key: 'wood', label: 'Wood' },
];

/** One per-seat player panel. */
function PlayerPanel({
  view,
  isCurrent,
  isMe,
  ckEnabled = false,
  metropolisTracks = [],
}: {
  view: PlayerView;
  isCurrent: boolean;
  isMe: boolean;
  /** True in a Cities & Knights game: show the compact C&K summary. */
  ckEnabled?: boolean;
  /** C&K improvement-track indexes whose metropolis this player owns. */
  metropolisTracks?: number[];
}): JSX.Element {
  const pn = view.playerNumber;
  const displayName = view.seated ? view.name : `Seat ${pn + 1}`;
  const initial = view.seated && view.name !== '' ? view.name[0].toUpperCase() : '·';
  return (
    <li
      className={`${styles.playerPanel} ${isCurrent ? styles.playerCurrent : ''}`}
      data-testid={`player-panel-${pn}`}
      data-current={isCurrent ? 'true' : 'false'}
      data-seated={view.seated ? 'true' : 'false'}
      data-robot={view.isRobot ? 'true' : 'false'}
      style={{ ['--seat-color' as string]: view.color }}
    >
      <div className={styles.playerHead}>
        <span
          className={styles.avatar}
          data-testid={`player-swatch-${pn}`}
          style={{ backgroundColor: view.color }}
          aria-hidden="true"
        >
          {initial}
        </span>
        <span className={styles.playerName} data-testid={`player-name-${pn}`}>
          {displayName}
          {view.isRobot && <span className={styles.botTag}> (bot)</span>}
          {isMe && <span className={styles.youTag}> (you)</span>}
        </span>
        <span className={styles.vp} data-testid={`player-vp-${pn}`} title="Victory points">
          {view.vp} VP
        </span>
      </div>

      <div className={styles.playerStats}>
        <span className={styles.stat} data-testid={`player-resources-${pn}`} title="Resource cards">
          <span className={styles.statIcon} aria-hidden="true">🎴</span>
          <span className={styles.statValue}>{view.resourceTotal}</span>
        </span>
        <span className={styles.stat} title="Development cards">
          <span className={styles.statIcon} aria-hidden="true">📜</span>
          <span className={styles.statValue}>{view.devCardCount}</span>
        </span>
        <span className={styles.stat} title="Knights played">
          <span className={styles.statIcon} aria-hidden="true">⚔️</span>
          <span className={styles.statValue}>{view.knights}</span>
        </span>
        <span className={styles.statDivider} aria-hidden="true" />
        <span className={styles.piece} title="Roads remaining">
          <span className={styles.statIcon} aria-hidden="true">🛣️</span> {view.roads}
        </span>
        <span className={styles.piece} title="Settlements remaining">
          <span className={styles.statIcon} aria-hidden="true">🏠</span> {view.settlements}
        </span>
        <span className={styles.piece} title="Cities remaining">
          <span className={styles.statIcon} aria-hidden="true">🏰</span> {view.cities}
        </span>
        <span className={styles.piece} title="Ships remaining">
          <span className={styles.statIcon} aria-hidden="true">⛵</span> {view.ships}
        </span>
      </div>

      <div className={styles.awards}>
        {view.longestRoad && (
          <span className={styles.award} data-testid={`award-lr-${pn}`}>
            Longest Road
          </span>
        )}
        {view.largestArmy && (
          <span className={styles.award} data-testid={`award-la-${pn}`}>
            Largest Army
          </span>
        )}
        {metropolisTracks.map((track) => (
          <span
            key={track}
            className={styles.award}
            data-testid={`ck-player-metropolis-${pn}-${track}`}
          >
            {CK_TRACK_NAMES[track]} Metropolis
          </span>
        ))}
      </div>

      {ckEnabled && view.seated && <CKPlayerSummary view={view} />}
    </li>
  );
}

/** The local player's hand as a row of resource "cards" in the action bar. */
function MyResources({ view }: { view: PlayerView }): JSX.Element {
  return (
    <div className={styles.myResources} data-testid="my-resources">
      {RESOURCE_ROWS.map(({ key, label }) => (
        <span
          key={key}
          className={`${styles.resCard} ${view.resources[key] === 0 ? styles.resCardEmpty : ''}`}
          data-testid={`my-res-${key}`}
          data-resource={key}
          title={label}
          aria-label={`${label}: ${view.resources[key]}`}
        >
          <span className={styles.resIcon} aria-hidden="true">
            {RESOURCE_ICONS[key]}
          </span>
          <span className={styles.resValue}>{view.resources[key]}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * A scrolling game log; auto-scrolls to the newest line. Player chat lines
 * (kind 'chat') are rendered with the speaker's nickname and a distinct style;
 * server/announcement lines render as plain text.
 */
function GameLog({ lines }: { lines: readonly GameLogEntry[] }): JSX.Element {
  const logRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // Scroll only the log container itself (scrollIntoView would also scroll
    // every scrollable ancestor, yanking the whole sidebar to the bottom).
    const log = logRef.current;
    if (log != null) {
      log.scrollTop = log.scrollHeight;
    }
  }, [lines.length]);
  return (
    <div ref={logRef} className={styles.log} data-testid="game-log" role="log" aria-live="polite">
      {lines.length === 0 ? (
        <p className={styles.logEmpty}>No game messages yet.</p>
      ) : (
        lines.map((line, i) => (
          <p
            key={i}
            className={`${styles.logLine} ${line.kind === 'chat' ? styles.logChat : ''}`}
            data-kind={line.kind}
          >
            {line.kind === 'chat' && line.nickname != null && (
              <span className={styles.logNick}>{line.nickname}: </span>
            )}
            {line.text}
          </p>
        ))
      )}
    </div>
  );
}

/**
 * Chat input row under the game log: a text field + Send button. Enter sends
 * (and is swallowed so it can't trigger board/global shortcuts or submit other
 * forms); empty/whitespace-only messages are never sent.
 */
function ChatInput(): JSX.Element {
  const [text, setText] = useState('');

  const submit = (): void => {
    if (text.trim() === '') {
      return; // <--- Early return: nothing to send ---
    }
    sendChat(text);
    setText('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    // Keep key events inside the chat field so they never reach board/global
    // shortcut handlers while typing.
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className={styles.chatRow}>
      <input
        className={styles.chatInput}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Send a message…"
        aria-label="Chat message"
        data-testid="chat-input"
        autoComplete="off"
        spellCheck={false}
      />
      <Button
        size="sm"
        variant="secondary"
        data-testid="chat-send"
        disabled={text.trim() === ''}
        onClick={submit}
      >
        Send
      </Button>
    </div>
  );
}

/** Compute the name to show for the current player in the turn banner. */
function currentPlayerName(cg: CurrentGame): string {
  const pn = cg.currentPlayerNumber;
  if (pn < 0 || pn >= cg.playerViews.length) {
    return '—';
  }
  const v = cg.playerViews[pn];
  return v.seated ? v.name : `Seat ${pn + 1}`;
}

/**
 * The live in-game view: SVG board, per-seat player panels, a turn/state
 * banner, the dice display, the local hand breakdown, and a scrolling log.
 *
 * Display-only for now: the board is rendered with {@code interactive={false}}
 * and no build/roll controls are wired. Interaction hooks (legal node/edge
 * highlights, click handlers, roll/end-turn buttons) are deliberately left for
 * the next phase; the data they need (potentialNodes, mySeat, currentPlayer)
 * is already in the store.
 */
/**
 * Observe in-game state changes and emit feedback for them (Phase 6 polish):
 *
 *  - a `roll` sound + an incrementing roll-sequence number (drives the dice
 *    tumble animation) whenever a fresh dice total appears;
 *  - a `build` sound whenever a new piece is added to the board (placement);
 *  - a `turn` sound when it becomes the local player's turn.
 *
 * All sounds are gated inside {@link playSound} by the global sound setting, so
 * this only decides *when* to play. Returns the current roll sequence so the
 * dice display can replay its animation on each new roll. Safe to call with a
 * null game (no-ops, returns 0).
 */
function useGameFeedback(cg: CurrentGame | null): number {
  const [rollSeq, setRollSeq] = useState(0);
  const prevDiceTotal = useRef<number | null>(null);
  const prevPieceCount = useRef<number>(0);
  const prevMyTurn = useRef<boolean>(false);
  const prevGameName = useRef<string | null>(null);

  const diceTotal = cg?.lastDice?.total ?? null;
  const pieceCount = cg?.pieces.length ?? 0;
  const myTurn = cg != null && cg.mySeat >= 0 && cg.mySeat === cg.currentPlayerNumber;
  const gameName = cg?.gameName ?? null;

  useEffect(() => {
    // Reset baselines when switching games so we don't fire on initial sync.
    if (gameName !== prevGameName.current) {
      prevGameName.current = gameName;
      prevDiceTotal.current = diceTotal;
      prevPieceCount.current = pieceCount;
      prevMyTurn.current = myTurn;
      return; // <--- Early return: new game baseline established ---
    }

    // Dice roll: a non-null total that differs from the previous one.
    if (diceTotal !== null && diceTotal !== prevDiceTotal.current) {
      playSound('roll');
      setRollSeq((n) => n + 1);
    }
    prevDiceTotal.current = diceTotal;

    // Piece placement: the board piece count grew.
    if (pieceCount > prevPieceCount.current) {
      playSound('build');
    }
    prevPieceCount.current = pieceCount;

    // Your turn: transition from not-my-turn to my-turn.
    if (myTurn && !prevMyTurn.current) {
      playSound('turn');
    }
    prevMyTurn.current = myTurn;
  }, [gameName, diceTotal, pieceCount, myTurn]);

  return rollSeq;
}

export function GameScreen(): JSX.Element | null {
  const cg = useGameStore((s) => s.currentGame);
  const error = useGameStore((s) => s.error);
  const setError = useGameStore((s) => s.setError);
  const notice = useGameStore((s) => s.notice);
  const setNotice = useGameStore((s) => s.setNotice);
  const { showToast } = useToast();

  // Leaving a game in progress is destructive (the seat is abandoned), so the
  // header Leave button asks for confirmation first.
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    if (error != null && error !== '') {
      showToast(error, { variant: 'danger' });
      setError(undefined);
    }
  }, [error, showToast, setError]);

  // Non-error notices (e.g. C&K Defender of Catan) toast as successes.
  useEffect(() => {
    if (notice != null && notice !== '') {
      showToast(notice, { variant: 'success' });
      setNotice(undefined);
    }
  }, [notice, showToast, setNotice]);

  // Sound + dice-roll feedback derived from observed state changes. Must be
  // called before any early return to obey the Rules of Hooks; it tolerates a
  // null game internally.
  const rollSeq = useGameFeedback(cg);

  // Rail controls (settings / sound / theme), since the app header is hidden
  // while a game is in progress (immersive mode).
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const setSoundEnabled = useSettingsStore((s) => s.setSoundEnabled);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  if (cg === null) {
    return null; // <--- Early return: no joined game ---
  }

  const myView = cg.mySeat >= 0 ? cg.playerViews[cg.mySeat] : null;
  const isMyTurn = cg.mySeat >= 0 && cg.mySeat === cg.currentPlayerNumber;
  const hl = computeHighlights(cg);
  const interactive =
    isMyTurn &&
    (hl.nodes.length > 0 || hl.edges.length > 0 || hl.onHexClick !== undefined);

  const currentColor =
    cg.currentPlayerNumber >= 0 && cg.currentPlayerNumber < cg.playerViews.length
      ? cg.playerViews[cg.currentPlayerNumber].color
      : 'transparent';

  return (
    <div className={styles.wrap} data-testid="game-started">
      {/* Slim icon rail (replaces the app header while in-game) */}
      <nav className={styles.rail} aria-label="Game menu">
        <span className={styles.railMark} aria-hidden="true" title={cg.gameName}>
          ⬢
        </span>
        <button
          type="button"
          className={styles.railBtn}
          title="Settings"
          aria-label="Settings"
          onClick={() => setSettingsOpen(true)}
        >
          ⚙
        </button>
        <button
          type="button"
          className={styles.railBtn}
          title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
          aria-label={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
          aria-pressed={soundEnabled}
          onClick={() => setSoundEnabled(!soundEnabled)}
        >
          {soundEnabled ? '🔊' : '🔇'}
        </button>
        <button
          type="button"
          className={styles.railBtn}
          title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          onClick={toggleTheme}
        >
          {isDark ? '☀' : '☾'}
        </button>
        <span className={styles.railSpacer} />
        <button
          type="button"
          className={`${styles.railBtn} ${styles.railLeave}`}
          title="Leave game"
          aria-label="Leave game"
          onClick={() => setConfirmLeave(true)}
          data-testid="leave-game"
        >
          🚪
        </button>
      </nav>

      {/* Center stage: floating turn pill over the board, action bar below */}
      <div className={styles.stage}>
        <div className={styles.stageTop}>
          <span className={styles.gameName} data-testid="game-name">
            {cg.gameName}
          </span>
          <div
            className={`${styles.turnBanner} ${isMyTurn ? styles.turnMine : ''}`}
            data-testid="turn-banner"
            data-current-player={cg.currentPlayerNumber}
          >
            <span
              className={styles.turnDot}
              style={{ backgroundColor: currentColor }}
              aria-hidden="true"
            />
            <span className={styles.turnPlayer}>{currentPlayerName(cg)}</span>
            <span className={styles.turnState}>{gameStateLabel(cg.gameState)}</span>
          </div>
        </div>

        <div className={styles.boardWrap} data-testid="board-wrap">
          {cg.board !== null ? (
            <BoardSVG
              board={cg.board}
              pieces={cg.pieces}
              playerColors={[...PLAYER_COLORS]}
              interactive={interactive}
              highlightNodes={hl.nodes}
              highlightEdges={hl.edges}
              onNodeClick={hl.onNodeClick}
              onEdgeClick={hl.onEdgeClick}
              onHexClick={hl.onHexClick}
            />
          ) : (
            <p className={styles.boardLoading} data-testid="board-loading">
              Loading board…
            </p>
          )}
        </div>

        <div className={styles.actionBar}>
          {myView !== null && <MyResources view={myView} />}
          {myView !== null && <span className={styles.actionDivider} aria-hidden="true" />}
          <div className={styles.actionMain}>
            <GameControls cg={cg} myView={myView} isMyTurn={isMyTurn} />
          </div>
          <DiceDisplay
            d1={cg.lastDice?.d1 ?? 0}
            d2={cg.lastDice?.d2 ?? 0}
            total={cg.lastDice?.total ?? null}
            rollSeq={rollSeq}
          />
        </div>
      </div>

      {/* Right sidebar: players, expansion panels, trade, dev cards, log */}
      <aside className={styles.sidebar}>
        <div className={styles.sideScroll}>
        <Panel title="Players" flushBody className={styles.sidePanel}>
          <ul className={styles.players} data-testid="player-panels">
            {cg.playerViews.map((view) => (
              <PlayerPanel
                key={view.playerNumber}
                view={view}
                isCurrent={view.playerNumber === cg.currentPlayerNumber}
                isMe={view.playerNumber === cg.mySeat}
                ckEnabled={cg.isCKGame}
                metropolisTracks={
                  cg.isCKGame
                    ? cg.ckMetropolisOwners
                        .map((owner, track) => (owner === view.playerNumber ? track : -1))
                        .filter((t) => t >= 0)
                    : []
                }
              />
            ))}
          </ul>
        </Panel>

        {cg.isCKGame && (
          <Panel title="Cities & Knights" className={styles.sidePanel}>
            <CKPanel cg={cg} myView={myView} isMyTurn={isMyTurn} />
          </Panel>
        )}

        {myView !== null && (
          <Panel title="Trade" className={styles.sidePanel}>
            <TradePanel cg={cg} myView={myView} isMyTurn={isMyTurn} />
          </Panel>
        )}

        {myView !== null && (
          <Panel title="Development cards" className={styles.sidePanel}>
            <DevCardPanel cg={cg} myView={myView} isMyTurn={isMyTurn} />
          </Panel>
        )}
        </div>

        <Panel title="Game log" flushBody className={`${styles.sidePanel} ${styles.logPanel}`}>
          <GameLog lines={cg.gameLog} />
          <ChatInput />
        </Panel>
      </aside>

      {/* Leave-game confirmation */}
      {confirmLeave && (
        <Dialog
          open
          onClose={() => setConfirmLeave(false)}
          title="Leave game?"
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => setConfirmLeave(false)}
                data-testid="leave-cancel"
              >
                Keep playing
              </Button>
              <Button variant="danger" onClick={leaveGame} data-testid="leave-confirm">
                Leave game
              </Button>
            </>
          }
        >
          <p className={styles.prompt} data-testid="leave-confirm-dialog">
            This game is still in progress. If you leave, you give up your seat.
          </p>
        </Dialog>
      )}

      {/* Modal prompts driven by game state */}
      {myView !== null && (
        <InteractionDialogs cg={cg} myView={myView} isMyTurn={isMyTurn} />
      )}

      {/* C&K: transient barbarian-attack banner */}
      {cg.isCKGame && cg.lastBarbarianAttack !== null && (
        <CKBarbarianBanner attack={cg.lastBarbarianAttack} />
      )}

      {/* Game-over overlay */}
      {cg.gameState === GameState.OVER && <GameOverOverlay cg={cg} />}
    </div>
  );
}

/**
 * Turn-aware action controls: roll dice, build (road/settlement/city), place,
 * cancel, end turn. Buttons appear only when it's the local player's turn and
 * the current game state allows that action; a prompt describes what to do.
 */
function GameControls({
  cg,
  myView,
  isMyTurn,
}: {
  cg: CurrentGame;
  myView: PlayerView | null;
  isMyTurn: boolean;
}): JSX.Element {
  const st = cg.gameState;

  if (cg.mySeat < 0) {
    return (
      <p className={styles.prompt} data-testid="controls-prompt">
        You are observing this game.
      </p>
    );
  }
  if (!isMyTurn) {
    return (
      <p className={styles.prompt} data-testid="controls-prompt">
        Waiting for {currentPlayerName(cg)}…
      </p>
    );
  }

  // It's my turn — branch on game state.
  if (st === GameState.ROLL_OR_CARD) {
    return (
      <div className={styles.controls} data-testid="game-controls">
        <p className={styles.prompt} data-testid="controls-prompt">
          Your turn — roll the dice.
        </p>
        <div className={styles.controlButtons}>
          <Button variant="primary" size="lg" onClick={rollDice} data-testid="roll-dice">
            🎲 Roll dice
          </Button>
        </div>
      </div>
    );
  }

  if (isInitialPlacementState(st)) {
    const placingRoad =
      st === GameState.START1B || st === GameState.START2B || st === GameState.START3B;
    return (
      <div className={styles.controls} data-testid="game-controls">
        <p className={styles.prompt} data-testid="controls-prompt">
          {placingRoad
            ? 'Click a highlighted edge to place your road.'
            : 'Click a highlighted spot to place your settlement.'}
        </p>
      </div>
    );
  }

  if (st === GameState.PLAY1) {
    const can = myView !== null;
    return (
      <div className={styles.controls} data-testid="game-controls">
        <p className={styles.prompt} data-testid="controls-prompt">
          Build, then end your turn.
        </p>
        <div className={styles.controlButtons}>
          <button
            type="button"
            className={styles.buildBtn}
            data-testid="build-road"
            title="Build a road — 1 clay, 1 wood"
            disabled={!can || myView.roads <= 0 || !canAfford(myView, COSTS.road)}
            onClick={() => buildRequest(PieceTypeConst.ROAD)}
          >
            <span className={styles.buildIcon} aria-hidden="true">🛣️</span>
            <span className={styles.buildLabel}>Road</span>
          </button>
          <button
            type="button"
            className={styles.buildBtn}
            data-testid="build-settlement"
            title="Build a settlement — 1 clay, 1 wood, 1 sheep, 1 wheat"
            disabled={!can || myView.settlements <= 0 || !canAfford(myView, COSTS.settlement)}
            onClick={() => buildRequest(PieceTypeConst.SETTLEMENT)}
          >
            <span className={styles.buildIcon} aria-hidden="true">🏠</span>
            <span className={styles.buildLabel}>Settle</span>
          </button>
          <button
            type="button"
            className={styles.buildBtn}
            data-testid="build-city"
            title="Build a city — 3 ore, 2 wheat"
            disabled={!can || myView.cities <= 0 || !canAfford(myView, COSTS.city)}
            onClick={() => buildRequest(PieceTypeConst.CITY)}
          >
            <span className={styles.buildIcon} aria-hidden="true">🏰</span>
            <span className={styles.buildLabel}>City</span>
          </button>
          <Button variant="primary" size="lg" onClick={endTurn} data-testid="end-turn">
            End turn
          </Button>
        </div>
      </div>
    );
  }

  // A PLACING_* state reached via a build request: prompt + cancel.
  if (
    st === GameState.PLACING_ROAD ||
    st === GameState.PLACING_SETTLEMENT ||
    st === GameState.PLACING_CITY ||
    st === GameState.PLACING_SHIP
  ) {
    const pieceType =
      st === GameState.PLACING_ROAD
        ? PieceTypeConst.ROAD
        : st === GameState.PLACING_SETTLEMENT
          ? PieceTypeConst.SETTLEMENT
          : st === GameState.PLACING_CITY
            ? PieceTypeConst.CITY
            : PieceTypeConst.SHIP;
    return (
      <div className={styles.controls} data-testid="game-controls">
        <p className={styles.prompt} data-testid="controls-prompt">
          Click a highlighted spot to place.
        </p>
        <div className={styles.controlButtons}>
          <Button
            size="sm"
            variant="ghost"
            data-testid="cancel-build"
            onClick={() => cancelBuild(pieceType)}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.controls} data-testid="game-controls">
      <p className={styles.prompt} data-testid="controls-prompt">
        {gameStateLabel(st)}
      </p>
      <div className={styles.controlButtons}>
        <Button variant="ghost" size="sm" onClick={endTurn} data-testid="end-turn">
          End turn
        </Button>
      </div>
    </div>
  );
}

/**
 * Two dice faces + total, or a placeholder before the first roll. On each new
 * roll the whole face group remounts (keyed by `rollSeq`) and replays a short
 * tumble animation; the keyframes (`jsboard-dice-roll` / `jsboard-die-tumble`)
 * and their reduced-motion / low-quality gating live in theme/tokens.css. The
 * `--dice-roll-spin` token supplies the duration so low-quality mode zeroes it.
 */
function DiceDisplay({
  d1,
  d2,
  total,
  rollSeq = 0,
}: {
  d1: number;
  d2: number;
  total: number | null;
  rollSeq?: number;
}): JSX.Element {
  const spin = 'var(--dice-roll-spin, 520ms cubic-bezier(0.2, 0.8, 0.3, 1))';
  return (
    <div className={styles.dice} data-testid="dice-display" data-total={total ?? ''} data-roll-seq={rollSeq}>
      {total === null ? (
        <span className={styles.diceEmpty}>—</span>
      ) : (
        <span
          // Remount on each roll so the animation replays.
          key={rollSeq}
          className="jsboard-dice-animated"
          style={{
            display: 'inline-flex',
            gap: 'var(--space-2, 0.5rem)',
            alignItems: 'center',
            animation: `jsboard-dice-roll ${spin} both`,
          }}
        >
          {d1 > 0 && (
            <span
              className={`${styles.die} jsboard-die-animated`}
              style={{ animation: `jsboard-die-tumble ${spin} both`, display: 'inline-flex' }}
            >
              {d1}
            </span>
          )}
          {d2 > 0 && (
            <span
              className={`${styles.die} jsboard-die-animated`}
              style={{ animation: `jsboard-die-tumble ${spin} both`, animationDelay: '60ms', display: 'inline-flex' }}
            >
              {d2}
            </span>
          )}
          <span className={styles.diceTotal} data-testid="dice-total">
            {total}
          </span>
        </span>
      )}
    </div>
  );
}

/** Format a {@link ResourceTally} like "1 ore, 2 wood" / "nothing". */
function describeTally(t: ResourceTally): string {
  const parts: string[] = [];
  for (const r of RESOURCE_PICK) {
    const n = t[r.type] ?? 0;
    if (n > 0) {
      parts.push(`${n} ${r.label.toLowerCase()}`);
    }
  }
  return parts.length > 0 ? parts.join(', ') : 'nothing';
}

/** Seat label for the trade UI (name when seated, else "Seat N"). */
function seatName(cg: CurrentGame, pn: number): string {
  const v = cg.playerViews[pn];
  return v != null && v.seated && v.name !== '' ? v.name : `Seat ${pn + 1}`;
}

/**
 * The trade panel: bank/port trade (give a resource at some ratio for another),
 * propose a player trade (give/get one resource each), and a list of incoming
 * offers with Accept/Reject buttons.
 */
function TradePanel({
  cg,
  myView,
  isMyTurn,
}: {
  cg: CurrentGame;
  myView: PlayerView;
  isMyTurn: boolean;
}): JSX.Element {
  const [bankGive, setBankGive] = useState<ResourceValue>(Resource.CLAY);
  const [bankGet, setBankGet] = useState<ResourceValue>(Resource.ORE);
  const [bankRatio, setBankRatio] = useState<number>(4);
  const [offerGive, setOfferGive] = useState<ResourceValue>(Resource.CLAY);
  const [offerGet, setOfferGet] = useState<ResourceValue>(Resource.ORE);

  // Trades are only allowed during the current player's PLAY1 phase.
  const canTrade = isMyTurn && cg.gameState === GameState.PLAY1;

  // Only offers addressed to the local player are actionable; bot-to-bot
  // offers (to[mySeat] false) resolve on their own and shouldn't show buttons.
  const incoming = cg.offers
    .map((offer, pn) => ({ offer, pn }))
    .filter(
      (o) =>
        o.offer !== null &&
        o.pn !== cg.mySeat &&
        (o.offer.to[cg.mySeat] ?? false),
    );

  return (
    <div className={styles.section} data-testid="trade-panel">
      {/* Bank / port trade */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Bank / port trade</p>
        <div className={styles.tradeRow}>
          <select
            className={styles.select}
            data-testid="bank-trade-give"
            aria-label="Give resource"
            value={bankGive}
            onChange={(e) => setBankGive(Number(e.target.value) as ResourceValue)}
          >
            {RESOURCE_PICK.map((r) => (
              <option key={r.type} value={r.type}>
                {r.label}
              </option>
            ))}
          </select>
          <select
            className={styles.select}
            data-testid="bank-trade-ratio"
            aria-label="Trade ratio"
            value={bankRatio}
            onChange={(e) => setBankRatio(Number(e.target.value))}
          >
            <option value={4}>×4 (4:1)</option>
            <option value={3}>×3 (3:1 port)</option>
            <option value={2}>×2 (2:1 port)</option>
          </select>
          <span className={styles.tradeArrow} aria-hidden="true">
            →
          </span>
          <select
            className={styles.select}
            data-testid="bank-trade-get"
            aria-label="Get resource"
            value={bankGet}
            onChange={(e) => setBankGet(Number(e.target.value) as ResourceValue)}
          >
            {RESOURCE_PICK.map((r) => (
              <option key={r.type} value={r.type}>
                {r.label}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="secondary"
            data-testid="bank-trade-submit"
            disabled={
              !canTrade ||
              bankGive === bankGet ||
              (myView.resources[RESOURCE_PICK.find((r) => r.type === bankGive)!.key as keyof PlayerView['resources']] ?? 0) < bankRatio
            }
            onClick={() => bankTrade({ [bankGive]: bankRatio }, { [bankGet]: 1 })}
          >
            Trade
          </Button>
        </div>
      </div>

      {/* Propose a player trade */}
      <div className={styles.section}>
        <p className={styles.sectionTitle}>Propose a trade</p>
        <div className={styles.tradeRow}>
          <span className={styles.pickerLabel}>Give</span>
          <select
            className={styles.select}
            data-testid="offer-give"
            aria-label="Offer give resource"
            value={offerGive}
            onChange={(e) => setOfferGive(Number(e.target.value) as ResourceValue)}
          >
            {RESOURCE_PICK.map((r) => (
              <option key={r.type} value={r.type}>
                {r.label}
              </option>
            ))}
          </select>
          <span className={styles.tradeArrow} aria-hidden="true">
            ↔
          </span>
          <span className={styles.pickerLabel}>Get</span>
          <select
            className={styles.select}
            data-testid="offer-get"
            aria-label="Offer get resource"
            value={offerGet}
            onChange={(e) => setOfferGet(Number(e.target.value) as ResourceValue)}
          >
            {RESOURCE_PICK.map((r) => (
              <option key={r.type} value={r.type}>
                {r.label}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="secondary"
            data-testid="offer-propose"
            disabled={!canTrade || offerGive === offerGet}
            onClick={() => {
              // Offer to all other seats.
              const to = cg.playerViews.map((_, pn) => pn !== cg.mySeat);
              makeOffer({ [offerGive]: 1 }, { [offerGet]: 1 }, to);
            }}
          >
            Offer
          </Button>
        </div>
        {cg.offers[cg.mySeat] != null && (
          <div className={styles.tradeRow}>
            <span className={styles.pickerLabel} data-testid="my-offer">
              Offering {describeTally(offerToTally(cg.offers[cg.mySeat]!.give))} for{' '}
              {describeTally(offerToTally(cg.offers[cg.mySeat]!.get))}
            </span>
            <Button
              size="sm"
              variant="ghost"
              data-testid="offer-cancel"
              onClick={clearOffer}
            >
              Cancel offer
            </Button>
          </div>
        )}
      </div>

      {/* Incoming offers */}
      {incoming.length > 0 && (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Incoming offers</p>
          <div className={styles.offers}>
            {incoming.map(({ offer, pn }) => (
              <IncomingOffer
                key={pn}
                cg={cg}
                pn={pn}
                give={offerToTally(offer!.give)}
                get={offerToTally(offer!.get)}
                rejected={cg.offerResponses[cg.mySeat] === 'reject'}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Convert a protocol ResourceSet to a {@link ResourceTally} for display. */
function offerToTally(rs: {
  clay: number;
  ore: number;
  sheep: number;
  wheat: number;
  wood: number;
}): ResourceTally {
  return {
    [Resource.CLAY]: rs.clay,
    [Resource.ORE]: rs.ore,
    [Resource.SHEEP]: rs.sheep,
    [Resource.WHEAT]: rs.wheat,
    [Resource.WOOD]: rs.wood,
  };
}

/** One incoming offer card with Accept / Reject buttons. */
function IncomingOffer({
  cg,
  pn,
  give,
  get,
  rejected,
}: {
  cg: CurrentGame;
  pn: number;
  give: ResourceTally;
  get: ResourceTally;
  rejected: boolean;
}): JSX.Element {
  const color = cg.playerViews[pn]?.color ?? '#999';
  return (
    <div
      className={styles.offer}
      data-testid={`offer-${pn}`}
      style={{ ['--offer-swatch' as string]: color }}
    >
      <div className={styles.offerHead}>
        <span
          className={styles.swatch}
          style={{ backgroundColor: color }}
          aria-hidden="true"
        />
        <strong>{seatName(cg, pn)}</strong> offers you a trade
      </div>
      <div className={styles.offerTerms}>
        They give <strong>{describeTally(give)}</strong>, want{' '}
        <strong>{describeTally(get)}</strong>.
      </div>
      <div className={styles.offerActions}>
        <Button
          size="sm"
          variant="primary"
          data-testid={`accept-offer-${pn}`}
          onClick={() => acceptOffer(pn)}
        >
          Accept
        </Button>
        <Button
          size="sm"
          variant="ghost"
          data-testid={`reject-offer-${pn}`}
          onClick={rejectOffer}
        >
          Reject
        </Button>
      </div>
      {rejected && <span className={styles.offerRejected}>You rejected an offer.</span>}
    </div>
  );
}

/** Dev-card cost: 1 ore + 1 sheep + 1 wheat. */
const DEV_CARD_COST = { ore: 1, sheep: 1, wheat: 1 } as const;

/** A playable dev card type and its remaining count in the inventory. */
interface PlayableCard {
  cardType: DevCardTypeValue;
  count: number;
  newCount: number;
}

/** Collect the local player's known playable dev cards (Knight/Roads/Disc/Mono). */
function playableCards(inv: DevCardInventory): PlayableCard[] {
  const types: DevCardTypeValue[] = [
    DevCardType.KNIGHT,
    DevCardType.ROADS,
    DevCardType.DISC,
    DevCardType.MONO,
  ];
  const out: PlayableCard[] = [];
  for (const t of types) {
    const count = inv.playable[t] ?? 0;
    const newCount = inv.newCards[t] ?? 0;
    if (count > 0 || newCount > 0) {
      out.push({ cardType: t, count, newCount });
    }
  }
  return out;
}

/** data-testid suffix for each playable card type's Play button. */
const PLAY_TESTID: Record<number, string> = {
  [DevCardType.KNIGHT]: 'play-knight',
  [DevCardType.ROADS]: 'play-roadbuilding',
  [DevCardType.MONO]: 'play-monopoly',
  [DevCardType.DISC]: 'play-yop',
};

/** Send the right play request for a card type. */
function playCard(cardType: number): void {
  switch (cardType) {
    case DevCardType.KNIGHT:
      playKnight();
      break;
    case DevCardType.ROADS:
      playRoadBuilding();
      break;
    case DevCardType.MONO:
      playMonopoly();
      break;
    case DevCardType.DISC:
      playYearOfPlenty();
      break;
    default:
      break;
  }
}

/**
 * The development-card panel: a Buy button (enabled in PLAY1 when affordable +
 * cards remain) and the local player's inventory with Play buttons. VP cards
 * are listed but have no Play action.
 */
function DevCardPanel({
  cg,
  myView,
  isMyTurn,
}: {
  cg: CurrentGame;
  myView: PlayerView;
  isMyTurn: boolean;
}): JSX.Element {
  const inv = cg.myInventory;
  const playable = playableCards(inv);
  const vpEntries = Object.entries(inv.vpCards).filter(([, n]) => n > 0);

  // Can buy: my turn, in PLAY1, cards remain in the deck, and affordable.
  const canBuy =
    isMyTurn &&
    cg.gameState === GameState.PLAY1 &&
    cg.deckDevCardCount > 0 &&
    canAfford(myView, DEV_CARD_COST);

  // Can play a card: my turn, either ROLL_OR_CARD (before roll) or PLAY1, and I
  // haven't already played a dev card this turn (server allows at most one).
  const canPlay =
    isMyTurn &&
    !myView.playedDevCard &&
    (cg.gameState === GameState.PLAY1 || cg.gameState === GameState.ROLL_OR_CARD);

  return (
    <div className={styles.section} data-testid="devcard-panel">
      <div className={styles.tradeRow}>
        <Button
          size="sm"
          variant="secondary"
          data-testid="buy-devcard"
          disabled={!canBuy}
          onClick={buyDevCard}
        >
          Buy dev card
        </Button>
        <span className={styles.pickerLabel} data-testid="devcard-deck-count">
          {cg.deckDevCardCount} left in deck
        </span>
      </div>

      {inventorySize(inv) === 0 ? (
        <p className={styles.devCardEmpty}>No development cards yet.</p>
      ) : (
        <div className={styles.devCards}>
          {playable.map(({ cardType, count, newCount }) => (
            <div
              key={cardType}
              className={styles.devCardRow}
              data-testid={`devcard-${cardType}`}
            >
              <span className={styles.devCardName}>
                {DEV_CARD_NAMES[cardType] ?? `Card ${cardType}`}
                {count + newCount > 1 ? ` ×${count + newCount}` : ''}
                {count === 0 && newCount > 0 && (
                  <span className={styles.devCardNew}> (new — next turn)</span>
                )}
              </span>
              <Button
                size="sm"
                variant="secondary"
                data-testid={PLAY_TESTID[cardType]}
                disabled={!canPlay || count <= 0}
                onClick={() => playCard(cardType)}
              >
                Play
              </Button>
            </div>
          ))}
          {vpEntries.map(([ct, n]) => (
            <div
              key={`vp-${ct}`}
              className={styles.devCardRow}
              data-testid={`devcard-vp-${ct}`}
            >
              <span className={styles.devCardName}>
                {DEV_CARD_NAMES[Number(ct)] ?? `VP card ${ct}`}
                {n > 1 ? ` ×${n}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A +/- stepper grid over the five resources, used by the YOP / gold-pick and
 * discard dialogs. The caller controls the tally + per-resource maximums.
 */
function ResourceStepperGrid({
  tally,
  onChange,
  maxOf,
}: {
  tally: ResourceTally;
  onChange: (next: ResourceTally) => void;
  /** Max selectable for a resource (e.g. the hand count for discards). */
  maxOf: (type: ResourceValue) => number;
}): JSX.Element {
  const bump = (type: ResourceValue, delta: number): void => {
    const cur = tally[type] ?? 0;
    const next = Math.max(0, Math.min(maxOf(type), cur + delta));
    onChange({ ...tally, [type]: next });
  };
  return (
    <div className={styles.pickerGrid}>
      {RESOURCE_PICK.map((r) => (
        <div key={r.type} className={styles.pickerCell} data-resource={r.key}>
          <span className={styles.pickerIcon} aria-hidden="true">
            {RESOURCE_ICONS[r.key]}
          </span>
          <span className={styles.pickerLabel}>{r.label}</span>
          <div className={styles.stepper}>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Remove ${r.label}`}
              data-testid={`pick-${r.key}-minus`}
              disabled={(tally[r.type] ?? 0) <= 0}
              onClick={() => bump(r.type, -1)}
            >
              −
            </Button>
            <span className={styles.stepperValue} data-testid={`pick-${r.key}-value`}>
              {tally[r.type] ?? 0}
            </span>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Add ${r.label}`}
              data-testid={`pick-${r.key}-plus`}
              disabled={(tally[r.type] ?? 0) >= maxOf(r.type)}
              onClick={() => bump(r.type, 1)}
            >
              +
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * All state-driven modal prompts for the local player:
 *  - Monopoly resource picker (WAITING_FOR_MONOPOLY)
 *  - Year-of-Plenty / gold-hex resource picker (WAITING_FOR_DISCOVERY /
 *    WAITING_FOR_PICK_GOLD_RESOURCE)
 *  - Discard dialog (WAITING_FOR_DISCARDS when this player must discard)
 *  - Victim chooser (after CHOOSEPLAYERREQUEST sets robVictims)
 *
 * Each renders only when its triggering condition holds. The Monopoly/YOP
 * pickers fire only on the current player's turn; discard can apply to any
 * player; the victim chooser applies to whoever moved the robber.
 */
function InteractionDialogs({
  cg,
  myView,
  isMyTurn,
}: {
  cg: CurrentGame;
  myView: PlayerView;
  isMyTurn: boolean;
}): JSX.Element {
  return (
    <>
      {isMyTurn &&
        cg.gameState === GameState.WAITING_FOR_MONOPOLY &&
        // C&K Trade Monopoly (itype 12) picks a commodity; the dev-card
        // Monopoly and C&K Resource Monopoly (itype 11) pick a resource.
        (cg.ckPendingMonopoly === CKProgressCard.TRADE_MONOPOLY ? (
          <CKCommodityPickDialog />
        ) : (
          <MonopolyDialog />
        ))}
      {isMyTurn && cg.gameState === GameState.WAITING_FOR_ROBBER_OR_PIRATE && (
        <RobberOrPirateDialog />
      )}
      {isMyTurn &&
        (cg.gameState === GameState.WAITING_FOR_DISCOVERY ||
          cg.gameState === GameState.WAITING_FOR_PICK_GOLD_RESOURCE) && (
          <PickResourcesDialog
            gold={cg.gameState === GameState.WAITING_FOR_PICK_GOLD_RESOURCE}
            count={
              cg.gameState === GameState.WAITING_FOR_DISCOVERY
                ? 2
                : myView.numPickGoldRes > 0
                  ? myView.numPickGoldRes
                  : 1
            }
          />
        )}
      {cg.gameState === GameState.WAITING_FOR_DISCARDS && cg.discardRequired > 0 && (
        <DiscardDialog count={cg.discardRequired} myView={myView} />
      )}
      {cg.robVictims !== null && cg.robVictims.length > 0 && (
        <VictimChooser cg={cg} victims={cg.robVictims} canChooseNone={cg.robCanChooseNone} />
      )}
    </>
  );
}

/**
 * Sea-board prompt (WAITING_FOR_ROBBER_OR_PIRATE): choose whether to move the
 * robber or the pirate ship. Sends SOCChoosePlayer with the CHOICE_MOVE_ROBBER
 * / CHOICE_MOVE_PIRATE special; the server then advances to PLACING_ROBBER or
 * PLACING_PIRATE, which the board handles via hex clicks.
 */
function RobberOrPirateDialog(): JSX.Element {
  return (
    <Dialog
      open
      onClose={() => undefined}
      hideCloseButton
      closeOnOverlayClick={false}
      title="Move the robber or the pirate?"
    >
      <div className={styles.victims} data-testid="robber-or-pirate-dialog">
        <Button
          variant="secondary"
          data-testid="choose-robber"
          onClick={() => choosePlayer(ChoosePlayerChoice.CHOICE_MOVE_ROBBER)}
        >
          Move the robber
        </Button>
        <Button
          variant="secondary"
          data-testid="choose-pirate"
          onClick={() => choosePlayer(ChoosePlayerChoice.CHOICE_MOVE_PIRATE)}
        >
          Move the pirate
        </Button>
      </div>
    </Dialog>
  );
}

/** Monopoly: choose one resource type for the whole table to surrender. */
function MonopolyDialog(): JSX.Element {
  return (
    <Dialog
      open
      onClose={() => undefined}
      hideCloseButton
      closeOnOverlayClick={false}
      title="Monopoly — choose a resource"
    >
      <div className={styles.picker} data-testid="monopoly-dialog">
        <p className={styles.pickerSummary}>
          Every other player gives you all of one resource type.
        </p>
        <div className={styles.monopolyButtons}>
          {RESOURCE_PICK.map((r) => (
            <Button
              key={r.type}
              variant="secondary"
              data-testid={`monopoly-${r.key}`}
              onClick={() => pickMonopoly(r.type)}
            >
              {RESOURCE_ICONS[r.key]} {r.label}
            </Button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

/**
 * Year-of-Plenty / gold-hex resource picker: choose exactly `count` resources
 * from the bank, then confirm. For YOP `count` is 2; for a gold-hex pick it's
 * the number granted.
 */
function PickResourcesDialog({ gold, count }: { gold: boolean; count: number }): JSX.Element {
  const [tally, setTally] = useState<ResourceTally>({});
  const picked = tallyTotal(tally);
  const title = gold ? 'Gold hex — pick free resources' : 'Year of Plenty — pick 2 resources';
  return (
    <Dialog open onClose={() => undefined} hideCloseButton closeOnOverlayClick={false} title={title}>
      <div className={styles.picker} data-testid="pick-resources-dialog">
        <ResourceStepperGrid
          tally={tally}
          onChange={setTally}
          // Cap each at `count` so the total can't exceed the requirement.
          maxOf={(type) => Math.max(0, count - (picked - (tally[type] ?? 0)))}
        />
        <p className={styles.pickerSummary} data-testid="pick-summary">
          Picked {picked} of {count}: {describeTally(tally)}
        </p>
        <Button
          variant="primary"
          data-testid="pick-resources-confirm"
          disabled={picked !== count}
          onClick={() => pickResources(tally)}
        >
          Confirm
        </Button>
      </div>
    </Dialog>
  );
}

/** Discard dialog: choose exactly `count` cards from the hand to discard. */
function DiscardDialog({ count, myView }: { count: number; myView: PlayerView }): JSX.Element {
  const [tally, setTally] = useState<ResourceTally>({});
  const hand = handTally(myView);
  const chosen = tallyTotal(tally);
  return (
    <Dialog
      open
      onClose={() => undefined}
      hideCloseButton
      closeOnOverlayClick={false}
      title={`Discard ${count} card${count === 1 ? '' : 's'}`}
    >
      <div className={styles.picker} data-testid="discard-dialog">
        <p className={styles.pickerSummary}>
          You rolled into a 7 with too many cards — choose {count} to discard.
        </p>
        <ResourceStepperGrid
          tally={tally}
          onChange={setTally}
          maxOf={(type) => hand[type] ?? 0}
        />
        <p className={styles.pickerSummary} data-testid="discard-summary">
          Selected {chosen} of {count}: {describeTally(tally)}
        </p>
        <Button
          variant="primary"
          data-testid="discard-confirm"
          disabled={chosen !== count}
          onClick={() => discard(tally)}
        >
          Discard
        </Button>
      </div>
    </Dialog>
  );
}

/** Victim chooser: pick which neighbouring player to rob. */
function VictimChooser({
  cg,
  victims,
  canChooseNone,
}: {
  cg: CurrentGame;
  victims: number[];
  canChooseNone: boolean;
}): JSX.Element {
  return (
    <Dialog
      open
      onClose={() => undefined}
      hideCloseButton
      closeOnOverlayClick={false}
      title="Choose a player to rob"
    >
      <div className={styles.victims} data-testid="rob-victim-dialog">
        {victims.map((pn) => (
          <Button
            key={pn}
            variant="secondary"
            data-testid={`rob-victim-${pn}`}
            onClick={() => choosePlayer(pn)}
          >
            <span
              className={styles.swatch}
              style={{ backgroundColor: cg.playerViews[pn]?.color ?? '#999' }}
              aria-hidden="true"
            />{' '}
            {seatName(cg, pn)}
            {cg.playerViews[pn] != null && ` (${cg.playerViews[pn].resourceTotal} cards)`}
          </Button>
        ))}
        {canChooseNone && (
          <Button
            variant="ghost"
            data-testid="rob-victim-none"
            onClick={() => choosePlayer(-1)}
          >
            Rob no one
          </Button>
        )}
      </div>
    </Dialog>
  );
}

/**
 * The end-of-game overlay: names the winner and lists final VP per seated
 * player. Uses GAMESTATS final scores when available, falling back to derived
 * VP from the player views.
 */
function GameOverOverlay({ cg }: { cg: CurrentGame }): JSX.Element {
  const winner = cg.winnerPlayerNumber;
  const scoreOf = (pn: number): number =>
    cg.finalScores != null && pn < cg.finalScores.length
      ? cg.finalScores[pn]
      : cg.playerViews[pn]?.vp ?? 0;

  const seated = cg.playerViews.filter((v) => v.seated);

  return (
    <div className={styles.gameOver} data-testid="game-over" role="dialog" aria-modal="true">
      <div className={styles.gameOverCard}>
        <h2 className={styles.gameOverTitle}>Game over</h2>
        <p className={styles.gameOverWinner} data-testid="game-over-winner">
          {winner >= 0 ? `${seatName(cg, winner)} wins!` : 'Game complete.'}
        </p>
        <ul className={styles.finalScores} data-testid="final-scores">
          {seated.map((v) => (
            <li
              key={v.playerNumber}
              className={styles.finalScoreRow}
              data-testid={`final-score-${v.playerNumber}`}
              data-winner={v.playerNumber === winner ? 'true' : 'false'}
            >
              <span
                className={styles.swatch}
                style={{ backgroundColor: v.color }}
                aria-hidden="true"
              />
              <span className={styles.finalScoreName}>{seatName(cg, v.playerNumber)}</span>
              <span>{scoreOf(v.playerNumber)} VP</span>
            </li>
          ))}
        </ul>
        <Button variant="primary" data-testid="game-over-leave" onClick={leaveGame}>
          Leave game
        </Button>
      </div>
    </div>
  );
}
