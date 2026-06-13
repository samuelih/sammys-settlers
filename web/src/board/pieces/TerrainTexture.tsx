import type { JSX } from 'react';

import { HALFDELTA_X, HALFDELTA_Y, HEXY_OFF_SLOPE } from '../coords';
import type { HexKind } from '../types';

const TERRAIN_TEXTURES: Partial<Record<HexKind, string>> = {
  clay: '/board-tiles/clay.png',
  ore: '/board-tiles/ore.png',
  sheep: '/board-tiles/sheep.png',
  wheat: '/board-tiles/wheat.png',
  wood: '/board-tiles/wood.png',
  desert: '/board-tiles/desert.png',
  gold: '/board-tiles/gold.png',
  water: '/board-tiles/water.png',
};

/**
 * Project-local bitmap texture for a board terrain kind, if one exists.
 *
 * @since 2.7.00
 */
export function terrainTextureFor(kind: HexKind): string | null {
  return TERRAIN_TEXTURES[kind] ?? null;
}

export interface TerrainTextureProps {
  kind: HexKind;
  className?: string;
}

/**
 * Draw a terrain PNG in the local coordinate space of {@code #hex-clip}.
 *
 * @since 2.7.00
 */
export function TerrainTexture({ kind, className }: TerrainTextureProps): JSX.Element | null {
  const href = terrainTextureFor(kind);
  if (href === null) {
    return null; // <--- Early return: fog / unknown stay vector fallback only ---
  }

  return (
    <image
      className={className}
      href={href}
      x={-HALFDELTA_X}
      y={-HALFDELTA_Y}
      width={HALFDELTA_X * 2}
      height={HALFDELTA_Y * 2 + HEXY_OFF_SLOPE}
      preserveAspectRatio="xMidYMid slice"
      pointerEvents="none"
    />
  );
}
