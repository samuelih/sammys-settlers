import type { JSX } from 'react';
import type { BoardModel, BoardPiece } from './types';
import {
  HALFDELTA_X,
  HALFDELTA_Y,
  TOP_MARGIN,
  nodeToPixel,
  edgeToPixel,
} from './coords';
import { HexTile } from './pieces/HexTile';
import { PortMarker } from './pieces/PortMarker';
import { Robber, Pirate } from './pieces/RobberPirate';
import { Piece } from './pieces/Pieces';
import styles from './BoardSVG.module.css';

export interface BoardSVGProps {
  board: BoardModel;
  pieces: BoardPiece[];
  /** Player colors, indexed by player number. */
  playerColors: string[];
  /** Node coords to render as clickable targets (e.g. legal settlements). */
  highlightNodes?: number[];
  /** Edge coords to render as clickable targets (e.g. legal roads). */
  highlightEdges?: number[];
  onNodeClick?: (coord: number) => void;
  onEdgeClick?: (coord: number) => void;
  onHexClick?: (coord: number) => void;
  /** When true, hexes are clickable (e.g. moving the robber). */
  interactive?: boolean;
}

/** A robber/pirate sentinel meaning "not placed". */
function isPlacedHex(coord: number): boolean {
  return coord > 0;
}

/**
 * SVG renderer for a {@link BoardModel} (the large / sea board). Pure and
 * presentational: it knows nothing about the store or network. All colors come
 * from CSS custom properties except player piece colors, which arrive via
 * {@link BoardSVGProps.playerColors}.
 *
 * Layering (bottom → top): hexes, ports, robber/pirate, pieces, highlight
 * targets. The viewBox is derived from the board's visual `width`/`height`
 * (half-hex units), matching the `col*HALFDELTA_X` / `row*HALFDELTA_Y` mapping
 * in {@link ./coords}.
 */
export function BoardSVG({
  board,
  pieces,
  playerColors,
  highlightNodes,
  highlightEdges,
  onNodeClick,
  onEdgeClick,
  onHexClick,
  interactive = false,
}: BoardSVGProps): JSX.Element {
  // Board width/height are in half-hex units; pixels = units * HALFDELTA.
  // Pad by one half-hex + the top margin so apex points and edge pieces near
  // the border aren't clipped.
  const padX = HALFDELTA_X;
  const padY = HALFDELTA_Y;
  const viewW = board.width * HALFDELTA_X + padX * 2;
  const viewH = board.height * HALFDELTA_Y + TOP_MARGIN + padY * 2;
  const viewBox = `${-padX} ${-padY} ${viewW} ${viewH}`;

  const colorOf = (pn: number): string => playerColors[pn] ?? 'var(--hex-fill-unknown)';

  return (
    <svg
      data-testid="board-svg"
      className={styles.svg}
      viewBox={viewBox}
      role="img"
      aria-label="Game board"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Hexes */}
      <g data-testid="board-hexes">
        {board.hexes.map((hex) => (
          <HexTile
            key={hex.coord}
            hex={hex}
            onClick={interactive && onHexClick ? onHexClick : undefined}
          />
        ))}
      </g>

      {/* Ports */}
      <g data-testid="board-ports">
        {board.ports.map((port) => (
          <PortMarker key={`${port.edge}-${port.ptype}`} port={port} />
        ))}
      </g>

      {/* Robber / pirate */}
      {isPlacedHex(board.robberHex) && <Robber hexCoord={board.robberHex} />}
      {isPlacedHex(board.pirateHex) && <Pirate hexCoord={board.pirateHex} />}

      {/* Pieces */}
      <g data-testid="board-pieces">
        {pieces.map((piece, i) => (
          <Piece key={`${piece.ptype}-${piece.coord}-${i}`} piece={piece} color={colorOf(piece.playerNumber)} />
        ))}
      </g>

      {/* Interactive highlight targets */}
      {highlightEdges && highlightEdges.length > 0 && (
        <g data-testid="board-edge-targets">
          {highlightEdges.map((coord) => {
            const e = edgeToPixel(coord);
            const mx = (e.x1 + e.x2) / 2;
            const my = (e.y1 + e.y2) / 2;
            return (
              <g key={coord}>
                {/* Visible highlight along the edge (not the click target). */}
                <line
                  className={styles.edgeHighlight}
                  x1={e.x1}
                  y1={e.y1}
                  x2={e.x2}
                  y2={e.y2}
                  strokeWidth={HALFDELTA_X * 0.5}
                />
                {/* Clickable hit area at the edge midpoint. A circle has a real
                    bounding box (an axis-aligned <line> does not), so it's
                    reliably clickable by users and test drivers. */}
                <circle
                  data-testid={`edge-${coord}`}
                  className={styles.edgeTarget}
                  cx={mx}
                  cy={my}
                  r={HALFDELTA_X * 0.34}
                  onClick={onEdgeClick ? () => onEdgeClick(coord) : undefined}
                />
              </g>
            );
          })}
        </g>
      )}
      {highlightNodes && highlightNodes.length > 0 && (
        <g data-testid="board-node-targets">
          {highlightNodes.map((coord) => {
            const p = nodeToPixel(coord);
            return (
              <circle
                key={coord}
                data-testid={`node-${coord}`}
                className={styles.nodeTarget}
                cx={p.x}
                cy={p.y}
                r={HALFDELTA_X * 0.32}
                onClick={onNodeClick ? () => onNodeClick(coord) : undefined}
              />
            );
          })}
        </g>
      )}
    </svg>
  );
}

export default BoardSVG;
