// Shared game-option descriptor types + protocol (de)serialization.
//
// This is the single canonical TypeScript representation of a SOCGameOption,
// used by BOTH the protocol layer (which parses SOCGameOptionInfo /
// SOCGameOptionGetInfos wire data into these descriptors) and the New Game
// options UI (which renders one control per descriptor). Keep it free of React
// and network imports so it stays a pure, unit-testable type module.
//
// The optType string literals map from SOCGameOption's numeric OTYPE_* codes.
// IMPORTANT: the REAL OTYPE_* wire values are (verified against
// soc/game/SOCGameOption.java): UNKNOWN=0, BOOL=1, INT=2, INTBOOL=3, ENUM=4,
// ENUMBOOL=5, STR=6, STRHIDE=7. (An earlier migration note used a different,
// incorrect numbering; this module uses the real values via
// constants.ts OptionType.) The protocol layer translates numeric<->string
// here; the UI only ever sees the string form below.
//
// Value-packing format (Java SOCGameOption.packValue / packOptionsToString),
// verified byte-for-byte against the real class:
//   BOOL              -> "t" / "f"
//   INT, ENUM         -> integer (ENUM stored as a 1-based index)
//   INTBOOL, ENUMBOOL -> "t"/"f" immediately followed by the int (e.g. "t4")
//   STR, STRHIDE      -> the raw string value
//   UNKNOWN           -> "?"
// Pairs are "KEY=value", joined by SEP2 (comma). An empty set packs to "-".
//
// Java source: soc.game.SOCGameOption (OTYPE_* constants, value fields,
// packValue, packOptionsToString, parseOptionsToMap, parseOptionNameValue).

import { OptionType, OptionFlag, SEP2 } from './constants';
import type { SOCGameOptionInfo } from './messages/SOCGameOptionInfo';

/**
 * Logical kind of a game option, mirroring SOCGameOption OTYPE_* codes
 * (real wire values: UNKNOWN=0, BOOL=1, INT=2, INTBOOL=3, ENUM=4, ENUMBOOL=5,
 * STR=6, STRHIDE=7 — see {@link OptionType} in constants.ts).
 */
export type GameOptType =
  | 'bool'
  | 'int'
  | 'intbool'
  | 'enum'
  | 'enumbool'
  | 'str'
  | 'strhide'
  | 'unknown';

/**
 * One game option as presented to the New Game UI. The `default*` fields hold
 * the server-declared defaults; the `cur*` fields hold the player's currently
 * chosen value (the UI mutates a copy, never the original descriptor).
 */
export interface GameOptionDescriptor {
  /** Option keyname, e.g. "PL", "VP", "SC", "BC". */
  key: string;
  /** Control kind, derived from SOCGameOption OTYPE_*. */
  optType: GameOptType;
  /**
   * Human-readable description. May contain a `#` marker indicating where the
   * integer field should appear inline (SOCGameOption convention).
   */
  desc: string;
  /** Server default for BOOL / INTBOOL / ENUMBOOL boolean part. */
  defaultBoolValue?: boolean;
  /** Server default for INT / INTBOOL / ENUM / ENUMBOOL integer part. */
  defaultIntValue?: number;
  /** Inclusive minimum for INT / INTBOOL integer values. */
  minIntValue?: number;
  /** Inclusive maximum for INT / INTBOOL integer values. */
  maxIntValue?: number;
  /** Display strings for ENUM / ENUMBOOL choices (protocol is 1-indexed). */
  enumVals?: string[];
  /** Currently chosen boolean value (UI mutates a copy). */
  curBoolValue?: boolean;
  /** Currently chosen integer value (UI mutates a copy). */
  curIntValue?: number;
  /** Currently chosen string value for STR / STRHIDE (UI mutates a copy). */
  curStrValue?: string;
  /** Optional grouping key for laying out related options together. */
  group?: string;
  /** When true, the option is dropped from the request if left at default. */
  dropIfUnused?: boolean;
}

/**
 * Map a numeric OTYPE_* to the UI {@link GameOptType} name.
 * @param optType  OTYPE_* code from {@link OptionType}
 * @returns the matching type name; "unknown" for unrecognized codes
 */
