// SOCNewGame — a new game (without options) was created.
// Ported from src/main/java/soc/message/SOCNewGame.java.
//
// Wire format:  NEWGAME SEP game
// The data portion is used verbatim as the game name (may carry the
// MARKER_THIS_GAME_UNJOINABLE prefix). No SEP2 parsing.

import { MessageType, SEP } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/**
 * Announcement that a new game was created. Mirrors Java {@code SOCNewGame}.
 */
export class SOCNewGame implements SOCMessage {
  readonly type = MessageType.NEWGAME;

  /**
   * @param game  name of the new game; may include the unjoinable marker prefix
   */
  constructor(readonly game: string) {}

  toCmd(): string {
    return `${MessageType.NEWGAME}${SEP}${this.game}`;
  }

  /** Parse the data portion (used directly as the game name). Never fails. */
  static parse(params: string): SOCNewGame {
    return new SOCNewGame(params);
  }
}

registerParser(MessageType.NEWGAME, SOCNewGame.parse);
