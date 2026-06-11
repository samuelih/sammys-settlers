// Base SOCMessage type, parser registry, and encode/decode helpers.
//
// Ported from the dispatch logic in soc.message.SOCMessage.toMsg(String) and
// the per-class toCmd()/parseDataStr() contract. Pure TypeScript; no React.
//
// Wire format (see web/docs/MIGRATION_SPEC.md section 2):
//   <typeId><SEP><field1><SEP2><field2>...
// Multi-messages (SOCMessageMulti) may contain several SEP groups.

import { SEP } from './constants';

/**
 * A decoded protocol message. Every message exposes its numeric `type`
 * (matching a {@link MessageType} id) and can re-serialize itself via
 * {@link SOCMessage.toCmd}.
 */
export interface SOCMessage {
  /** The message-type id, as sent before the first SEP. */
  readonly type: number;
  /**
   * Serialize this message to its wire command string, exactly as the Java
   * class's `toCmd()` would. Does NOT include any transport framing.
   */
  toCmd(): string;
}

/**
 * A parser for one message type. Receives the raw data portion of the command
 * (everything after the first {@link SEP}), exactly as Java's `parseDataStr`
 * receives `data` from `toMsg`. For multi-messages it receives the full data
 * portion (still containing SEP separators) and is responsible for splitting.
 * Returns the parsed message, or `null` if the data is garbled.
 */
export type MessageParser = (params: string) => SOCMessage | null;

/**
 * Registry of type id -> parser, mirroring the switch in
 * `SOCMessage.toMsg(String)`. Each message module registers itself via
 * {@link registerParser}.
 */
const parserRegistry: Map<number, MessageParser> = new Map();

/**
 * Register a parser for a message-type id. Throws if a parser is already
 * registered for that id (catches accidental duplicate registration).
 *
 * @param type    the message-type id (e.g. {@link MessageType.VERSION})
 * @param parser  parser for that type's data portion
 */
export function registerParser(type: number, parser: MessageParser): void {
  if (parserRegistry.has(type)) {
    throw new Error(`Duplicate parser registration for message type ${type}`);
  }
  parserRegistry.set(type, parser);
}

/**
 * Encode a message to its wire command string. Thin wrapper over
 * {@link SOCMessage.toCmd} for symmetry with {@link decode}.
 *
 * @param msg  the message to encode
 * @returns the command string (no transport framing)
 */
export function encode(msg: SOCMessage): string {
  return msg.toCmd();
}

/**
 * Decode a wire command string into a {@link SOCMessage}.
 *
 * Mirrors `SOCMessage.toMsg(String)`: reads the integer type id up to the first
 * {@link SEP}, looks up the registered parser, and passes it the remaining data
 * portion. Returns `null` for an unknown/garbled type id or when the parser
 * rejects the data — matching Java, where unknown types are ignored.
 *
 * @param raw  one raw command string (one WebSocket text frame)
 * @returns the decoded message, or `null` if unparseable/unknown
 */
export function decode(raw: string): SOCMessage | null {
  const sepIdx = raw.indexOf(SEP);

  // Java reads the type id as the first SEP-delimited token via StringTokenizer.
  // A message with no SEP at all (e.g. multi-message with zero groups, like an
  // empty "1083") has its type id as the whole string and an empty data part.
  const typeStr = sepIdx === -1 ? raw : raw.substring(0, sepIdx);
  // Java's toMsg does Integer.parseInt(token) and returns null (via its outer
  // catch) on any non-integer token. JS Number.parseInt is lenient (it stops at
  // the first non-digit, so "1083abc" -> 1083), so reject tokens that Java's
  // Integer.parseInt would reject before dispatching. Integer.parseInt accepts
  // an optional leading +/- followed by digits only.
  if (!/^[+-]?\d+$/.test(typeStr)) {
    return null;
  }
  const type = Number.parseInt(typeStr, 10);
  if (!Number.isInteger(type)) {
    return null;
  }

  const parser = parserRegistry.get(type);
  if (parser === undefined) {
    // Unknown message type: ignored, as in Java's toMsg default branch.
    return null;
  }

  const data = sepIdx === -1 ? '' : raw.substring(sepIdx + 1);
  try {
    return parser(data);
  } catch {
    // Java's toMsg wraps parsing in try/catch and returns null on any error.
    return null;
  }
}

/**
 * Test-only: clear the parser registry. Not exported from the package index.
 * @internal
 */
export function _clearParsersForTest(): void {
  parserRegistry.clear();
}