export function optTypeName(optType: number): GameOptType {
  switch (optType) {
    case OptionType.OTYPE_BOOL:
      return 'bool';
    case OptionType.OTYPE_INT:
      return 'int';
    case OptionType.OTYPE_INTBOOL:
      return 'intbool';
    case OptionType.OTYPE_ENUM:
      return 'enum';
    case OptionType.OTYPE_ENUMBOOL:
      return 'enumbool';
    case OptionType.OTYPE_STR:
      return 'str';
    case OptionType.OTYPE_STRHIDE:
      return 'strhide';
    default:
      return 'unknown';
  }
}

/**
 * Map a {@link GameOptType} name back to its numeric OTYPE_* code.
 * @param name  UI type name
 * @returns the OTYPE_* code
 */
export function optTypeCode(name: GameOptType): number {
  switch (name) {
    case 'bool':
      return OptionType.OTYPE_BOOL;
    case 'int':
      return OptionType.OTYPE_INT;
    case 'intbool':
      return OptionType.OTYPE_INTBOOL;
    case 'enum':
      return OptionType.OTYPE_ENUM;
    case 'enumbool':
      return OptionType.OTYPE_ENUMBOOL;
    case 'str':
      return OptionType.OTYPE_STR;
    case 'strhide':
      return OptionType.OTYPE_STRHIDE;
    default:
      return OptionType.OTYPE_UNKNOWN;
  }
}

/** True if the descriptor's type uses an integer field (INT/INTBOOL/ENUM/ENUMBOOL). */
function usesInt(t: GameOptType): boolean {
  return t === 'int' || t === 'intbool' || t === 'enum' || t === 'enumbool';
}

/** True if the descriptor's type uses a boolean field (BOOL/INTBOOL/ENUMBOOL). */
function usesBool(t: GameOptType): boolean {
  return t === 'bool' || t === 'intbool' || t === 'enumbool';
}

/** True if the descriptor's type is string-valued (STR/STRHIDE). */
function usesStr(t: GameOptType): boolean {
  return t === 'str' || t === 'strhide';
}

/**
 * Build a {@link GameOptionDescriptor} from a parsed {@link SOCGameOptionInfo}.
 * The descriptor's current values are initialized from the info's current
 * values (the server's current new-game defaults).
 *
 * @param info  parsed option info from the server
 * @returns a descriptor suitable for the New Game UI
 */
export function descriptorFromInfo(
  info: SOCGameOptionInfo,
): GameOptionDescriptor {
  const optType = optTypeName(info.optType);
  const desc: GameOptionDescriptor = {
    key: info.key,
    optType,
    desc: info.desc,
    defaultBoolValue: info.defaultBoolValue,
    defaultIntValue: info.defaultIntValue,
    minIntValue: info.minIntValue,
    maxIntValue: info.maxIntValue,
    curBoolValue: info.curBoolValue,
    curIntValue: info.curIntValue,
    dropIfUnused: (info.optFlags & OptionFlag.FLAG_DROP_IF_UNUSED) !== 0,
  };
  if (info.curStrValue !== null) {
    desc.curStrValue = info.curStrValue;
  } else if (usesStr(optType)) {
    desc.curStrValue = '';
  }
  if (info.enumVals.length > 0) {
    desc.enumVals = [...info.enumVals];
  }
  return desc;
}

/**
 * Pack one descriptor's current value into the wire form, mirroring Java
 * {@code SOCGameOption.packValue}.
 *
 * @param d  the option descriptor
 * @returns the value string (e.g. "t", "4", "t13", "SC_NSHO", "?")
 */
export function packValue(d: GameOptionDescriptor): string {
  switch (d.optType) {
    case 'bool':
      return d.curBoolValue ? 't' : 'f';
    case 'int':
    case 'enum':
      return String(d.curIntValue ?? 0);
    case 'intbool':
    case 'enumbool':
      return `${d.curBoolValue ? 't' : 'f'}${d.curIntValue ?? 0}`;
    case 'str':
    case 'strhide':
      // Java appends strValue only if non-null; null/undefined -> empty.
      return d.curStrValue ?? '';
    default:
      return '?'; // unknown
  }
}

