/**
 * Pure, immutable mutation helpers for the map-editor UI. Each returns a NEW
 * {@link CustomMap} (never mutates its argument) so React state updates stay
 * predictable and the helpers are trivially unit-testable. The editor screen and
 * its tests both drive edits exclusively through these functions.
 *
 * Coordinates are kept as the on-disk `"0xRRCC"` strings (via {@link encodeCoord})
 * so import → edit → export stays lossless; {@link validation} handles all rule
 * checking against the same string form.
 */

import {
  type CustomMap,
  type MapLandHex,
  type MapPort,
  type HexTypeName,
  type PortTypeName,
  type FacingName,
  encodeCoord,
  parseCoord,
  mapWithCanonicalLandAreas,
} from './mapSchema';
import { clampBoardSize, minimumBoardSizeForMap } from './editorGrid';
import { facingForEdge } from './validation';

/** Hex types that carry no dice number (desert/water); placing one clears diceNum. */
const NO_NUMBER_TYPES: ReadonlySet<string> = new Set(['desert', 'water']);

/** Find the index of a land hex at a coord, or -1. Compares by parsed int coord. */
export function indexOfHexAt(map: CustomMap, coord: number): number {
  return (map.landHexes ?? []).findIndex((h) => parseCoord(h.coord) === coord);
}

/** Find the index of a port at an edge coord, or -1. */
export function indexOfPortAt(map: CustomMap, edge: number): number {
  return (map.ports ?? []).findIndex((p) => parseCoord(p.edge) === edge);
}

/**
 * Place (or retype) a land hex at `coord` with the given resource `type`. If a hex
 * already sits there it is retyped in place (keeping its dice number unless the new
 * type can't carry one); otherwise a new hex is appended. Desert/water always get
 * diceNum 0. The hex's `landArea` (if any) is preserved on retype, else set to the
 * supplied default.
 */
export function placeHex(
  map: CustomMap,
  coord: number,
  type: HexTypeName,
  landArea?: number,
): CustomMap {
  const hexes = [...(map.landHexes ?? [])];
  const idx = indexOfHexAt(map, coord);
  const noNumber = NO_NUMBER_TYPES.has(type);

  if (idx >= 0) {
    const prev = hexes[idx];
    const next: MapLandHex = {
      type,
      coord: prev.coord,
      diceNum: noNumber ? 0 : prev.diceNum,
    };
    if (landArea !== undefined) {
      next.landArea = landArea;
    } else if (prev.landArea !== undefined) {
      next.landArea = prev.landArea;
    }
    hexes[idx] = next;
  } else {
    const next: MapLandHex = { type, coord: encodeCoord(coord), diceNum: 0 };
    if (landArea !== undefined) {
      next.landArea = landArea;
    }
    hexes.push(next);
  }
  return mapWithCanonicalLandAreas({ ...map, landHexes: hexes });
}

/** Remove any land hex at `coord` (no-op if none). Also clears robber/pirate there. */
export function clearHex(map: CustomMap, coord: number): CustomMap {
  const idx = indexOfHexAt(map, coord);
  if (idx < 0) {
    return map;
  }
  const hexes = (map.landHexes ?? []).filter((_, i) => i !== idx);
  const next: CustomMap = { ...map, landHexes: hexes };
  if (parseCoord(next.robberHex) === coord) {
    delete next.robberHex;
  }
  if (parseCoord(next.pirateHex) === coord) {
    delete next.pirateHex;
  }
  return mapWithCanonicalLandAreas(next);
}

/**
 * Set the dice number of the hex at `coord`. `dice` of 0 clears the number. No-op
 * if there's no hex there. (Range validity is left to {@link validation}; the UI
 * already constrains the picker to 0/2..6,8..12.)
 */
export function setHexDice(map: CustomMap, coord: number, dice: number): CustomMap {
  const idx = indexOfHexAt(map, coord);
  if (idx < 0) {
    return map;
  }
  const hexes = [...(map.landHexes ?? [])];
  hexes[idx] = { ...hexes[idx], diceNum: dice };
  return { ...map, landHexes: hexes };
}

/** Assign the hex at `coord` to a land area, rebuilding authoritative area ranges. */
export function setHexLandArea(map: CustomMap, coord: number, landArea: number): CustomMap {
  const idx = indexOfHexAt(map, coord);
  if (idx < 0) {
    return map;
  }
  const area = Math.max(1, Math.floor(landArea) || 1);
  const hexes = [...(map.landHexes ?? [])];
  hexes[idx] = { ...hexes[idx], landArea: area };
  return mapWithCanonicalLandAreas({ ...map, landHexes: hexes });
}

/**
 * Add or replace a port at `edge` with the given type + facing. If a port already
 * sits on that edge it is replaced.
 */
