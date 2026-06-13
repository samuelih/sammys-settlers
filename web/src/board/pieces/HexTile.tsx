import type { JSX } from 'react';
import { hexKind, type BoardHex, type HexKind } from '../types';
import { hexToPixel, hexPolygonPoints, dicePipCount, HALFDELTA_X, HALFDELTA_Y, HEX_CENTER_DY } from '../coords';
import styles from '../BoardSVG.module.css';
import { ResourceMotif } from './ResourceMotif';
import { TerrainTexture, terrainTextureFor } from './TerrainTexture';

/** Map a HexKind to its CSS-module fill class. */
const HEX_CLASS: Record<HexKind, string> = {
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

/**
 * Per-kind gradient id (defined once in {@link BoardSVG}'s `<defs>`). The
 * gradient layers a subtle light→dark sheen over the flat CSS-variable fill so
 * tiles read as raised terrain while still being fully theme-driven.
 */
const HEX_GRADIENT: Record<HexKind, string> = {
  clay: 'hexgrad-clay',
  ore: 'hexgrad-ore',
  sheep: 'hexgrad-sheep',
  wheat: 'hexgrad-wheat',
  wood: 'hexgrad-wood',
  desert: 'hexgrad-desert',
  gold: 'hexgrad-gold',
  water: 'hexgrad-water',
  fog: 'hexgrad-fog',
  unknown: 'hexgrad-unknown',
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
 * One pointy-top hex polygon filled per its {@link hexKind}, with a subtle
 * top-light gradient sheen, an inner bevel stroke, a small per-resource motif
 * (brick rows, ore chunks, sheep, wheat sheaf, tree, sand, gold glint, waves),
 * plus a clean dice-number token (circle showing the number and a row of pip
 * dots) for resource hexes. Desert, water, gold and fog show no number. 6 and 8
 * are drawn "hot" (red) to mirror the physical game's high-probability emphasis.
 *
 * The hex `<polygon>` remains the click target; motif and token layers are
 * `pointerEvents="none"` so they never intercept board interaction. All colors
 * resolve from CSS custom properties so themes / color-blind palettes apply.
 */
export function HexTile({ hex, onClick }: HexTileProps): JSX.Element {
  const { x: cx, y: cy } = hexToPixel(hex.coord);
  // The hexagon's visual center sits half a slope-height below the grid center.
  const vy = cy + HEX_CENTER_DY;
  const kind = hexKind(hex.hexType);
  const points = hexPolygonPoints(cx, cy);
  const showNumber = hex.diceNum >= 2 && hex.diceNum <= 12 && hex.diceNum !== 7;
  const pips = dicePipCount(hex.diceNum);
  const hot = hex.diceNum === 6 || hex.diceNum === 8;
  const tokenR = HALFDELTA_X * 0.45;
  const hasTexture = terrainTextureFor(kind) !== null;

  return (
    <g data-testid={`hex-${hex.coord}`} data-hexkind={kind} data-dicenum={hex.diceNum}>
      <polygon className={styles.hexRim} points={points} pointerEvents="none" />
      {/* Flat themed fill — also the click target. */}
      <polygon
        className={`${styles.hex} ${HEX_CLASS[kind]}${onClick ? ` ${styles.hexClickable}` : ''}`}
        points={points}
        onClick={onClick ? () => onClick(hex.coord) : undefined}
      />
      {hasTexture ? (
        <g className={styles.hexTextureClip} clipPath="url(#hex-clip)" transform={`translate(${cx} ${cy})`} pointerEvents="none">
          <TerrainTexture kind={kind} className={styles.hexTexture} />
        </g>
      ) : (
        <polygon className={styles.hexGrain} points={points} fill={`url(#hexgrain-${kind})`} pointerEvents="none" />
      )}
      {/* Gradient sheen on top of the flat fill for a raised-terrain feel. */}
      <polygon className={styles.hexSheen} points={points} fill={`url(#${HEX_GRADIENT[kind]})`} pointerEvents="none" />
      {/* Inner bevel: a slightly inset outline for crisp tile edges. */}
      <polygon className={styles.hexBevel} points={hexPolygonPoints(cx, cy, 0.9)} pointerEvents="none" />

      {/* Per-resource decorative motif, clipped to the hex, for vector fallback. */}
      {!hasTexture && <ResourceMotif kind={kind} cx={cx} cy={cy} hx={HALFDELTA_X} hy={HALFDELTA_Y} />}

      {showNumber && (
        <g data-testid={`dice-${hex.coord}`} className={styles.diceTokenGroup} pointerEvents="none">
          <circle className={styles.diceTokenShadow} cx={cx} cy={vy + 0.9} r={tokenR} />
          <circle className={styles.diceToken} cx={cx} cy={vy} r={tokenR} />
          <circle className={styles.diceTokenRing} cx={cx} cy={vy} r={tokenR * 0.86} />
          <text
            className={`${styles.diceNum}${hot ? ` ${styles.diceNumHot}` : ''}`}
            x={cx}
            y={vy - tokenR * 0.28}
            fontSize={tokenR * 0.95}
          >
            {hex.diceNum}
          </text>
          {(PIP_LAYOUT[pips] ?? []).map(([dx], i) => (
            <circle
              key={i}
              className={hot ? styles.dicePipHot : styles.dicePip}
              cx={cx + dx}
              cy={vy + tokenR * 0.55}
              r={1}
            />
          ))}
        </g>
      )}
    </g>
  );
}
