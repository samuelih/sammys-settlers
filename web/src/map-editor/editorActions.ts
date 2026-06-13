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
import {
  boardSizeForMap,
  candidatePortEdgesWithin,
  clampBoardSize,
  edgesAroundHex,
  hexToPixel,
  legalFacingsForEdge,
  minimumBoardSizeForMap,
} from './editorGrid';
import { adjacentHexToEdge } from './validation';

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
  return pruneInvalidPorts(mapWithCanonicalLandAreas({ ...map, landHexes: hexes }));
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
  return pruneInvalidPorts(mapWithCanonicalLandAreas(next));
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
  if (!coastPortEdgeCoords(map).has(edge)) {
    return map;
  }
  const facing = bestPortFacing(map, edge, preferredFacing);
  return facing !== null ? placePort(map, edge, type, facing) : map;
}

/** Place a port on the best open coastline edge around the clicked hex. */
export function placePortNearHex(
  map: CustomMap,
  hexCoord: number,
  type: PortTypeName,
  preferredFacing: FacingName,
): CustomMap {
  const edge = bestOpenPortEdgeNearHex(map, hexCoord);
  if (edge === null) {
    return map;
  }
  return placePortAutoFacing(map, edge, type, preferredFacing);
}

/** Clear the port touching `hexCoord` which is nearest in map order. */
export function clearNearestPortToHex(map: CustomMap, hexCoord: number): CustomMap {
  const edges = new Set(edgesAroundHex(hexCoord));
  for (const port of map.ports ?? []) {
    const edge = parseCoord(port.edge);
    if (edge !== null && edges.has(edge)) {
      return clearPort(map, edge);
    }
  }
  return map;
}

/** Replace all ports with a balanced, evenly-spaced coastline recommendation. */
export function smartFillPorts(map: CustomMap): CustomMap {
  const candidates = smartPortCandidates(map);
  if (candidates.length === 0) {
    return clearAllPorts(map);
  }

  const target = Math.min(candidates.length, recommendedPortCount(map));
  if (target <= 0) {
    return clearAllPorts(map);
  }

  const selected = selectDistributedPorts(candidates, target);
  const types = recommendedPortTypes(map, target);
  const ports = selected.map((candidate, i): MapPort => ({
    type: types[i % types.length],
    edge: encodeCoord(candidate.edge),
    facing: candidate.facing,
  }));
  return { ...map, ports };
}

/** Remove every port from the map. */
export function clearAllPorts(map: CustomMap): CustomMap {
  const next: CustomMap = { ...map };
  delete next.ports;
  return next;
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

function bestPortFacing(map: CustomMap, edge: number, preferredFacing: FacingName): FacingName | null {
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
    const name = legalFacingForEdgeToHex(edge, coord);
    if (name === null) {
      continue;
    }
    if (FACING_CODE_BY_NAME[name] === preferredCode) {
      return preferredFacing;
    }
    if (first === null) {
      first = name;
    }
  }
  return first;
}

function legalFacingForEdgeToHex(edge: number, hex: number): FacingName | null {
  for (const facing of legalFacingsForEdge(edge)) {
    const name = facing as FacingName;
    if (adjacentHexToEdge(edge, FACING_CODE_BY_NAME[name]) === hex) {
      return name;
    }
  }
  return null;
}

const FACING_CODE_BY_NAME: Readonly<Record<FacingName, number>> = {
  NE: 1,
  E: 2,
  SE: 3,
  SW: 4,
  W: 5,
  NW: 6,
};

interface SmartPortCandidate {
  edge: number;
  facing: FacingName;
  x: number;
  y: number;
  angle: number;
}

function bestOpenPortEdgeNearHex(map: CustomMap, hexCoord: number): number | null {
  const occupied = new Set((map.ports ?? []).map((port) => parseCoord(port.edge)).filter(isNumber));
  const candidates = smartPortCandidates(map).filter(
    (candidate) => !occupied.has(candidate.edge) && legalFacingForEdgeToHex(candidate.edge, hexCoord) !== null,
  );
  if (candidates.length === 0) {
    return null;
  }

  const existing = smartPortCandidates({ ...map, ports: map.ports ?? [] }).filter((candidate) =>
    occupied.has(candidate.edge),
  );
  candidates.sort((a, b) => {
    const da = nearestPortDistance(a, existing);
    const db = nearestPortDistance(b, existing);
    if (db !== da) {
      return db - da;
    }
    return a.edge - b.edge;
  });
  return candidates[0].edge;
}

function pruneInvalidPorts(map: CustomMap): CustomMap {
  const ports = map.ports ?? [];
  if (ports.length === 0) {
    return map;
  }

  const nextPorts: MapPort[] = [];
  const seen = new Set<number>();
  const coastEdges = coastPortEdgeCoords(map);
  let changed = false;
  for (const port of ports) {
    const edge = parseCoord(port.edge);
    if (edge === null || seen.has(edge) || !coastEdges.has(edge)) {
      changed = true;
      continue;
    }
    const facing = bestPortFacing(map, edge, normalizeFacing(port.facing));
    if (facing === null) {
      changed = true;
      continue;
    }
    seen.add(edge);
    const nextEdge = encodeCoord(edge);
    if (nextEdge !== port.edge || facing !== port.facing) {
      changed = true;
    }
    nextPorts.push({ type: port.type, edge: nextEdge, facing });
  }

  if (!changed) {
    return map;
  }
  return nextPorts.length > 0 ? { ...map, ports: nextPorts } : clearAllPorts(map);
}

function coastPortEdgeCoords(map: CustomMap): Set<number> {
  const size = boardSizeForMap(map);
  return new Set(
    candidatePortEdgesWithin(nonWaterLandCoords(map), size.height, size.width).map((edge) => edge.coord),
  );
}

