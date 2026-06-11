// SOCSetSpecialItem — pick, set, or clear a Special Item in the game's and/or
// the owning player's Special Item list. Used by the _SC_WOND scenario's
// Wonders and the Cities & Knights city-improvement tracks ('_CK_IMP/T',
// '_CK_IMP/P', '_CK_IMP/S'; see doc/Cities-and-Knights-Implemented.md).
// Ported from src/main/java/soc/message/SOCSetSpecialItem.java. @since 2.0.00
//
// Wire format:
//   SETSPECIALITEM SEP game SEP2 op SEP2 typeKey SEP2 gameItemIndex
//     SEP2 playerItemIndex SEP2 playerNumber SEP2 coord SEP2 level SEP2 sv
// All 9 fields are always present. A null sv is sent as EMPTYSTR (TAB) and
// mapped back to null on parse; sv is never "" on the wire. op is a
// SpecialItemOp (OP_SET=1, OP_CLEAR=2, OP_PICK=3, OP_DECLINE=4, OP_SET_PICK=5,
// OP_CLEAR_PICK=6 — verified plain 5/6, NOT a 16+n bit encoding).
//
// Parse subtleties (matching Java):
//  * Java's constructor throws (-> parseDataStr returns null) when:
//    typeKey missing; pn != -1 but pi == -1; gi == -1 AND pi == -1;
//    sv non-null but fails SOCMessage.isSingleLineAndSafe.
//  * The Java client sends OP_PICK requests with pn = -1 (the server uses the
//    requester's own seat; see GameMessageSender.pickSpecialItem), gi/pi as
//    needed, coord = -1, level = 0, sv = null.
//  * An sv of "" is normalized to null (Java: `sv.length() > 0 ? sv : null`);
//    it can't appear on the wire anyway (StringTokenizer skips empty tokens).

import { EMPTYSTR, MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseIntStrict } from './resourceSet';

/**
 * Java {@code SOCMessage.isSingleLineAndSafe(s)}: non-empty, no SEP/SEP2, no
 * ISO control chars, no space chars outside category SPACE_SEPARATOR (the only
 * non-Zs Java "space chars" are U+2028 line / U+2029 paragraph separator).
 */
function isSingleLineAndSafe(s: string): boolean {
  if (s.length === 0) {
    return false;
  }
  if (s.includes(SEP) || s.includes(SEP2)) {
    return false;
  }
  return !/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(s);
}

/**
 * Pick/set/clear a Special Item. Mirrors Java {@code SOCSetSpecialItem}.
 */
export class SOCSetSpecialItem implements SOCMessage {
  readonly type = MessageType.SETSPECIALITEM;

  /** Name of the game. */
  readonly game: string;

  /** Operation code ({@link SpecialItemOp} value). */
  readonly op: number;

  /** Special item type key (e.g. '_SC_WOND', '_CK_IMP/T'). */
  readonly typeKey: string;

  /** Index in the game's Special Item list, or -1. */
  readonly gameItemIndex: number;

  /** Index in the owning player's Special Item list, or -1. If used, {@link playerNumber} must be != -1. */
  readonly playerItemIndex: number;

  /** Owning player number, or -1. A client request sends -1; the server ignores this field from clients. */
  readonly playerNumber: number;

  /** Optional coordinate on the board (edge or node, per item type), or -1. */
  readonly coord: number;

  /** Optional level of construction or strength, or 0. */
  readonly level: number;

  /** Optional string value from the item, or null. Never "". */
  readonly sv: string | null;

  /**
   * @param game     game name
   * @param op       operation code ({@link SpecialItemOp} value)
   * @param typeKey  special item type key
   * @param gi       game item index, or -1
   * @param pi       player item index, or -1 (required != -1 when pn != -1)
   * @param pn       owning player number, or -1
   * @param coord    optional board coordinate, or -1 (default)
   * @param level    optional built level/strength, or 0 (default)
   * @param sv       optional string value, or null (default); "" is stored as null
   * @throws Error   when the field combination is invalid (Java IllegalArgumentException):
   *                 empty typeKey, pn != -1 with pi == -1, gi == -1 with pi == -1,
   *                 or sv failing isSingleLineAndSafe
   */
  constructor(
    game: string,
    op: number,
    typeKey: string,
    gi: number,
    pi: number,
    pn: number,
    coord = -1,
    level = 0,
    sv: string | null = null,
  ) {
    // Java: if ((ga == null) || (typeKey == null) || ((pn != -1) && (pi == -1))
    //     || ((pi == -1) && (gi == -1))
    //     || ((sv != null) && ! SOCMessage.isSingleLineAndSafe(sv))) throw ...
    if (
      typeKey.length === 0 ||
      (pn !== -1 && pi === -1) ||
      (pi === -1 && gi === -1) ||
      (sv !== null && !isSingleLineAndSafe(sv))
    ) {
      throw new Error('SOCSetSpecialItem: invalid field combination');
    }

    this.game = game;
    this.op = op;
    this.typeKey = typeKey;
    this.gameItemIndex = gi;
    this.playerItemIndex = pi;
    this.playerNumber = pn;
    this.coord = coord;
    this.level = level;
    this.sv = sv !== null && sv.length > 0 ? sv : null;
  }

  toCmd(): string {
    const svStr = this.sv !== null ? this.sv : EMPTYSTR;

    return (
      `${MessageType.SETSPECIALITEM}${SEP}${this.game}` +
      `${SEP2}${this.op}${SEP2}${this.typeKey}` +
      `${SEP2}${this.gameItemIndex}${SEP2}${this.playerItemIndex}` +
      `${SEP2}${this.playerNumber}${SEP2}${this.coord}${SEP2}${this.level}` +
      `${SEP2}${svStr}`
    );
  }

  /**
   * Parse the data portion (game, op, typeKey, gi, pi, pn, co, lv, sv).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCSetSpecialItem | null {
    // StringTokenizer skips empty tokens; EMPTYSTR is a TAB so it survives.
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 9) {
      return null;
    }
    const op = parseIntStrict(tok[1]);
    const gi = parseIntStrict(tok[3]);
    const pi = parseIntStrict(tok[4]);
    const pn = parseIntStrict(tok[5]);
    const co = parseIntStrict(tok[6]);
    const lv = parseIntStrict(tok[7]);
    if (op === null || gi === null || pi === null || pn === null || co === null || lv === null) {
      return null;
    }
    const sv = tok[8] === EMPTYSTR ? null : tok[8];

    try {
      return new SOCSetSpecialItem(tok[0], op, tok[2], gi, pi, pn, co, lv, sv);
    } catch {
      // Java's parseDataStr catches the constructor's IllegalArgumentException.
      return null;
    }
  }
}

registerParser(MessageType.SETSPECIALITEM, SOCSetSpecialItem.parse);
