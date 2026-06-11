// SOCDevCardCount — number of dev cards left in the deck to buy.
// Ported from src/main/java/soc/message/SOCDevCardCount.java.
//
// Wire format:  DEVCARDCOUNT SEP game SEP2 numDevCards
// Sent to clients older than v2.0.00; newer clients get
// SOCGameElements(DEV_CARD_COUNT) instead. Parsing reads two SEP2 tokens;
// garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseIntStrict } from './resourceSet';

/**
 * Remaining dev-card count. Mirrors Java {@code SOCDevCardCount}.
 */
export class SOCDevCardCount implements SOCMessage {
  readonly type = MessageType.DEVCARDCOUNT;

  /** Name of the game. */
  readonly game: string;

  /** Number of dev cards remaining in the deck. */
  readonly numDevCards: number;

  /**
   * @param game         game name
   * @param numDevCards  remaining dev-card count
   */
  constructor(game: string, numDevCards: number) {
    this.game = game;
    this.numDevCards = numDevCards;
  }

  toCmd(): string {
    return `${MessageType.DEVCARDCOUNT}${SEP}${this.game}${SEP2}${this.numDevCards}`;
  }

  /**
   * Parse the data portion (game, numDevCards).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCDevCardCount | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 2) {
      return null;
    }
    const nd = parseIntStrict(tok[1]);
    if (nd === null) {
      return null;
    }
    return new SOCDevCardCount(tok[0], nd);
  }
}

registerParser(MessageType.DEVCARDCOUNT, SOCDevCardCount.parse);
