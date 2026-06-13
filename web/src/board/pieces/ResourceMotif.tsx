import type { JSX } from 'react';
import type { HexKind } from '../types';
import styles from '../BoardSVG.module.css';

export interface ResourceMotifProps {
  kind: HexKind;
  /** Hex center pixel. */
  cx: number;
  cy: number;
  /** Half hex width / height (HALFDELTA_X / HALFDELTA_Y). */
  hx: number;
  hy: number;
}

/**
 * Painted, clipped terrain details for each hex kind. These stay vector-native
 * so board hit targets remain clean while tiles read closer to the classic
 * Sammys-Settlers image set: full ocean hexes, clustered forests, mountains, fields,
 * dunes, and resource props instead of tiny generic center icons.
 */
export function ResourceMotif({ kind, cx, cy, hx, hy }: ResourceMotifProps): JSX.Element | null {
  const body = renderBody(kind, hx, hy);
  if (body === null) {
    return null; // <--- Early return: fog / unknown have no terrain motif ---
  }
  return (
    <g
      className={styles.motif}
      data-motif={kind}
      clipPath="url(#hex-clip)"
      transform={`translate(${cx} ${cy})`}
      pointerEvents="none"
    >
      {body}
    </g>
  );
}

/** Build the motif shapes for a given kind; null = draw nothing. */
function renderBody(kind: HexKind, hx: number, hy: number): JSX.Element | null {
  switch (kind) {
    case 'clay':
      return clayMotif(hx, hy);
    case 'ore':
      return oreMotif(hx, hy);
    case 'sheep':
      return sheepMotif(hx, hy);
    case 'wheat':
      return wheatMotif(hx, hy);
    case 'wood':
      return forestMotif(hx, hy);
    case 'desert':
      return desertMotif(hx, hy);
    case 'gold':
      return goldMotif(hx, hy);
    case 'water':
      return waterMotif(hx, hy);
    default:
      return null;
  }
}

/** Terraced red hills with a small brick stack. */
function clayMotif(hx: number, hy: number): JSX.Element {
  const hill = (x: number, y: number, s: number, key: number): JSX.Element => (
    <path
      key={`clay-hill-${key}`}
      className={styles.motifFill}
      d={`M ${x - s} ${y + s * 0.35} l ${s * 0.55} ${-s} l ${s * 0.45} ${s * 0.38}
          l ${s * 0.42} ${-s * 0.55} l ${s * 0.58} ${s * 1.17} Z`}
    />
  );
  const brick = (x: number, y: number, key: number): JSX.Element => (
    <rect key={`clay-brick-${key}`} className={styles.motifBlock} x={x} y={y} width={hx * 0.34} height={hx * 0.16} rx={1.1} />
  );
  return (
    <g>
      {hill(-hx * 0.48, -hy * 0.18, hx * 0.54, 0)}
      {hill(hx * 0.34, -hy * 0.05, hx * 0.5, 1)}
      <g transform={`translate(${-hx * 0.36} ${hy * 0.28})`}>
        {brick(0, 0, 0)}
        {brick(hx * 0.39, 0, 1)}
        {brick(hx * 0.18, -hx * 0.18, 2)}
      </g>
      <path className={styles.motifStroke} d={`M ${-hx * 0.9} ${hy * 0.45} q ${hx * 0.45} ${-hy * 0.2} ${hx} 0`} />
    </g>
  );
}

/** Layered mountain silhouettes with loose ore chunks. */
function oreMotif(hx: number, hy: number): JSX.Element {
  const peak = (x: number, base: number, s: number, key: number): JSX.Element => (
    <polygon
      key={`ore-peak-${key}`}
      className={styles.motifFill}
      points={`${x - s} ${base} ${x - s * 0.18} ${base - s * 1.28} ${x + s * 0.38} ${base - s * 0.36} ${x + s} ${base}`}
    />
  );
  const chunk = (x: number, y: number, s: number, key: number): JSX.Element => (
    <polygon
      key={`ore-chunk-${key}`}
      className={styles.motifBlock}
      points={`${x - s} ${y} ${x - s * 0.22} ${y - s * 0.8} ${x + s * 0.8} ${y - s * 0.28} ${x + s * 0.55} ${y + s * 0.58}`}
    />
  );
  return (
    <g>
      {peak(-hx * 0.48, hy * 0.38, hx * 0.62, 0)}
      {peak(hx * 0.16, hy * 0.44, hx * 0.74, 1)}
      {peak(hx * 0.68, hy * 0.4, hx * 0.5, 2)}
      {chunk(-hx * 0.52, hy * 0.58, hx * 0.14, 0)}
      {chunk(-hx * 0.2, hy * 0.48, hx * 0.16, 1)}
      {chunk(hx * 0.2, hy * 0.58, hx * 0.13, 2)}
    </g>
  );
}

