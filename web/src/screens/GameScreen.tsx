import { useEffect, useRef } from 'react';

import { Button, Panel, useToast } from '../components';
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
import { GameState, PieceTypeConst } from '../protocol';
import {
  type CurrentGame,
  type PlayerView,
  PLAYER_COLORS,
  leaveGame,
  rollDice,
  putPiece,
  buildRequest,
  cancelBuild,
  endTurn,
  isMyTurn as isMyTurnOf,
  isInitialPlacementState,
  useGameStore,
} from '../store/gameStore';
import styles from './GameScreen.module.css';

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
  if (st === GameState.PLACING_ROAD) {
    return { nodes: [], edges: legalRoadEdges(cg), onEdgeClick: (c) => putPiece(PieceTypeConst.ROAD, c) };
  }
  if (st === GameState.PLACING_CITY) {
    return { nodes: mySettlementNodes(cg), edges: [], onNodeClick: (c) => putPiece(PieceTypeConst.CITY, c) };
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
}: {
  view: PlayerView;
  isCurrent: boolean;
  isMe: boolean;
}): JSX.Element {
  const pn = view.playerNumber;
  return (
    <li
      className={`${styles.playerPanel} ${isCurrent ? styles.playerCurrent : ''}`}
      data-testid={`player-panel-${pn}`}
      data-current={isCurrent ? 'true' : 'false'}
      data-seated={view.seated ? 'true' : 'false'}
      data-robot={view.isRobot ? 'true' : 'false'}
    >
      <div className={styles.playerHead}>
        <span
          className={styles.swatch}
          data-testid={`player-swatch-${pn}`}
          style={{ backgroundColor: view.color }}
          aria-hidden="true"
        />
        <span className={styles.playerName} data-testid={`player-name-${pn}`}>
          {view.seated ? view.name : `Seat ${pn + 1}`}
          {view.isRobot && <span className={styles.botTag}> (bot)</span>}
          {isMe && <span className={styles.youTag}> (you)</span>}
        </span>
        <span className={styles.vp} data-testid={`player-vp-${pn}`} title="Victory points">
          {view.vp} VP
        </span>
      </div>

      <div className={styles.playerStats}>
        <span className={styles.stat} data-testid={`player-resources-${pn}`}>
          <span className={styles.statLabel}>Cards</span>
          <span className={styles.statValue}>{view.resourceTotal}</span>
        </span>
        <span className={styles.stat} title="Development cards">
          <span className={styles.statLabel}>Dev</span>
          <span className={styles.statValue}>{view.devCardCount}</span>
        </span>
        <span className={styles.stat} title="Knights played">
          <span className={styles.statLabel}>Army</span>
          <span className={styles.statValue}>{view.knights}</span>
        </span>
      </div>

      <div className={styles.playerPieces}>
        <span className={styles.piece} title="Roads remaining">R {view.roads}</span>
        <span className={styles.piece} title="Settlements remaining">S {view.settlements}</span>
        <span className={styles.piece} title="Cities remaining">C {view.cities}</span>
        <span className={styles.piece} title="Ships remaining">Sh {view.ships}</span>
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
      </div>
    </li>
  );
}

/** The local player's per-resource hand breakdown. */
function MyResources({ view }: { view: PlayerView }): JSX.Element {
  return (
    <div className={styles.myResources} data-testid="my-resources">
      {RESOURCE_ROWS.map(({ key, label }) => (
        <span
          key={key}
          className={styles.resChip}
          data-testid={`my-res-${key}`}
          data-resource={key}
        >
          <span className={styles.resLabel}>{label}</span>
          <span className={styles.resValue}>{view.resources[key]}</span>
        </span>
      ))}
    </div>
  );
}

