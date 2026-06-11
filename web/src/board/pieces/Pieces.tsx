import type { JSX } from 'react';
import {
  type BoardPiece,
  PIECE_ROAD,
  PIECE_SETTLEMENT,
  PIECE_CITY,
  PIECE_SHIP,
} from '../types';
import { edgeToPixel, nodeToPixel, HALFDELTA_X } from '../coords';
import styles from '../BoardSVG.module.css';

export interface PieceProps {
  piece: BoardPiece;
  /** Owning player's color (hex/rgb string from the playerColors prop). */
  color: string;
}

/** Dispatch a board piece to its glyph by piece type. */
export function Piece({ piece, color }: PieceProps): JSX.Element | null {
  switch (piece.ptype) {
    case PIECE_ROAD:
      return <RoadOrShip piece={piece} color={color} ship={false} />;
    case PIECE_SHIP:
      return <RoadOrShip piece={piece} color={color} ship />;
    case PIECE_SETTLEMENT:
      return <Settlement piece={piece} color={color} />;
    case PIECE_CITY:
      return <City piece={piece} color={color} />;
    default:
      return null; // <--- Early return: unknown piece type ---
  }
}

/**
 * A road (solid thick line) or a ship (dashed, visually distinct) drawn along
 * its edge. A dark outline underneath gives the player-colored bar contrast on
 * any hex fill.
 */
function RoadOrShip({
  piece,
  color,
  ship,
}: PieceProps & { ship: boolean }): JSX.Element {
  const e = edgeToPixel(piece.coord);
  const w = HALFDELTA_X * 0.34;
  const testid = ship ? `ship-${piece.coord}` : `road-${piece.coord}`;
  return (
    <g data-testid={testid} data-player={piece.playerNumber} pointerEvents="none">
      <line
        className={styles.roadOutline}
        x1={e.x1}
        y1={e.y1}
        x2={e.x2}
        y2={e.y2}
        strokeWidth={w + 3}
      />
      <line
        className={`${styles.road}${ship ? ` ${styles.shipDash}` : ''}`}
        x1={e.x1}
        y1={e.y1}
        x2={e.x2}
        y2={e.y2}
        stroke={color}
        strokeWidth={w}
      />
    </g>
  );
}

/** A settlement: a small house glyph (square base + roof) at its node. */
function Settlement({ piece, color }: PieceProps): JSX.Element {
  const { x, y } = nodeToPixel(piece.coord);
  const s = HALFDELTA_X * 0.32;
  return (
    <g data-testid={`settlement-${piece.coord}`} data-player={piece.playerNumber} pointerEvents="none">
      <path className={styles.settlement} d={housePath(x, y, s)} fill={color} />
    </g>
  );
}

/** A city: a larger house glyph with a second block, at its node. */
function City({ piece, color }: PieceProps): JSX.Element {
  const { x, y } = nodeToPixel(piece.coord);
  const s = HALFDELTA_X * 0.42;
  return (
    <g data-testid={`city-${piece.coord}`} data-player={piece.playerNumber} pointerEvents="none">
      <path className={styles.city} d={cityPath(x, y, s)} fill={color} />
    </g>
  );
}

/** House silhouette (square body + triangular roof) centered at (x, y). */
function housePath(x: number, y: number, s: number): string {
  const left = x - s;
  const right = x + s;
  const top = y - s;
  const bottom = y + s;
  const roof = y - s * 1.9;
  return [
    `M ${left} ${bottom}`,
    `L ${left} ${top}`,
    `L ${x} ${roof}`,
    `L ${right} ${top}`,
    `L ${right} ${bottom}`,
    'Z',
  ].join(' ');
}

/** City silhouette: a tall tower joined to a lower house wing. */
function cityPath(x: number, y: number, s: number): string {
  const left = x - s * 1.3;
  const right = x + s * 1.1;
  const bottom = y + s;
  const wingTop = y - s * 0.2;
  const towerTop = y - s * 1.1;
  const roof = y - s * 1.9;
  const mid = x - s * 0.1;
  return [
    `M ${left} ${bottom}`,
    `L ${left} ${wingTop}`,
    `L ${mid} ${wingTop}`,
    `L ${mid} ${towerTop}`,
    `L ${x + s * 0.5} ${roof}`,
    `L ${right} ${towerTop}`,
    `L ${right} ${bottom}`,
    'Z',
  ].join(' ');
}
