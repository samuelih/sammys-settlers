import type { JSX } from 'react';
import { hexKind, type BoardHex } from '../types';
import { hexToPixel, hexPolygonPoints, dicePipCount, HALFDELTA_X } from '../coords';
import styles from '../BoardSVG.module.css';

/** Map a HexKind to its CSS-module fill class. */
const HEX_CLASS: Record<ReturnType<typeof hexKind>, string> = {
  clay: styles.hexClay,
  ore: styles.hexOre,
  sheep: styles.hexSheep,
  wheat: styles.hexWheat,
  wood: styles.hexWood,
  desert: styles.hexDesert,
  gold: styles.hexGold,
  water: styles.hexWater,
  fog: styles.hexFog,
  unknown: styles.hexUnknown,
};

/** Pip-dot layout (relative offsets) keyed by pip count 1..5. */
const PIP_LAYOUT: Record<number, ReadonlyArray<readonly [number, number]>> = {
  1: [[0, 0]],
  2: [
    [-2.5, 0],
    [2.5, 0],
  ],
  3: [
    [-4, 0],
    [0, 0],
    [4, 0],
  ],
  4: [
    [-4, 0],
    [-1.3, 0],
    [1.3, 0],
    [4, 0],
  ],
  5: [
    [-5.2, 0],
    [-2.6, 0],
    [0, 0],
    [2.6, 0],
    [5.2, 0],
  ],
};

export interface HexTileProps {
  hex: BoardHex;
  onClick?: (coord: number) => void;
}

/**
 * One pointy-top hex polygon filled per its {@link hexKind}, plus a dice-number
 * token (circle showing the number and a row of pip dots) for resource hexes.
 * Desert, water, gold and fog show no number. 6 and 8 are drawn "hot" (red) to
 * mirror the physical game's high-probability emphasis.
 */
export function HexTile({ hex, onClick }: HexTileProps): JSX.Element {
  const { x: cx, y: cy } = hexToPixel(hex.coord);
  const kind = hexKind(hex.hexType);
  const points = hexPolygonPoints(cx, cy);
  const showNumber = hex.diceNum >= 2 && hex.diceNum <= 12 && hex.diceNum !== 7;
  const pips = dicePipCount(hex.diceNum);
  const hot = hex.diceNum === 6 || hex.diceNum === 8;
  const tokenR = HALFDELTA_X * 0.45;

  return (
    <g data-testid={`hex-${hex.coord}`} data-hexkind={kind} data-dicenum={hex.diceNum}>
      <polygon
        className={`${styles.hex} ${HEX_CLASS[kind]}${onClick ? ` ${styles.hexClickable}` : ''}`}
        points={points}
        onClick={onClick ? () => onClick(hex.coord) : undefined}
      />
      {showNumber && (
        <g data-testid={`dice-${hex.coord}`} pointerEvents="none">
          <circle className={styles.diceToken} cx={cx} cy={cy} r={tokenR} />
          <text
            className={`${styles.diceNum}${hot ? ` ${styles.diceNumHot}` : ''}`}
            x={cx}
            y={cy - tokenR * 0.28}
            fontSize={tokenR * 0.95}
          >
            {hex.diceNum}
          </text>
          {(PIP_LAYOUT[pips] ?? []).map(([dx], i) => (
            <circle
              key={i}
              className={hot ? styles.dicePipHot : styles.dicePip}
              cx={cx + dx}
              cy={cy + tokenR * 0.55}
              r={0.9}
            />
          ))}
        </g>
      )}
    </g>
  );
}