/**
 * Serialize a set of chosen option descriptors into the packed name-value
 * string the server expects (for SOCNewGameWithOptionsRequest etc.), mirroring
 * Java {@code SOCGameOption.packOptionsToString(omap, hideEmptyStringOpts, sortByKey)}.
 *
 *   * Empty / no options -> "-".
 *   * Each option emits "KEY=value"; pairs joined by SEP2 (comma).
 *   * hideEmptyStringOpts: omit STR/STRHIDE options whose value is "".
 *   * sortByKey: sort options by key (String.compareTo order); otherwise keep
 *     the iteration order of the input array.
 *   * Options of type "unknown" are skipped (as in Java for cliVers < 2.7.00).
 *
 * @param opts                 chosen descriptors
 * @param hideEmptyStringOpts  omit empty string-valued options (default false)
 * @param sortByKey            sort by key for a canonical string (default false)
 * @returns the packed options string, or "-" if empty
 */
export function serializeOptions(
  opts: readonly GameOptionDescriptor[],
  hideEmptyStringOpts = false,
  sortByKey = false,
): string {
  if (opts.length === 0) {
    return '-';
  }

  let list = opts.filter((o) => o.optType !== 'unknown');
  if (sortByKey) {
    // Java uses String.compareTo (UTF-16 code-unit order); JS string comparison
    // matches that for the ASCII keynames used here.
    list = [...list].sort((a, b) =>
      a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
    );
  }

  const pairs: string[] = [];
  for (const o of list) {
    if (
      hideEmptyStringOpts &&
      usesStr(o.optType) &&
      (o.curStrValue ?? '').length === 0
    ) {
      continue;
    }
    pairs.push(`${o.key}=${packValue(o)}`);
  }

  if (pairs.length === 0) {
    return '-';
  }
  return pairs.join(SEP2);
}

/** A single parsed option value's parts (whichever apply to its type). */
export interface ParsedOptionValue {
  boolValue?: boolean;
  intValue?: number;
  strValue?: string;
}

/**
 * Parse a packed options string (as produced by {@link serializeOptions} or the
 * Java server) into a map of key -> value parts. Requires the corresponding
 * descriptors to know each option's type, mirroring Java
 * {@code parseOptionsToMap} which clones from Known Options.
 *
 *   * "-" / "" -> empty map (Java returns null; here an empty map for ergonomics).
 *   * Leading / doubled commas are tolerated (StringTokenizer artifact).
 *   * An unknown key (no descriptor) is skipped (caller has no type to interpret it).
 *   * A malformed value throws, mirroring Java returning null on a parse error.
 *
 * @param ostr   packed options string
 * @param byKey  descriptors keyed by option key, to interpret each value
 * @returns map of key -> parsed value parts
 * @throws Error on a malformed option pair or value
 */
export function parseOptions(
  ostr: string,
  byKey: ReadonlyMap<string, GameOptionDescriptor>,
): Map<string, ParsedOptionValue> {
  const result = new Map<string, ParsedOptionValue>();
  if (ostr === '-' || ostr.length === 0) {
    return result;
  }

  // StringTokenizer on SEP2 skips empty tokens (leading/doubled commas).
  const pairs = ostr.split(SEP2).filter((p) => p.length > 0);
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq === -1) {
      throw new Error(`malformed option pair: ${pair}`);
    }
    const key = pair.substring(0, eq);
    const val = pair.substring(eq + 1);
    const d = byKey.get(key);
    if (d === undefined) {
      continue; // unknown option: no type to interpret
    }
    const t = d.optType;
    const parsed: ParsedOptionValue = {};

    if (t === 'bool') {
      if (val.length !== 1) {
        throw new Error(`malformed bool option: ${pair}`);
      }
      parsed.boolValue = parseBoolChar(val);
    } else if (usesBool(t)) {
      // intbool / enumbool: first char is the boolean, the rest is the int.
      parsed.boolValue = parseBoolChar(val.charAt(0));
      parsed.intValue = parseIntValue(val.substring(1));
    } else if (usesInt(t)) {
      parsed.intValue = parseIntValue(val);
    } else if (usesStr(t)) {
      parsed.strValue = val;
    }
    result.set(key, parsed);
  }
  return result;
}