/** Pasture strokes plus a compact sheep silhouette. */
function sheepMotif(hx: number, hy: number): JSX.Element {
  const grass = [-0.78, -0.42, -0.08, 0.3, 0.64].map((x, i) => (
    <path
      key={`sheep-grass-${i}`}
      className={styles.motifStroke}
      d={`M ${x * hx} ${hy * 0.42} q ${hx * 0.18} ${-hy * 0.18} ${hx * 0.36} 0`}
    />
  ));
  const s = hx * 0.36;
  return (
    <g>
      {grass}
      <rect className={styles.motifInk} x={-s * 0.72} y={hy * 0.25} width={s * 0.16} height={s * 0.45} rx={1} />
      <rect className={styles.motifInk} x={s * 0.18} y={hy * 0.25} width={s * 0.16} height={s * 0.45} rx={1} />
      <path
        className={styles.motifLight}
        d={`M ${-s} ${hy * 0.1}
            a ${s * 0.42} ${s * 0.42} 0 0 1 ${s * 0.42} ${-s * 0.42}
            a ${s * 0.48} ${s * 0.48} 0 0 1 ${s * 1.08} 0
            a ${s * 0.42} ${s * 0.42} 0 0 1 ${s * 0.42} ${s * 0.42}
            a ${s * 0.42} ${s * 0.42} 0 0 1 ${-s * 0.42} ${s * 0.36}
            h ${-s * 1.08} a ${s * 0.42} ${s * 0.42} 0 0 1 ${-s * 0.42} ${-s * 0.36} Z`}
      />
      <ellipse className={styles.motifInk} cx={s * 0.92} cy={-hy * 0.02} rx={s * 0.3} ry={s * 0.36} />
    </g>
  );
}

/** Diagonal field rows plus a wheat sheaf. */
function wheatMotif(hx: number, hy: number): JSX.Element {
  const rows = [-0.64, -0.32, 0, 0.32, 0.64].map((x, i) => (
    <path
      key={`wheat-row-${i}`}
      className={styles.motifStroke}
      d={`M ${x * hx} ${hy * 0.62} C ${(x + 0.12) * hx} ${hy * 0.1} ${(x + 0.32) * hx} ${-hy * 0.34} ${(x + 0.5) * hx} ${-hy * 0.68}`}
    />
  ));
  const stalk = (angle: number, key: number): JSX.Element => {
    const rad = (angle * Math.PI) / 180;
    const s = hx * 0.52;
    const dx = Math.sin(rad) * s;
    const dy = -Math.cos(rad) * s;
    return (
      <g key={`wheat-stalk-${key}`}>
        <line className={styles.motifStem} x1={0} y1={hy * 0.52} x2={dx} y2={dy + hy * 0.1} />
        <ellipse
          className={styles.motifBlock}
          cx={dx}
          cy={dy + hy * 0.1}
          rx={s * 0.13}
          ry={s * 0.3}
          transform={`rotate(${angle} ${dx} ${dy + hy * 0.1})`}
        />
      </g>
    );
  };
  return (
    <g className={styles.motifWheat}>
      {rows}
      {stalk(-30, 0)}
      {stalk(0, 1)}
      {stalk(30, 2)}
    </g>
  );
}

