// SOCJoinGameAuth — server tells a client it may join a game.
// Ported from src/main/java/soc/message/SOCJoinGameAuth.java.
//
// Wire format:
//   JOINGAMEAUTH SEP game
//     [ SEP2 boardHeight SEP2 boardWidth
//       [ SEP2 'S' SEP2 layoutVS[0] SEP2 layoutVS[1] ... ] ]
//
// The height/width pair is only present for SOCBoardLarge games (otherwise the
// message is just "JOINGAMEAUTH SEP game"). The optional "S"-prefixed layoutVS
// array (Visual Shift) follows the dimensions; it must have length >= 2.
//
// Subtleties (verified against Java):
//   * If the data portion has no SEP2 at all, the whole thing is the game name
//     (height=width=0, layoutVS=null).
//   * The "S" marker distinguishes the layoutVS array; an unrecognized marker
//     where "S" was expected makes the message garbled -> null.
//   * layoutVS length < 2 -> garbled -> null (matches Java).

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseJavaInt } from '../javaInt';

/** Strict integer check: Java Integer.parseInt accepts optional sign + digits. */
function parseIntStrict(s: string): number | null {
  return parseJavaInt(s);
}

/**
 * Authorization to join a game, optionally carrying board dimensions and a
 * Visual Shift array for SOCBoardLarge. Mirrors Java {@code SOCJoinGameAuth}.
 */
export class SOCJoinGameAuth implements SOCMessage {
  readonly type = MessageType.JOINGAMEAUTH;

  /** Name of the game. */
  readonly game: string;

  /** Board height for SOCBoardLarge, or 0. */
  readonly boardHeight: number;

  /** Board width for SOCBoardLarge, or 0. */
  readonly boardWidth: number;

  /** Optional Visual Shift array (length >= 2), or null. */
  readonly layoutVS: readonly number[] | null;

  /**
   * @param game        game name
   * @param boardHeight board height, or 0 (default)
   * @param boardWidth  board width, or 0 (default)
   * @param layoutVS    optional "VS" array, length >= 2, or null
   * @throws Error if layoutVS is non-null but length < 2 (Java parity)
   */
  constructor(
    game: string,
    boardHeight = 0,
    boardWidth = 0,
    layoutVS: readonly number[] | null = null,
  ) {
    if (layoutVS !== null && layoutVS.length < 2) {
      throw new Error('layoutVS');
    }
    this.game = game;
    this.boardHeight = boardHeight;
    this.boardWidth = boardWidth;
    this.layoutVS = layoutVS;
  }

  toCmd(): string {
    let cmd = `${MessageType.JOINGAMEAUTH}${SEP}${this.game}`;
    if (this.boardHeight !== 0 || this.boardWidth !== 0) {
      cmd += `${SEP2}${this.boardHeight}${SEP2}${this.boardWidth}`;
      if (this.layoutVS !== null) {
        cmd += `${SEP2}S`;
        for (const elem of this.layoutVS) {
          cmd += `${SEP2}${elem}`;
        }
      }
    }
    return cmd;
  }

  /**
   * Parse the data portion. Mirrors Java's parseDataStr.
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCJoinGameAuth | null {
    if (params.indexOf(SEP2) === -1) {
      return new SOCJoinGameAuth(params, 0, 0, null);
    }

    const tok = params.split(SEP2);
    if (tok.length < 3) {
      // game + height + width minimum once a SEP2 is present.
      return null;
    }
    const game = tok[0];
    const bh = parseIntStrict(tok[1]);
    const bw = parseIntStrict(tok[2]);
    if (bh === null || bw === null) {
      return null;
    }

    let vs: number[] | null = null;
    if (tok.length > 3) {
      if (tok[3] !== 'S') {
        return null; // unrecognized optional-field marker
      }
      const rest = tok.slice(4);
      if (rest.length < 2) {
        return null;
      }
      vs = [];
      for (const r of rest) {
        const n = parseIntStrict(r);
        if (n === null) {
          return null;
        }
        vs.push(n);
      }
    }

    return new SOCJoinGameAuth(game, bh, bw, vs);
  }
}

registerParser(MessageType.JOINGAMEAUTH, SOCJoinGameAuth.parse);
