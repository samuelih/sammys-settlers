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

/** Slightly darken a player color for outlines/keylines. */
function darken(color: string): string {
  // The piece outline comes from a CSS variable; we only fall back to a color
  // mix when the browser supports it. Keep it simple and theme-driven.
  return `color-mix(in srgb, ${color} 62%, #000)`;
}

/**
 * A road (solid rounded bar) or a ship (segmented hull motif) drawn along its
 * edge. A dark outline underneath gives the player-colored bar contrast on any
 * hex fill; ships additionally get a little hull silhouette so they read as
 * boats, not just dashed roads. Pieces fade/pop in via the `.piecePop` class.
 */
function RoadOrShip({
  piece,
  color,
  ship,
}: PieceProps & { ship: boolean }): JSX.Element {
  const e = edgeToPixel(piece.coord);
  const w = HALFDELTA_X * 0.2;
  const testid = ship ? `ship-${piece.coord}` : `road-${piece.coord}`;
  const mx = (e.x1 + e.x2) / 2;
  const my = (e.y1 + e.y2) / 2;
  if (ship) {
    const hullW = HALFDELTA_X * 0.72;
    const hullH = HALFDELTA_X * 0.22;
    return (
      <g data-testid={testid} data-player={piece.playerNumber} className={styles.piecePop} pointerEvents="none">
        <g transform={`translate(${mx} ${my}) rotate(${e.angle})`}>
          <ellipse className={styles.shipShadow} cx={0} cy={hullH * 0.55} rx={hullW * 0.55} ry={hullH * 0.55} />
          <path
            className={styles.shipHull}
            d={`M ${-hullW} ${-hullH * 0.05} q ${hullW} ${hullH * 1.4} ${hullW * 2} 0
                q ${-hullW * 0.22} ${hullH * 0.85} ${-hullW * 1.78} ${hullH * 0.85} Z`}
            fill={color}
          />
          <line className={styles.shipMast} x1={0} y1={hullH * 0.1} x2={0} y2={-hullH * 2.4} />
          <path
            className={styles.shipSail}
            d={`M ${hullW * 0.08} ${-hullH * 2.25} L ${hullW * 0.82} ${-hullH * 0.55} L ${hullW * 0.08} ${-hullH * 0.55} Z`}
          />
        </g>
      </g>
    );
  }
  return (
    <g data-testid={testid} data-player={piece.playerNumber} className={styles.piecePop} pointerEvents="none">
      {/* dark keyline for contrast */}
      <line
        className={styles.roadOutline}
        x1={e.x1}
        y1={e.y1}
        x2={e.x2}
        y2={e.y2}
        strokeWidth={w + 2.5}
      />
      {/* player-colored bar */}
      <line
        className={styles.road}
        x1={e.x1}
        y1={e.y1}
        x2={e.x2}
        y2={e.y2}
        stroke={color}
        strokeWidth={w}
      />
      <line className={styles.roadHighlight} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} strokeWidth={w * 0.35} />
    </g>
  );
}

/** A settlement: a small house glyph (square base + roof) at its node. */
function Settlement({ piece, color }: PieceProps): JSX.Element {
  const { x, y } = nodeToPixel(piece.coord);
  const s = HALFDELTA_X * 0.3;
  return (
    <g
      data-testid={`settlement-${piece.coord}`}
      data-player={piece.playerNumber}
      className={styles.piecePop}
      pointerEvents="none"
    >
      <path className={styles.settlement} d={housePath(x, y, s)} fill={color} stroke={darken(color)} />
      <path className={styles.pieceRoof} d={`M ${x - s * 1.02} ${y - s * 0.28} L ${x} ${y - s * 1.08} L ${x + s * 1.02} ${y - s * 0.28}`} />
      <rect className={styles.pieceDetail} x={x - s * 0.18} y={y + s * 0.08} width={s * 0.36} height={s * 0.62} rx={0.8} />
    </g>
  );
}

/** A city: a larger house glyph with a second block, at its node. */
function City({ piece, color }: PieceProps): JSX.Element {
  const { x, y } = nodeToPixel(piece.coord);
  const s = HALFDELTA_X * 0.38;
  return (
    <g
      data-testid={`city-${piece.coord}`}
      data-player={piece.playerNumber}
      className={styles.piecePop}
      pointerEvents="none"
    >
      <path className={styles.city} d={cityPath(x, y, s)} fill={color} stroke={darken(color)} />
      <path className={styles.pieceRoof} d={`M ${x - s * 1.18} ${y - s * 0.12} L ${x - s * 0.45} ${y - s * 0.82} L ${x + s * 0.05} ${y - s * 0.16}`} />
      <rect className={styles.pieceDetail} x={x + s * 0.16} y={y - s * 0.48} width={s * 0.22} height={s * 0.24} rx={0.7} />
      <rect className={styles.pieceDetail} x={x + s * 0.16} y={y + s * 0.04} width={s * 0.22} height={s * 0.24} rx={0.7} />
    </g>
  );
}

/** House silhouette (square body + triangular roof) centered at (x, y). */
function housePath(x: number, y: number, s: number): string {
  const left = x - s * 0.92;
  const right = x + s * 0.92;
  const shoulder = y - s * 0.34;
  const bottom = y + s * 0.78;
  const roof = y - s * 1.14;
  return [
    `M ${left} ${bottom}`,
    `L ${left} ${shoulder}`,
    `L ${x} ${roof}`,
    `L ${right} ${shoulder}`,
    `L ${right} ${bottom}`,
    'Z',
  ].join(' ');
}

/** City silhouette: a tall tower joined to a lower house wing. */
function cityPath(x: number, y: number, s: number): string {
  const left = x - s * 1.18;
  const right = x + s * 1.05;
  const bottom = y + s * 0.82;
  const wingTop = y - s * 0.12;
  const towerTop = y - s * 0.9;
  const roof = y - s * 1.28;
  const mid = x - s * 0.28;
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