export function placePort(
  map: CustomMap,
  edge: number,
  type: PortTypeName,
  facing: FacingName,
): CustomMap {
  const ports = [...(map.ports ?? [])];
  const idx = indexOfPortAt(map, edge);
  const port: MapPort = { type, edge: encodeCoord(edge), facing };
  if (idx >= 0) {
    ports[idx] = port;
  } else {
    ports.push(port);
  }
  return { ...map, ports };
}

/** Best-facing port placement: keep a legal preferred facing, otherwise face the adjacent land hex. */
export function placePortAutoFacing(
  map: CustomMap,
  edge: number,
  type: PortTypeName,
  preferredFacing: FacingName,
): CustomMap {
  return placePort(map, edge, type, bestPortFacing(map, edge, preferredFacing));
}

/** Remove any port at `edge` (no-op if none). Drops the `ports` field if it empties. */
export function clearPort(map: CustomMap, edge: number): CustomMap {
  const idx = indexOfPortAt(map, edge);
  if (idx < 0) {
    return map;
  }
  const ports = (map.ports ?? []).filter((_, i) => i !== idx);
  const next: CustomMap = { ...map };
  if (ports.length > 0) {
    next.ports = ports;
  } else {
    delete next.ports;
  }
  return next;
}

/** Set (or, if already set there, clear) the robber start hex. */
export function toggleRobber(map: CustomMap, coord: number): CustomMap {
  const next: CustomMap = { ...map };
  if (parseCoord(map.robberHex) === coord) {
    delete next.robberHex;
  } else {
    next.robberHex = encodeCoord(coord);
  }
  return next;
}

/** Set (or, if already set there, clear) the pirate start hex. */
export function togglePirate(map: CustomMap, coord: number): CustomMap {
  const next: CustomMap = { ...map };
  if (parseCoord(map.pirateHex) === coord) {
    delete next.pirateHex;
  } else {
    next.pirateHex = encodeCoord(coord);
  }
  return next;
}

/** Update the map name. */
export function setName(map: CustomMap, name: string): CustomMap {
  return { ...map, name };
}

/** Update the description (empty string removes the field on export, kept here for editing). */
export function setDescription(map: CustomMap, description: string): CustomMap {
  return { ...map, description };
}

/** Toggle whether `count` is in `playerCounts`, keeping the list sorted ascending. */
export function togglePlayerCount(map: CustomMap, count: number): CustomMap {
  const has = map.playerCounts.includes(count);
  const next = has
    ? map.playerCounts.filter((c) => c !== count)
    : [...map.playerCounts, count].sort((a, b) => a - b);
  return { ...map, playerCounts: next };
}

/** Replace the supported player-count list, deduped and sorted ascending. */
export function setPlayerCounts(map: CustomMap, counts: readonly number[]): CustomMap {
  const next = [...new Set(counts)].sort((a, b) => a - b);
  return { ...map, playerCounts: next };
}

/** Set the shuffle flag. */
export function setShuffle(map: CustomMap, shuffle: boolean): CustomMap {
  return { ...map, shuffle };
}

/** Set the board frame size, clamped to server limits and never smaller than existing content. */
export function setBoardSize(map: CustomMap, height: number, width: number): CustomMap {
  const clamped = clampBoardSize(height, width);
  const required = minimumBoardSizeForMap(map);
  return {
    ...map,
    boardHeight: Math.max(clamped.height, required.height),
    boardWidth: Math.max(clamped.width, required.width),
  };
}

function bestPortFacing(map: CustomMap, edge: number, preferredFacing: FacingName): FacingName {
  const preferredCode = FACING_CODE_BY_NAME[preferredFacing];
  let first: FacingName | null = null;
  for (const hex of map.landHexes ?? []) {
    if (!hex || (hex.type ?? '').toLowerCase() === 'water') {
      continue;
    }
    const coord = parseCoord(hex.coord);
    if (coord === null) {
      continue;
    }
    const code = facingForEdge(edge, coord);
    if (code === null) {
      continue;
    }
    const name = FACING_NAME_BY_CODE[code];
    if (name === undefined) {
      continue;
    }
    if (code === preferredCode) {
      return preferredFacing;
    }
    if (first === null) {
      first = name;
    }
  }
  return first ?? preferredFacing;
}

const FACING_CODE_BY_NAME: Readonly<Record<FacingName, number>> = {
  NE: 1,
  E: 2,
  SE: 3,
  SW: 4,
  W: 5,
  NW: 6,
};

const FACING_NAME_BY_CODE: Readonly<Record<number, FacingName>> = {
  1: 'NE',
  2: 'E',
  3: 'SE',
  4: 'SW',
  5: 'W',
  6: 'NW',
};
