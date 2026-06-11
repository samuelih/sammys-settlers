import type { JSX } from 'react';
import { hexToPixel, HALFDELTA_X } from '../coords';
import styles from '../BoardSVG.module.css';

export interface MarkerProps {
  /** 0xRRCC hex coordinate the marker sits on. */
  hexCoord: number;
}

/**
 * The robber: a dark rounded "pawn" centered on its hex. Drawn as a tapered
 * body with a domed head, scaled to the hex.
 */
export function Robber({ hexCoord }: MarkerProps): JSX.Element {
  const { x: cx, y: cy } = hexToPixel(hexCoord);
  const s = HALFDELTA_X * 0.5;
  return (
    <g data-testid="robber" pointerEvents="none">
      <path className={styles.robber} d={pawnPath(cx, cy, s)} />
    </g>
  );
}

/**
 * The pirate ship marker (sea board): same pawn silhouette in a distinct
 * blue-black, only rendered when a pirate hex is set.
 */
export function Pirate({ hexCoord }: MarkerProps): JSX.Element {
  const { x: cx, y: cy } = hexToPixel(hexCoord);
  const s = HALFDELTA_X * 0.5;
  return (
    <g data-testid="pirate" pointerEvents="none">
      <path className={styles.pirate} d={pawnPath(cx, cy, s)} />
    </g>
  );
}

/** A simple chess-pawn-like silhouette centered at (cx, cy), half-size `s`. */
function pawnPath(cx: number, cy: number, s: number): string {
  const headR = s * 0.42;
  const headCy = cy - s * 0.55;
  const baseY = cy + s;
  const baseHalf = s * 0.85;
  const neckHalf = s * 0.3;
  return [
    `M ${cx - baseHalf} ${baseY}`,
    `L ${cx + baseHalf} ${baseY}`,
    `L ${cx + neckHalf} ${cy - s * 0.1}`,
    `L ${cx + headR} ${headCy + headR}`,
    `A ${headR} ${headR} 0 1 0 ${cx - headR} ${headCy + headR}`,
    `L ${cx - neckHalf} ${cy - s * 0.1}`,
    'Z',
  ].join(' ');
}
