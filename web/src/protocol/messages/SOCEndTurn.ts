// SOCEndTurn — client asks to end its turn.
// Ported from src/main/java/soc/message/SOCEndTurn.java.
//
// Wire format:  ENDTURN SEP game
// The data portion is the bare game name. Java's parseDataStr returns
// `new SOCEndTurn(s)` unconditionally.

import { MessageType, SEP } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/**
 * Request to end the current player's turn. Mirrors Java {@code SOCEndTurn}.
 */
export class SOCEndTurn implements SOCMessage {
  readonly type = MessageType.ENDTURN;

  /** Name of the game. */
  readonly game: string;

  /**
   * @param game  game name
   */
  constructor(game: string) {
    this.game = game;
  }

  toCmd(): string {
    return `${MessageType.ENDTURN}${SEP}${this.game}`;
  }

  /**
   * Parse the data portion (the game name). Always succeeds, matching Java.
   *
   * @returns the parsed message
   */
  static parse(params: string): SOCEndTurn {
    return new SOCEndTurn(params);
  }
}

registerParser(MessageType.ENDTURN, SOCEndTurn.parse);