/**
 * Extract the option keynames (in order) from a packed defaults string, as sent
 * by the server in its {@code SOCGameOptionGetDefaults} reply
 * ({@code SOCGameOption.packKnownOptionsToString}). Unlike {@link parseOptions},
 * this needs NO descriptors: it only reads the {@code KEY} before each '=', so it
 * works before any option types are known. The values are returned untouched in
 * the parallel map so callers can seed defaults once the full info arrives.
 *
 * The string is {@code KEY=value} pairs joined by SEP2 (comma). Empty
 * string-valued options are already omitted by the server (it packs with
 * {@code hideEmptyStringOpts=true}); leading/doubled commas (the StringTokenizer
 * artifact) are tolerated. A {@code "-"} or empty string yields an empty result.
 *
 * @param ostr  packed defaults string (e.g. "BC=t4,PL=4,SBL=f,VP=f10")
 * @returns the ordered keynames and a key -> raw-value-string map
 */
export function parseDefaultsKeys(ostr: string): {
  keys: string[];
  values: Map<string, string>;
} {
  const keys: string[] = [];
  const values = new Map<string, string>();
  if (ostr === '-' || ostr.length === 0) {
    return { keys, values };
  }
  // StringTokenizer on SEP2 skips empty tokens (leading/doubled commas).
  const pairs = ostr.split(SEP2).filter((p) => p.length > 0);
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    // A pair with no '=' is malformed; skip it (the server never emits one).
    if (eq <= 0) {
      continue;
    }
    const key = pair.substring(0, eq);
    if (!values.has(key)) {
      keys.push(key);
    }
    values.set(key, pair.substring(eq + 1));
  }
  return { keys, values };
}

/**
 * Apply a server default value (the raw packed value string from
 * {@link parseDefaultsKeys}) onto an already-typed descriptor. Sets both the
 * default and current value fields so the New Game dialog opens preselected to
 * the server's current new-game defaults. The descriptor's type drives parsing;
 * a malformed value is ignored (leaves the info-derived values in place).
 *
 * @param d         descriptor built from the full {@code SOCGameOptionInfo}
 * @param rawValue  the value substring after '=' from the defaults reply
 * @returns a new descriptor with default/current values merged in
 */
export function mergeDefaultValue(
  d: GameOptionDescriptor,
  rawValue: string,
): GameOptionDescriptor {
  const t = d.optType;
  try {
    if (t === 'bool') {
      if (rawValue.length !== 1) {
        return d;
      }
      const b = parseBoolChar(rawValue);
      return { ...d, defaultBoolValue: b, curBoolValue: b };
    }
    if (usesBool(t)) {
      const b = parseBoolChar(rawValue.charAt(0));
      const i = parseIntValue(rawValue.substring(1));
      return { ...d, defaultBoolValue: b, curBoolValue: b, defaultIntValue: i, curIntValue: i };
    }
    if (usesInt(t)) {
      const i = parseIntValue(rawValue);
      return { ...d, defaultIntValue: i, curIntValue: i };
    }
    if (usesStr(t)) {
      return { ...d, curStrValue: rawValue };
    }
  } catch {
    // Malformed default value: keep the info-derived values.
    return d;
  }
  return d;
}

/** Parse a boolean char accepting t/T/y/Y (true) and f/F/n/N (false). */
function parseBoolChar(c: string): boolean {
  switch (c) {
    case 't':
    case 'T':
    case 'y':
    case 'Y':
      return true;
    case 'f':
    case 'F':
    case 'n':
    case 'N':
      return false;
    default:
      throw new Error(`malformed bool value: ${c}`);
  }
}

/** Parse an integer value, throwing on non-integer (Java NumberFormatException). */
function parseIntValue(s: string): number {
  if (!/^[+-]?\d+$/.test(s)) {
    throw new Error(`malformed int value: ${s}`);
  }
  return Number.parseInt(s, 10);
}