/** A scrolling game log; auto-scrolls to the newest line. */
function GameLog({ lines }: { lines: readonly string[] }): JSX.Element {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    // scrollIntoView is unavailable in some non-browser test environments (jsdom).
    const end = endRef.current;
    if (end != null && typeof end.scrollIntoView === 'function') {
      end.scrollIntoView({ block: 'end' });
    }
  }, [lines.length]);
  return (
    <div className={styles.log} data-testid="game-log" role="log" aria-live="polite">
      {lines.length === 0 ? (
        <p className={styles.logEmpty}>No game messages yet.</p>
      ) : (
        lines.map((line, i) => (
          <p key={i} className={styles.logLine}>
            {line}
          </p>
        ))
      )}
      <div ref={endRef} />
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
export function GameScreen(): JSX.Element | null {
  const cg = useGameStore((s) => s.currentGame);
  const error = useGameStore((s) => s.error);
  const setError = useGameStore((s) => s.setError);
  const { showToast } = useToast();

  useEffect(() => {
    if (error != null && error !== '') {
      showToast(error, { variant: 'danger' });
      setError(undefined);
    }
  }, [error, showToast, setError]);

  if (cg === null) {
    return null; // <--- Early return: no joined game ---
  }

  const myView = cg.mySeat >= 0 ? cg.playerViews[cg.mySeat] : null;
  const isMyTurn = cg.mySeat >= 0 && cg.mySeat === cg.currentPlayerNumber;
  const hl = computeHighlights(cg);
  const interactive = isMyTurn && (hl.nodes.length > 0 || hl.edges.length > 0);

  return (
    <div className={styles.wrap} data-testid="game-started">
      <header className={styles.topbar}>
        <h2 className={styles.title} data-testid="game-name">
          {cg.gameName}
        </h2>
        <div
          className={`${styles.turnBanner} ${isMyTurn ? styles.turnMine : ''}`}
          data-testid="turn-banner"
          data-current-player={cg.currentPlayerNumber}
        >
          <span className={styles.turnPlayer}>{currentPlayerName(cg)}</span>
          <span className={styles.turnState}>{gameStateLabel(cg.gameState)}</span>
        </div>
        <DiceDisplay
          d1={cg.lastDice?.d1 ?? 0}
          d2={cg.lastDice?.d2 ?? 0}
          total={cg.lastDice?.total ?? null}
        />
        <Button
          variant="ghost"
          size="sm"
          className={styles.leave}
          onClick={leaveGame}
          data-testid="leave-game"
        >
          Leave
        </Button>
      </header>

      <div className={styles.body}>
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
            />
          ) : (
            <p className={styles.boardLoading} data-testid="board-loading">
              Loading board…
            </p>
          )}
        </div>

        <aside className={styles.sidebar}>
          <Panel title="Actions">
            <GameControls cg={cg} myView={myView} isMyTurn={isMyTurn} />
          </Panel>

          <Panel title="Players" flushBody>
            <ul className={styles.players} data-testid="player-panels">
              {cg.playerViews.map((view) => (
                <PlayerPanel
                  key={view.playerNumber}
                  view={view}
                  isCurrent={view.playerNumber === cg.currentPlayerNumber}
                  isMe={view.playerNumber === cg.mySeat}
                />
              ))}
            </ul>
          </Panel>

          {myView !== null && (
            <Panel title="Your hand">
              <MyResources view={myView} />
            </Panel>
          )}

          <Panel title="Game log" flushBody>
            <GameLog lines={cg.gameLog} />
          </Panel>
        </aside>
      </div>
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
        <Button variant="primary" onClick={rollDice} data-testid="roll-dice">
          Roll dice
        </Button>
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
        <div className={styles.buildBar}>
          <Button
            size="sm"
            variant="secondary"
            data-testid="build-road"
            disabled={!can || myView.roads <= 0 || !canAfford(myView, COSTS.road)}
            onClick={() => buildRequest(PieceTypeConst.ROAD)}
          >
            Road
          </Button>
          <Button
            size="sm"
            variant="secondary"
            data-testid="build-settlement"
            disabled={!can || myView.settlements <= 0 || !canAfford(myView, COSTS.settlement)}
            onClick={() => buildRequest(PieceTypeConst.SETTLEMENT)}
          >
            Settlement
          </Button>
          <Button
            size="sm"
            variant="secondary"
            data-testid="build-city"
            disabled={!can || myView.cities <= 0 || !canAfford(myView, COSTS.city)}
            onClick={() => buildRequest(PieceTypeConst.CITY)}
          >
            City
          </Button>
        </div>
        <Button variant="primary" onClick={endTurn} data-testid="end-turn">
          End turn
        </Button>
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
        <Button
          size="sm"
          variant="ghost"
          data-testid="cancel-build"
          onClick={() => cancelBuild(pieceType)}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.controls} data-testid="game-controls">
      <p className={styles.prompt} data-testid="controls-prompt">
        {gameStateLabel(st)}
      </p>
      <Button variant="ghost" size="sm" onClick={endTurn} data-testid="end-turn">
        End turn
      </Button>
    </div>
  );
}

/** Two dice faces + total, or a placeholder before the first roll. */
function DiceDisplay({
  d1,
  d2,
  total,
}: {
  d1: number;
  d2: number;
  total: number | null;
}): JSX.Element {
  return (
    <div className={styles.dice} data-testid="dice-display" data-total={total ?? ''}>
      {total === null ? (
        <span className={styles.diceEmpty}>—</span>
      ) : (
        <>
          {d1 > 0 && <span className={styles.die}>{d1}</span>}
          {d2 > 0 && <span className={styles.die}>{d2}</span>}
          <span className={styles.diceTotal} data-testid="dice-total">
            {total}
          </span>
        </>
      )}
    </div>
  );
}
