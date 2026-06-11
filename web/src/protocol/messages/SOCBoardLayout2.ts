// SOCBoardLayout2 — the board's encoding version + layout as named "parts".
// Ported from src/main/java/soc/message/SOCBoardLayout2.java.
//
// Wire format:
//   BOARDLAYOUT2 SEP game SEP2 encodingFormat { SEP2 key SEP2 value }*
// Each value is either:
//   * a single base-10 int (stored as an Integer part), OR
//   * an int array, encoded as the token "[<len>" then <len> more SEP2 ints,
//     e.g.  LH SEP2 [3 SEP2 0x703 SEP2 3 SEP2 4
//
// For the v3 (large/sea) board the relevant parts are:
//   LH  land hexes: int array of 3*N entries, triples (hexCoord, hexType, diceNum)
//   PL  ports:      int array of 3*P entries: P port types, then P edge coords,
//                   then P facings (NOT interleaved)
//   RH  robber hex: single int (only sent if > 0)
//   PH  pirate hex: single int (sea board; only sent if > 0)
//   VS  visual shift: int array (an "added part", forwarded as-is)
//
// Parsing replicates SOCBoardLayout2.parseDataStr exactly, including value typing
// (single int vs "[len" array). Parts are kept in insertion order so re-encoding
// is byte-identical. NOTE: parts use base-10 ints on the wire (toCmd uses
// Integer.toString); the hexadecimal seen in toString()/logs is display-only.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/** Strict integer check matching Java Integer.parseInt (allows leading '-'). */
function parseIntStrict(s: string): number | null {
  if (!/^[+-]?\d+$/.test(s)) {
    return null;
  }
  return Number.parseInt(s, 10);
}

/** A single layout part: a scalar int or an int array, with its key. */
export interface LayoutPart {
  key: string;
  /** Either a single number (Integer part) or a number[] (int[] part). */
  value: number | number[];
}

/**
 * Board layout message with named parts. Mirrors Java {@code SOCBoardLayout2}.
 */
export class SOCBoardLayout2 implements SOCMessage {
  readonly type = MessageType.BOARDLAYOUT2;

  /** Name of the game. */
  readonly game: string;

  /** Board encoding format (3 = BOARD_ENCODING_LARGE / sea board). */
  readonly encodingFormat: number;

  /** Ordered layout parts, exactly as they appear on the wire. */
  readonly parts: readonly LayoutPart[];

  /**
   * @param game            game name
   * @param encodingFormat  board encoding format number
   * @param parts           ordered layout parts
   */
  constructor(game: string, encodingFormat: number, parts: readonly LayoutPart[]) {
    this.game = game;
    this.encodingFormat = encodingFormat;
    this.parts = parts;
  }

  /**
   * Get an int-array part by key, or null if absent or not an array.
   * (Unlike Java, does NOT remap "HL" water/desert — the web client only uses
   * the v3 "LH" part, which Java doesn't remap either.)
   */
  getIntArrayPart(key: string): number[] | null {
    for (const p of this.parts) {
      if (p.key === key) {
        return Array.isArray(p.value) ? p.value : null;
      }
    }
    return null;
  }

  /**
   * Get a scalar int part by key. Returns 0 if absent or not a scalar,
   * mirroring Java {@code getIntPart}.
   */
  getIntPart(key: string): number {
    for (const p of this.parts) {
      if (p.key === key) {
        return typeof p.value === 'number' ? p.value : 0;
      }
    }
    return 0;
  }

  toCmd(): string {
    let cmd = `${MessageType.BOARDLAYOUT2}${SEP}${this.game}${SEP2}${this.encodingFormat}`;
    for (const p of this.parts) {
      cmd += `${SEP2}${p.key}${SEP2}`;
      if (Array.isArray(p.value)) {
        cmd += `[${p.value.length}`;
        for (const v of p.value) {
          cmd += `${SEP2}${v}`;
        }
      } else {
        cmd += `${p.value}`;
      }
    }
    return cmd;
  }

  /**
   * Parse the data portion. Mirrors Java parseDataStr: read game and encoding
   * format, then repeatedly read (key, value) where a value starting with "["
   * is an array of the indicated length.
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCBoardLayout2 | null {
    // Java uses StringTokenizer on SEP2, which skips empty tokens.
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 2) {
      return null;
    }
    const game = tok[0];
    const bef = parseIntStrict(tok[1]);
    if (bef === null) {
      return null;
    }

    const parts: LayoutPart[] = [];
    let i = 2;
    while (i < tok.length) {
      const key = tok[i];
      ++i;
      if (i >= tok.length) {
        return null; // key without a value
      }
      const pvalue = tok[i];
      ++i;
      if (pvalue.startsWith('[')) {
        const lenStr = pvalue.substring(1);
        const n = parseIntStrict(lenStr);
        if (n === null || n < 0) {
          return null;
        }
        const arr: number[] = [];
        for (let k = 0; k < n; ++k) {
          if (i >= tok.length) {
            return null; // array shorter than declared length
          }
          const v = parseIntStrict(tok[i]);
          ++i;
          if (v === null) {
            return null;
          }
          arr.push(v);
        }
        parts.push({ key, value: arr });
      } else {
        const v = parseIntStrict(pvalue);
        if (v === null) {
          return null;
        }
        parts.push({ key, value: v });
      }
    }

    return new SOCBoardLayout2(game, bef, parts);
  }
}

registerParser(MessageType.BOARDLAYOUT2, SOCBoardLayout2.parse);
