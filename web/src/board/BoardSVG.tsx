import type { JSX } from 'react';
import type { BoardHex, BoardModel, BoardPiece } from './types';
import { HEX_WATER, PIECE_CITY, PIECE_ROAD, PIECE_SETTLEMENT, PIECE_SHIP } from './types';
import {
  HALFDELTA_X,
  HALFDELTA_Y,
  HEXY_OFF_SLOPE,
  TOP_MARGIN,
  coordOf,
  nodeToPixel,
  edgeToPixel,
} from './coords';
import { HexTile } from './pieces/HexTile';
import { PortMarker } from './pieces/PortMarker';
import { Robber, Pirate } from './pieces/RobberPirate';
import { Piece } from './pieces/Pieces';
import { BoardDefs } from './pieces/BoardDefs';
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

/** Fill the sea board frame with explicit water hexes behind server-sent hexes. */
function waterUnderlayHexes(board: BoardModel): BoardHex[] {
  const occupied = new Set<number>(board.hexes.map((hex) => hex.coord));
  const hexes: BoardHex[] = [];
  for (let row = 1; row < board.height; row += 2) {
    const colParity = Math.floor(row / 2) % 2;
    for (let col = 1; col < board.width; col += 1) {
      if (col % 2 !== colParity) {
        continue;
      }
      const coord = coordOf(row, col);
      if (occupied.has(coord)) {
        continue;
      }
      hexes.push({ coord, row, col, hexType: HEX_WATER, diceNum: 0 });
    }
  }
  return hexes;
}

/**
 * SVG renderer for a {@link BoardModel} (the large / sea board). Pure and
 * presentational: it knows nothing about the store or network. All colors come
 * from CSS custom properties except player piece colors, which arrive via
 * {@link BoardSVGProps.playerColors}.
 *
 * Layering (bottom → top): hexes, interactive targets, ports, edge pieces,
 * robber/pirate, structures. Roads and ships deliberately render underneath
 * settlements/cities, matching the physical board and preventing endpoint
 * pieces from visually swallowing houses.
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
  // the border aren't clipped; the bottom additionally needs the hex slope
  // height since bottom-row S apexes hang below the linear grid extent.
  const padX = HALFDELTA_X;
  const padY = HALFDELTA_Y;
  const viewW = board.width * HALFDELTA_X + padX * 2;
  const viewH = board.height * HALFDELTA_Y + TOP_MARGIN + HEXY_OFF_SLOPE + padY * 2;
  const viewBox = `${-padX} ${-padY} ${viewW} ${viewH}`;

  const colorOf = (pn: number): string => playerColors[pn] ?? 'var(--hex-fill-unknown)';
  const waterUnderlay = waterUnderlayHexes(board);
  const edgePieces = pieces.filter((p) => p.ptype === PIECE_ROAD || p.ptype === PIECE_SHIP);
  const structurePieces = pieces.filter((p) => p.ptype === PIECE_SETTLEMENT || p.ptype === PIECE_CITY);
  const robberHex = board.hexes.find((hex) => hex.coord === board.robberHex);

  return (
    <svg
      data-testid="board-svg"
      className={styles.svg}
      viewBox={viewBox}
      role="img"
      aria-label="Game board"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Gradients, clip path & filters shared by all tiles/pieces. */}
      <BoardDefs />

      {/* Explicit ocean tiles behind the authoritative layout, so sea areas read
          as hexes instead of raw blue canvas. */}
      {waterUnderlay.length > 0 && (
        <g data-testid="board-water-hexes" className={styles.waterUnderlay}>
          {waterUnderlay.map((hex) => (
            <HexTile key={hex.coord} hex={hex} />
          ))}
        </g>
      )}

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

      {/* Interactive highlight targets sit over terrain but under ports/pieces,
          so they remain clickable without visually covering roads, ports, or
          settlement/city glyphs. */}
      {highlightEdges && highlightEdges.length > 0 && (
        <g data-testid="board-edge-targets">
          {highlightEdges.map((coord) => {
            const e = edgeToPixel(coord);
            const mx = (e.x1 + e.x2) / 2;
            const my = (e.y1 + e.y2) / 2;
            return (
              <g key={coord}>
                <line
                  className={styles.edgeHighlight}
                  x1={e.x1}
                  y1={e.y1}
                  x2={e.x2}
                  y2={e.y2}
                  strokeWidth={HALFDELTA_X * 0.38}
                />
                <circle
                  data-testid={`edge-${coord}`}
                  className={`${styles.edgeTarget} ${styles.targetPulse}`}
                  cx={mx}
                  cy={my}
                  r={HALFDELTA_X * 0.28}
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
                className={`${styles.nodeTarget} ${styles.targetPulse}`}
                cx={p.x}
                cy={p.y}
                r={HALFDELTA_X * 0.25}
                onClick={onNodeClick ? () => onNodeClick(coord) : undefined}
              />
            );
          })}
        </g>
      )}

      {/* Ports */}
      <g data-testid="board-ports">
        {board.ports.map((port) => (
          <PortMarker key={`${port.edge}-${port.ptype}`} port={port} />
        ))}
      </g>

      {/* Edge pieces: roads and ships are under structures. */}
      <g data-testid="board-edge-pieces">
        {edgePieces.map((piece, i) => (
          <Piece key={`${piece.ptype}-${piece.coord}-${i}`} piece={piece} color={colorOf(piece.playerNumber)} />
        ))}
      </g>

      {/* Robber / pirate */}
      {isPlacedHex(board.robberHex) && <Robber hexCoord={board.robberHex} avoidToken={robberHex?.diceNum !== 0} />}
      {isPlacedHex(board.pirateHex) && <Pirate hexCoord={board.pirateHex} />}

      {/* Structures: draw last so roads tuck underneath endpoints. */}
      <g data-testid="board-structures">
        {structurePieces.map((piece, i) => (
          <Piece key={`${piece.ptype}-${piece.coord}-${i}`} piece={piece} color={colorOf(piece.playerNumber)} />
        ))}
      </g>
    </svg>
  );
}

export default BoardSVG;
