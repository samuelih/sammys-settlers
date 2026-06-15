// SOCFirstPlayer — server says which player number is first this game.
// Ported from src/main/java/soc/message/SOCFirstPlayer.java.
//
// Wire format:  FIRSTPLAYER SEP game SEP2 playerNumber
// Both fields always present. Parsing reads two SEP2 tokens (game, pn); a
// non-integer pn or a missing token is garbled -> null. In all-v2.0.00 games
// the server sends SOCGameElements(FIRST_PLAYER) instead.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseJavaInt } from '../javaInt';

/** Strict integer check matching Java Integer.parseInt. */
function parseIntStrict(s: string): number | null {
  return parseJavaInt(s);
}

/**
 * Announcement of the first player number. Mirrors Java {@code SOCFirstPlayer}.
 */
export class SOCFirstPlayer implements SOCMessage {
  readonly type = MessageType.FIRSTPLAYER;

  /** Name of the game. */
  readonly game: string;

  /** Seat number of the first player. */
  readonly playerNumber: number;

  /**
   * @param game          game name
   * @param playerNumber  first player's seat number
   */
  constructor(game: string, playerNumber: number) {
    this.game = game;
    this.playerNumber = playerNumber;
  }

  toCmd(): string {
    return `${MessageType.FIRSTPLAYER}${SEP}${this.game}${SEP2}${this.playerNumber}`;
  }

  /**
   * Parse the data portion. Mirrors Java: game = first SEP2 token, pn = second.
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCFirstPlayer | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 2) {
      return null;
    }
    const pn = parseIntStrict(tok[1]);
    if (pn === null) {
      return null;
    }
    return new SOCFirstPlayer(tok[0], pn);
  }
}

registerParser(MessageType.FIRSTPLAYER, SOCFirstPlayer.parse);
