// SOCRollDice — client asks the server to roll the dice.
// Ported from src/main/java/soc/message/SOCRollDice.java.
//
// Wire format:  ROLLDICE SEP game
// The data portion is the bare game name (no SEP2 fields). Java's parseDataStr
// returns `new SOCRollDice(s)` unconditionally, so any data (including "")
// parses successfully.

import { MessageType, SEP } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/**
 * Request to roll the dice. Mirrors Java {@code SOCRollDice}.
 */
export class SOCRollDice implements SOCMessage {
  readonly type = MessageType.ROLLDICE;

  /** Name of the game. */
  readonly game: string;

  /**
   * @param game  game name
   */
  constructor(game: string) {
    this.game = game;
  }

  toCmd(): string {
    return `${MessageType.ROLLDICE}${SEP}${this.game}`;
  }

  /**
   * Parse the data portion (the game name). Always succeeds, matching Java.
   *
   * @returns the parsed message
   */
  static parse(params: string): SOCRollDice {
    return new SOCRollDice(params);
  }
}

registerParser(MessageType.ROLLDICE, SOCRollDice.parse);
