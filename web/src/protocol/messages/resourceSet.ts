// Shared resource-set encoding helpers for the trade / pick / robbery messages.
// Ported from the resource packing in soc.game.SOCResourceSet and the
// CLAY..WOOD loops used by many soc.message classes (SOCBankTrade, SOCMakeOffer,
// SOCAcceptOffer, SOCPickResources, etc).
//
// On the wire a resource set is almost always serialized as the five amounts
// CLAY, ORE, SHEEP, WHEAT, WOOD (resource type constants 1..5) in that order,
// each separated by SEP2. UNKNOWN resources (type 6) are NOT included in these
// five-int blocks; the Java loops run `for (i = CLAY; i <= WOOD; i++)`.
//
// SOCDiscard is the one exception: it appends a sixth UNKNOWN amount. That
// message builds its own field list, so it doesn't use this helper's 5-int form.

import { Resource, type ResourceValue } from '../constants';
import { parseJavaInt } from '../javaInt';

/**
 * A held set of resources, keyed by resource type. Amounts default to 0 when
 * absent. UNKNOWN (type 6) is tracked but never emitted by {@link giveGetToInts}.
 */
export interface ResourceSet {
  /** Clay (brick), resource type 1. */
  clay: number;
  /** Ore, resource type 2. */
  ore: number;
  /** Sheep (wool), resource type 3. */
  sheep: number;
  /** Wheat (grain), resource type 4. */
  wheat: number;
  /** Wood (lumber), resource type 5. */
  wood: number;
  /** Unknown resources, type 6 (used only by SOCDiscard's 6-int form). */
  unknown: number;
}

/** A resource set with every amount 0. */
export function emptyResourceSet(): ResourceSet {
  return { clay: 0, ore: 0, sheep: 0, wheat: 0, wood: 0, unknown: 0 };
}

/**
 * Build a {@link ResourceSet} from the five known amounts (and optional unknown).
 *
 * @param clay   clay amount
 * @param ore    ore amount
 * @param sheep  sheep amount
 * @param wheat  wheat amount
 * @param wood   wood amount
 * @param unknown unknown amount (default 0)
 */
export function resourceSet(
  clay: number,
  ore: number,
  sheep: number,
  wheat: number,
  wood: number,
  unknown = 0,
): ResourceSet {
  return { clay, ore, sheep, wheat, wood, unknown };
}

/**
 * The five known amounts CLAY..WOOD as an int array, in wire order. Does NOT
 * include the UNKNOWN amount, matching the Java `for (i = CLAY; i <= WOOD; i++)`
 * loops in the trade/pick messages.
 *
 * @param rs  the resource set
 * @returns `[clay, ore, sheep, wheat, wood]`
 */
export function giveGetToInts(rs: ResourceSet): number[] {
  return [rs.clay, rs.ore, rs.sheep, rs.wheat, rs.wood];
}

/**
 * Read five known amounts CLAY..WOOD from {@code tokens} starting at
 * {@code offset}, returning a {@link ResourceSet} (unknown = 0). The caller is
 * responsible for ensuring at least 5 tokens remain.
 *
 * @param amounts  parsed integer amounts (already validated as integers)
 * @param offset   index of the CLAY amount
 * @returns the resource set, or null if any amount is missing
 */
export function resourceSetFromInts(amounts: number[], offset: number): ResourceSet | null {
  if (offset + 5 > amounts.length) {
    return null;
  }
  return {
    clay: amounts[offset],
    ore: amounts[offset + 1],
    sheep: amounts[offset + 2],
    wheat: amounts[offset + 3],
    wood: amounts[offset + 4],
    unknown: 0,
  };
}

/**
 * Get the amount of one resource type from a set.
 *
 * @param rs    the resource set
 * @param type  a {@link ResourceValue} (CLAY=1..WOOD=5, UNKNOWN=6)
 */
export function getAmount(rs: ResourceSet, type: ResourceValue): number {
  switch (type) {
    case Resource.CLAY:
      return rs.clay;
    case Resource.ORE:
      return rs.ore;
    case Resource.SHEEP:
      return rs.sheep;
    case Resource.WHEAT:
      return rs.wheat;
    case Resource.WOOD:
      return rs.wood;
    case Resource.UNKNOWN:
      return rs.unknown;
    default:
      return 0;
  }
}

/**
 * Set the amount of one resource type in a set, in place.
 *
 * @param rs      the resource set (mutated)
 * @param amount  the new amount
 * @param type    a {@link ResourceValue} (CLAY=1..WOOD=5, UNKNOWN=6)
 */
export function setAmount(rs: ResourceSet, amount: number, type: ResourceValue): void {
  switch (type) {
    case Resource.CLAY:
      rs.clay = amount;
      break;
    case Resource.ORE:
      rs.ore = amount;
      break;
    case Resource.SHEEP:
      rs.sheep = amount;
      break;
    case Resource.WHEAT:
      rs.wheat = amount;
      break;
    case Resource.WOOD:
      rs.wood = amount;
      break;
    case Resource.UNKNOWN:
      rs.unknown = amount;
      break;
    default:
      break;
  }
}

/** Strict integer check matching Java Integer.parseInt (allows leading sign). */
export function parseIntStrict(s: string): number | null {
  return parseJavaInt(s);
}