/** Cluster of pines instead of one generic tree. */
function forestMotif(hx: number, hy: number): JSX.Element {
  const tree = (x: number, y: number, s: number, key: number): JSX.Element => (
    <g key={`wood-tree-${key}`} transform={`translate(${x} ${y})`}>
      <rect className={styles.motifTrunk} x={-s * 0.1} y={s * 0.48} width={s * 0.2} height={s * 0.36} rx={0.8} />
      <polygon className={styles.motifFill} points={`0 ${-s} ${s * 0.65} ${s * 0.08} ${-s * 0.65} ${s * 0.08}`} />
      <polygon className={styles.motifFill} points={`0 ${-s * 0.42} ${s * 0.82} ${s * 0.62} ${-s * 0.82} ${s * 0.62}`} />
    </g>
  );
  return (
    <g>
      {tree(-hx * 0.52, -hy * 0.08, hx * 0.36, 0)}
      {tree(-hx * 0.05, -hy * 0.28, hx * 0.44, 1)}
      {tree(hx * 0.46, -hy * 0.02, hx * 0.36, 2)}
      {tree(-hx * 0.24, hy * 0.34, hx * 0.32, 3)}
      {tree(hx * 0.28, hy * 0.36, hx * 0.34, 4)}
      <path className={styles.motifStroke} d={`M ${-hx * 0.76} ${hy * 0.62} q ${hx * 0.75} ${-hy * 0.2} ${hx * 1.5} 0`} />
    </g>
  );
}

/** Broad dunes that make desert read as terrain rather than a plain yellow tile. */
function desertMotif(hx: number, hy: number): JSX.Element {
  const dune = (y: number, s: number, key: number): JSX.Element => (
    <path
      key={`desert-dune-${key}`}
      className={styles.motifStroke}
      d={`M ${-s} ${y} q ${s * 0.5} ${-hy * 0.36} ${s} 0 q ${s * 0.5} ${hy * 0.36} ${s} 0`}
    />
  );
  return (
    <g>
      {dune(-hy * 0.18, hx * 0.72, 0)}
      {dune(hy * 0.28, hx * 0.9, 1)}
      <path className={styles.motifFill} d={`M ${hx * 0.48} ${hy * 0.5} q ${hx * 0.18} ${-hy * 0.18} ${hx * 0.3} 0`} />
    </g>
  );
}

/** Rocky gold field with strong glints. */
function goldMotif(hx: number, hy: number): JSX.Element {
  const nugget = (x: number, y: number, s: number, key: number): JSX.Element => (
    <polygon
      key={`gold-nugget-${key}`}
      className={styles.motifBlock}
      points={`${x - s} ${y + s * 0.42} ${x - s * 0.35} ${y - s * 0.62} ${x + s * 0.75} ${y - s * 0.34} ${x + s} ${y + s * 0.38}`}
    />
  );
  return (
    <g className={styles.motifGold}>
      <path className={styles.motifFill} d={`M ${-hx * 0.8} ${hy * 0.34} l ${hx * 0.45} ${-hy * 0.7} l ${hx * 0.42} ${hy * 0.48} l ${hx * 0.32} ${-hy * 0.38} l ${hx * 0.62} ${hy * 0.72} Z`} />
      {nugget(-hx * 0.24, hy * 0.36, hx * 0.18, 0)}
      {nugget(hx * 0.12, hy * 0.22, hx * 0.16, 1)}
      {nugget(hx * 0.42, hy * 0.46, hx * 0.13, 2)}
      <path className={styles.motifGlint} d={`M ${hx * 0.28} ${-hy * 0.12} l ${hx * 0.12} 0 l ${-hx * 0.06} ${hx * 0.14} Z`} />
    </g>
  );
}

/** Full-tile water with several wave bands so ocean is visibly tiled. */
function waterMotif(hx: number, hy: number): JSX.Element {
  const wave = (y: number, s: number, key: number): JSX.Element => (
    <path
      key={`water-wave-${key}`}
      className={styles.motifWaveStroke}
      d={`M ${-s} ${y} q ${s * 0.25} ${-hy * 0.22} ${s * 0.5} 0 t ${s * 0.5} 0 t ${s * 0.5} 0 t ${s * 0.5} 0`}
    />
  );
  return (
    <g>
      {wave(-hy * 0.62, hx * 0.72, 0)}
      {wave(-hy * 0.22, hx * 0.86, 1)}
      {wave(hy * 0.2, hx * 0.78, 2)}
      {wave(hy * 0.6, hx * 0.66, 3)}
    </g>
  );
}
