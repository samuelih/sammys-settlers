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

/** Slightly lift a player color for painted highlights. */
function lighten(color: string): string {
  return `color-mix(in srgb, ${color} 46%, #fff)`;
}

/** Trim a road/ship away from its endpoint nodes so structures own the corners. */
function trimSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  trim: number,
): { x1: number; y1: number; x2: number; y2: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len <= trim * 2) {
    return { x1, y1, x2, y2 }; // <--- Early return: too short to trim safely ---
  }
  const ux = dx / len;
  const uy = dy / len;
  return {
    x1: x1 + ux * trim,
    y1: y1 + uy * trim,
    x2: x2 - ux * trim,
    y2: y2 - uy * trim,
  };
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
  const w = HALFDELTA_X * 0.18;
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
  const road = trimSegment(e.x1, e.y1, e.x2, e.y2, HALFDELTA_X * 0.13);
  const roadLen = Math.hypot(road.x2 - road.x1, road.y2 - road.y1);
  const roadMx = (road.x1 + road.x2) / 2;
  const roadMy = (road.y1 + road.y2) / 2;
  const roadH = w;
  return (
    <g data-testid={testid} data-player={piece.playerNumber} className={styles.piecePop} pointerEvents="none">
      <g transform={`translate(${roadMx} ${roadMy}) rotate(${e.angle})`}>
        {/* dark player-tinted keyline for contrast */}
        <rect
          className={styles.roadOutline}
          x={-roadLen / 2}
          y={-(roadH + 2.2) / 2}
          width={roadLen}
          height={roadH + 2.2}
          rx={(roadH + 2.2) / 2}
          fill={darken(color)}
        />
        {/* player-colored plank */}
        <rect
          className={styles.road}
          x={-roadLen / 2}
          y={-roadH / 2}
          width={roadLen}
          height={roadH}
          rx={roadH / 2}
          fill={color}
        />
        <rect
          className={styles.roadHighlight}
          x={-roadLen / 2 + roadH * 0.5}
          y={-roadH * 0.34}
          width={Math.max(0, roadLen - roadH)}
          height={roadH * 0.24}
          rx={roadH * 0.15}
          fill={lighten(color)}
        />
        <rect
          className={styles.roadBevel}
          x={-roadLen / 2 + roadH * 0.42}
          y={roadH * 0.2}
          width={Math.max(0, roadLen - roadH * 0.84)}
          height={roadH * 0.18}
          rx={roadH * 0.09}
        />
      </g>
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
      <path
        className={styles.pieceRoof}
        d={`M ${x - s * 1.02} ${y - s * 0.28} L ${x} ${y - s * 1.08} L ${x + s * 1.02} ${y - s * 0.28}`}
      />
      <rect className={styles.pieceDoor} x={x - s * 0.18} y={y + s * 0.08} width={s * 0.36} height={s * 0.62} rx={0.8} />
    </g>
  );
}

/** A city: a manor-and-tower glyph, at its node. */
function City({ piece, color }: PieceProps): JSX.Element {
  const { x, y } = nodeToPixel(piece.coord);
  const s = HALFDELTA_X * 0.34;
  return (
    <g
      data-testid={`city-${piece.coord}`}
      data-player={piece.playerNumber}
      className={styles.piecePop}
      pointerEvents="none"
    >
      <ellipse className={styles.pieceBaseShadow} cx={x} cy={y + s * 0.72} rx={s * 1.08} ry={s * 0.22} />
      <path className={styles.city} d={cityPath(x, y, s)} fill={color} stroke={darken(color)} />
      <path
        className={styles.pieceRoof}
        d={[
          `M ${x - s * 1.02} ${y - s * 0.1}`,
          `L ${x - s * 0.48} ${y - s * 0.78}`,
          `L ${x + s * 0.08} ${y - s * 0.1}`,
          `M ${x + s * 0.26} ${y - s * 0.45}`,
          `L ${x + s * 0.46} ${y - s * 0.62}`,
          `L ${x + s * 0.66} ${y - s * 0.45}`,
        ].join(' ')}
      />
      <path
        className={styles.pieceSeam}
        d={`M ${x + s * 0.15} ${y - s * 0.08} L ${x + s * 0.15} ${y + s * 0.7}`}
      />
      <rect className={styles.pieceDoor} x={x - s * 0.56} y={y + s * 0.18} width={s * 0.28} height={s * 0.52} rx={0.9} />
      <rect className={styles.pieceWindow} x={x + s * 0.48} y={y - s * 0.24} width={s * 0.22} height={s * 0.22} rx={0.8} />
      <rect className={styles.pieceWindow} x={x + s * 0.48} y={y + s * 0.18} width={s * 0.22} height={s * 0.22} rx={0.8} />
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

/** City silhouette: lower manor wing joined to a compact crenellated tower. */
function cityPath(x: number, y: number, s: number): string {
  const left = x - s * 1.08;
  const wingRight = x + s * 0.14;
  const towerLeft = x + s * 0.14;
  const towerRight = x + s * 0.98;
  const bottom = y + s * 0.74;
  const eave = y - s * 0.1;
  const roof = y - s * 0.82;
  const towerTop = y - s * 0.58;
  const crenelTop = y - s * 0.76;
  const crenelLow = y - s * 0.58;
  return [
    `M ${left} ${bottom}`,
    `L ${left} ${eave}`,
    `L ${x - s * 0.48} ${roof}`,
    `L ${wingRight} ${eave}`,
    `L ${towerLeft} ${eave}`,
    `L ${towerLeft} ${towerTop}`,
    `L ${x + s * 0.3} ${towerTop}`,
    `L ${x + s * 0.3} ${crenelTop}`,
    `L ${x + s * 0.47} ${crenelTop}`,
    `L ${x + s * 0.47} ${crenelLow}`,
    `L ${x + s * 0.65} ${crenelLow}`,
    `L ${x + s * 0.65} ${crenelTop}`,
    `L ${x + s * 0.82} ${crenelTop}`,
    `L ${x + s * 0.82} ${crenelLow}`,
    `L ${towerRight} ${crenelLow}`,
    `L ${towerRight} ${bottom}`,
    'Z',
  ].join(' ');
}
