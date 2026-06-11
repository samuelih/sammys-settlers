// SOCDeleteGame — a game was destroyed.
// Ported from src/main/java/soc/message/SOCDeleteGame.java.
//
// Wire format:  DELETEGAME SEP game
// The data portion is used verbatim as the game name (no unjoinable marker;
// no SEP2 parsing).

import { MessageType, SEP } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/**
 * Announcement that a game was destroyed. Mirrors Java {@code SOCDeleteGame}.
 */
export class SOCDeleteGame implements SOCMessage {
  readonly type = MessageType.DELETEGAME;

  /**
   * @param game  name of the destroyed game
   */
  constructor(readonly game: string) {}

  toCmd(): string {
    return `${MessageType.DELETEGAME}${SEP}${this.game}`;
  }

  /** Parse the data portion (used directly as the game name). Never fails. */
  static parse(params: string): SOCDeleteGame {
    return new SOCDeleteGame(params);
  }
}

registerParser(MessageType.DELETEGAME, SOCDeleteGame.parse);
