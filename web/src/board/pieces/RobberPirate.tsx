import type { JSX } from 'react';
import { hexToPixel, HALFDELTA_X, HEX_CENTER_DY } from '../coords';
import styles from '../BoardSVG.module.css';

export interface MarkerProps {
  /** 0xRRCC hex coordinate the marker sits on. */
  hexCoord: number;
  /** Move aside when the hex has a dice token so the number remains readable. */
  avoidToken?: boolean;
}

/**
 * The robber: a dark, recognizable pawn (domed head, hourglass body, flared
 * base) centered on its hex, with a soft drop shadow for lift. The whole marker
 * is positioned by a `<g transform="translate(...)">` whose `transform`
 * transitions smoothly, so moving the robber glides to its new hex (honoring
 * `prefers-reduced-motion` / low-quality mode via CSS).
 */
export function Robber({ hexCoord, avoidToken = false }: MarkerProps): JSX.Element {
  const { x: cx, y } = hexToPixel(hexCoord);
  const cy = y + HEX_CENTER_DY; // hexagon's visual center
  const dx = avoidToken ? HALFDELTA_X * 0.44 : 0;
  const dy = avoidToken ? -HALFDELTA_X * 0.18 : 0;
  const s = HALFDELTA_X * (avoidToken ? 0.36 : 0.48);
  return (
    <g data-testid="robber" className={styles.marker} transform={`translate(${cx + dx} ${cy + dy})`} pointerEvents="none">
      <ellipse className={styles.markerShadow} cx={0} cy={s} rx={s * 0.8} ry={s * 0.26} />
      <path className={styles.robber} d={pawnPath(s)} />
    </g>
  );
}

/**
 * The pirate (sea board): a small dark pirate ship — hull, mast, and a skull-
 * marked sail — in a distinct blue-black, only rendered when a pirate hex is
 * set. Slides smoothly between hexes like the robber.
 */
export function Pirate({ hexCoord }: MarkerProps): JSX.Element {
  const { x: cx, y } = hexToPixel(hexCoord);
  const cy = y + HEX_CENTER_DY; // hexagon's visual center
  const s = HALFDELTA_X * 0.56;
  return (
    <g data-testid="pirate" className={styles.marker} transform={`translate(${cx} ${cy})`} pointerEvents="none">
      <ellipse className={styles.markerShadow} cx={0} cy={s * 0.85} rx={s * 0.85} ry={s * 0.22} />
      {/* hull */}
      <path className={styles.pirate} d={`M ${-s} ${s * 0.1} q ${s} ${s} ${s * 2} 0 Z`} />
      {/* mast */}
      <line className={styles.pirateRig} x1={0} y1={s * 0.1} x2={0} y2={-s} />
      {/* sail */}
      <path className={styles.pirateSail} d={`M ${s * 0.08} ${-s * 0.95} L ${s * 0.95} ${-s * 0.2} L ${s * 0.08} ${-s * 0.2} Z`} />
      {/* skull dot */}
      <circle className={styles.pirateSkull} cx={s * 0.4} cy={-s * 0.5} r={s * 0.12} />
    </g>
  );
}

/**
 * A chess-pawn-like silhouette centered at the local origin (0, 0), half-size
 * `s`: flared base, narrow neck, domed head.
 */
function pawnPath(s: number): string {
  const headR = s * 0.4;
  const headCy = -s * 0.55;
  const baseY = s;
  const baseHalf = s * 0.82;
  const neckHalf = s * 0.28;
  return [
    `M ${-baseHalf} ${baseY}`,
    `Q ${-baseHalf * 0.5} ${baseY * 0.55} ${-neckHalf} ${-s * 0.08}`,
    `L ${-headR} ${headCy + headR}`,
    `A ${headR} ${headR} 0 1 1 ${headR} ${headCy + headR}`,
    `L ${neckHalf} ${-s * 0.08}`,
    `Q ${baseHalf * 0.5} ${baseY * 0.55} ${baseHalf} ${baseY}`,
    'Z',
  ].join(' ');
}
