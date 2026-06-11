// SOCGameServerText — a text announcement from the server within a game.
// Ported from src/main/java/soc/message/SOCGameServerText.java.
//
// Wire format:  GAMESERVERTEXT SEP game UNLIKELY_CHAR1 text
// NOTE: the separator between game and text is NOT SEP2 (',') but the unlikely
// control character (char) 1 (UNLIKELY_CHAR1 = ''), chosen so commas in
// the text don't need escaping. Parsing splits the data portion on that char
// into two tokens; garbled (missing text token) -> null. Robots ignore this
// message type.

import { MessageType, SEP } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/** The (char)1 token Java uses to separate the game name from the text. */
export const UNLIKELY_CHAR1 = '';

/**
 * Server text announcement in a game. Mirrors Java {@code SOCGameServerText}.
 */
export class SOCGameServerText implements SOCMessage {
  readonly type = MessageType.GAMESERVERTEXT;

  /** Name of the game. */
  readonly game: string;

  /** The announcement text. */
  readonly text: string;

  /**
   * @param game  game name
   * @param text  announcement text
   */
  constructor(game: string, text: string) {
    this.game = game;
    this.text = text;
  }

  toCmd(): string {
    return `${MessageType.GAMESERVERTEXT}${SEP}${this.game}${UNLIKELY_CHAR1}${this.text}`;
  }

  /**
   * Parse the data portion (game + UNLIKELY_CHAR1 + text). Java's StringTokenizer
   * skips empty tokens, so an empty game or text portion yields too few tokens
   * -> null.
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCGameServerText | null {
    const tok = params.split(UNLIKELY_CHAR1).filter((t) => t.length > 0);
    if (tok.length < 2) {
      return null;
    }
    return new SOCGameServerText(tok[0], tok[1]);
  }
}

registerParser(MessageType.GAMESERVERTEXT, SOCGameServerText.parse);