function smartPortCandidates(map: CustomMap): SmartPortCandidate[] {
  const landCoords = nonWaterLandCoords(map);
  const size = boardSizeForMap(map);
  const coastEdges = candidatePortEdgesWithin(landCoords, size.height, size.width);
  const center = centroid(landCoords);
  const out: SmartPortCandidate[] = [];

  for (const edge of coastEdges) {
    const facing = bestPortFacing(map, edge.coord, 'SE');
    if (facing === null) {
      continue;
    }
    out.push({
      edge: edge.coord,
      facing,
      x: edge.mid.x,
      y: edge.mid.y,
      angle: Math.atan2(edge.mid.y - center.y, edge.mid.x - center.x),
    });
  }

  out.sort((a, b) => a.angle - b.angle || a.edge - b.edge);
  return out;
}

function selectDistributedPorts(candidates: SmartPortCandidate[], count: number): SmartPortCandidate[] {
  if (count >= candidates.length) {
    return candidates;
  }

  const selected: SmartPortCandidate[] = [];
  const used = new Set<number>();
  const step = candidates.length / count;
  for (let i = 0; i < count; ++i) {
    const target = Math.round(i * step) % candidates.length;
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let offset = 0; offset < candidates.length; ++offset) {
      for (const idx of uniqueCandidateIndexes(target, offset, candidates.length)) {
        if (used.has(idx)) {
          continue;
        }
        const candidate = candidates[idx];
        const spacing = nearestPortDistance(candidate, selected);
        const score = spacing - offset * 20;
        if (score > bestScore) {
          bestIdx = idx;
          bestScore = score;
        }
      }
      if (bestIdx >= 0 && bestScore > 70) {
        break;
      }
    }

    if (bestIdx >= 0) {
      used.add(bestIdx);
      selected.push(candidates[bestIdx]);
    }
  }

  selected.sort((a, b) => a.angle - b.angle || a.edge - b.edge);
  return selected;
}

function uniqueCandidateIndexes(center: number, offset: number, length: number): number[] {
  const a = (center + offset) % length;
  const b = (center - offset + length) % length;
  return a === b ? [a] : [a, b];
}

function recommendedPortCount(map: CustomMap): number {
  const landHexes = nonWaterLandCoords(map).length;
  if (landHexes === 0) {
    return 0;
  }
  const maxPlayers = Math.max(0, ...(map.playerCounts ?? []));
  const byLand = Math.round((landHexes * 9) / 19);
  const playerFloor = maxPlayers >= 6 ? 8 : maxPlayers >= 3 ? 5 : 3;
  return clampNumber(Math.max(playerFloor, byLand), 3, 12);
}

function recommendedPortTypes(map: CustomMap, count: number): PortTypeName[] {
  const resources = resourceScores(map)
    .sort((a, b) => b.score - a.score || a.type.localeCompare(b.type))
    .map((entry) => entry.type);
  const miscCount = clampNumber(Math.round(count * 0.45), 1, Math.max(1, count - Math.min(resources.length, count)));
  const out: PortTypeName[] = [];
  for (let i = 0; i < miscCount && out.length < count; ++i) {
    out.push('misc');
  }
  for (let i = 0; out.length < count && resources.length > 0; ++i) {
    out.push(resources[i % resources.length]);
  }
  while (out.length < count) {
    out.push('misc');
  }
  return out;
}

function resourceScores(map: CustomMap): Array<{ type: PortTypeName; score: number }> {
  const scores = new Map<PortTypeName, number>();
  for (const hex of map.landHexes ?? []) {
    const type = (hex.type ?? '').toLowerCase() as PortTypeName;
    if (!RESOURCE_PORT_TYPES.has(type)) {
      continue;
    }
    scores.set(type, (scores.get(type) ?? 0) + (DICE_PIPS[hex.diceNum] ?? 1));
  }
  return [...scores.entries()].map(([type, score]) => ({ type, score }));
}

function nonWaterLandCoords(map: CustomMap): number[] {
  const coords: number[] = [];
  for (const hex of map.landHexes ?? []) {
    if (!hex || (hex.type ?? '').toLowerCase() === 'water') {
      continue;
    }
    const coord = parseCoord(hex.coord);
    if (coord !== null) {
      coords.push(coord);
    }
  }
  return coords;
}

function centroid(coords: number[]): { x: number; y: number } {
  if (coords.length === 0) {
    return { x: 0, y: 0 };
  }
  let x = 0;
  let y = 0;
  for (const coord of coords) {
    const point = hexToPixel(coord);
    x += point.x;
    y += point.y;
  }
  return { x: x / coords.length, y: y / coords.length };
}

function nearestPortDistance(candidate: SmartPortCandidate, selected: SmartPortCandidate[]): number {
  if (selected.length === 0) {
    return 9999;
  }
  let min = Infinity;
  for (const port of selected) {
    const dx = candidate.x - port.x;
    const dy = candidate.y - port.y;
    min = Math.min(min, Math.sqrt(dx * dx + dy * dy));
  }
  return min;
}

function normalizeFacing(facing: string): FacingName {
  const uc = (facing ?? '').toUpperCase();
  return FACING_CODE_BY_NAME[uc as FacingName] !== undefined ? (uc as FacingName) : 'SE';
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isNumber(value: number | null): value is number {
  return value !== null;
}

const RESOURCE_PORT_TYPES: ReadonlySet<PortTypeName> = new Set(['clay', 'ore', 'sheep', 'wheat', 'wood']);

const DICE_PIPS: Readonly<Record<number, number>> = {
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
};
