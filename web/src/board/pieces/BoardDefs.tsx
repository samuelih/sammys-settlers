import type { JSX } from 'react';
import { HALFDELTA_X, HALFDELTA_Y, hexPolygonPoints } from '../coords';
import { type HexKind } from '../types';

/** Hex kinds that get a gradient sheen, paired with their gradient id. */
const GRADIENT_KINDS: ReadonlyArray<HexKind> = [
  'clay',
  'ore',
  'sheep',
  'wheat',
  'wood',
  'desert',
  'gold',
  'water',
  'fog',
  'unknown',
];

/**
 * Shared SVG `<defs>` for the board: one subtle light→dark vertical gradient per
 * hex kind, a hex-shaped clip path (so resource motifs stay inside their tile),
 * and a soft drop-shadow filter used by raised pieces.
 *
 * Gradients use a transparent-white top stop and a translucent-black bottom stop
 * (theme-independent overlay) so they layer over any CSS-variable hex fill and
 * automatically read correctly in light and dark themes. The opacity is small,
 * keeping fills faithful to their tokens while adding depth.
 *
 * Rendered exactly once near the top of {@link BoardSVG}.
 */
export function BoardDefs(): JSX.Element {
  // A unit hex centered at (0,0) for the clip path; consumers translate the
  // clip into place via the motif group's own transform.
  const clipPoints = hexPolygonPoints(0, 0);
  return (
    <defs>
      {GRADIENT_KINDS.map((kind) => (
        <linearGradient key={kind} id={`hexgrad-${kind}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.3" />
          <stop offset="38%" stopColor="#ffffff" stopOpacity="0.06" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
        </linearGradient>
      ))}

      {GRADIENT_KINDS.map((kind) => (
        <pattern
          key={kind}
          id={`hexgrain-${kind}`}
          patternUnits="userSpaceOnUse"
          width="18"
          height="18"
        >
          <path
            d={grainPath(kind)}
            fill="none"
            stroke="#ffffff"
            strokeOpacity={kind === 'water' ? 0.2 : 0.12}
            strokeWidth={kind === 'water' ? 1.2 : 0.8}
            strokeLinecap="round"
          />
          <path
            d="M 3 15 l 1.5 -1.1 M 11 4 l 1.8 -1"
            fill="none"
            stroke="#000000"
            strokeOpacity="0.08"
            strokeWidth="0.7"
            strokeLinecap="round"
          />
        </pattern>
      ))}

      {/* Glossy radial highlight for the dice-number token. */}
      <radialGradient id="dice-token-grad" cx="0.5" cy="0.36" r="0.75">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
        <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>

      {/* Hex outline clip (unit hex at origin, ±HALFDELTA). */}
      <clipPath id="hex-clip" clipPathUnits="userSpaceOnUse">
        <polygon points={clipPoints} />
      </clipPath>

      {/* Soft drop shadow for raised pieces (settlements/cities/robber). */}
      <filter id="piece-shadow" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="0.8" stdDeviation="0.9" floodColor="#000000" floodOpacity="0.45" />
      </filter>

      {/* Marker used by the clip; HALFDELTA constants documented for clarity. */}
      <metadata data-halfdelta-x={HALFDELTA_X} data-halfdelta-y={HALFDELTA_Y} />
    </defs>
  );
}

/** Small low-contrast grain paths per tile kind; repeated and clipped by tiles. */
function grainPath(kind: HexKind): string {
  switch (kind) {
    case 'water':
      return 'M 0 5 q 4 -3 8 0 t 8 0 M 2 13 q 4 -2.5 8 0 t 8 0';
    case 'wheat':
      return 'M 4 17 C 6 10 7 6 10 1 M 11 17 C 10 11 13 6 16 2';
    case 'wood':
      return 'M 4 16 l 4 -12 l 4 12 M 10 17 l 3 -9 l 3 9';
    case 'ore':
      return 'M 1 14 l 5 -10 l 4 8 l 3 -6 l 4 10';
    case 'clay':
      return 'M 1 6 h 16 M 4 11 h 13 M 2 15 h 8';
    case 'sheep':
      return 'M 1 14 C 5 10 11 12 17 8 M 3 6 C 7 3 12 4 16 2';
    case 'desert':
      return 'M 0 11 q 5 -5 10 0 t 10 0 M 2 16 q 4 -3 8 0 t 8 0';
    case 'gold':
      return 'M 2 14 l 5 -7 l 3 4 l 4 -8 l 3 10 M 6 16 h 8';
    default:
      return 'M 2 8 h 14 M 4 14 h 10';
  }
}
