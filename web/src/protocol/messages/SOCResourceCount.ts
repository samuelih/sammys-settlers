// SOCResourceCount — server reports a player's total resource count.
// Ported from src/main/java/soc/message/SOCResourceCount.java.
//
// Wire format:  RESOURCECOUNT SEP game SEP2 playerNumber SEP2 count
// `count` includes known + unknown resources. In all-v2.0.00 games the server
// uses SOCPlayerElement(RESOURCE_COUNT) instead. Parsing reads three SEP2
// tokens; garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseJavaInt } from '../javaInt';

/** Strict integer check matching Java Integer.parseInt. */
function parseIntStrict(s: string): number | null {
  return parseJavaInt(s);
}

/**
 * A player's total resource count. Mirrors Java {@code SOCResourceCount}.
 */
export class SOCResourceCount implements SOCMessage {
  readonly type = MessageType.RESOURCECOUNT;

  /** Name of the game. */
  readonly game: string;

  /** Seat number. */
  readonly playerNumber: number;

  /** Total resource count (known + unknown). */
  readonly count: number;

  /**
   * @param game          game name
   * @param playerNumber  seat number
   * @param count         total resource count
   */
  constructor(game: string, playerNumber: number, count: number) {
    this.game = game;
    this.playerNumber = playerNumber;
    this.count = count;
  }

  toCmd(): string {
    return `${MessageType.RESOURCECOUNT}${SEP}${this.game}${SEP2}${this.playerNumber}${SEP2}${this.count}`;
  }

  /**
   * Parse the data portion (game, playerNumber, count).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCResourceCount | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 3) {
      return null;
    }
    const pn = parseIntStrict(tok[1]);
    const count = parseIntStrict(tok[2]);
    if (pn === null || count === null) {
      return null;
    }
    return new SOCResourceCount(tok[0], pn, count);
  }
}

registerParser(MessageType.RESOURCECOUNT, SOCResourceCount.parse);
