// SOCLargestArmy — server says which player has Largest Army, or -1.
// Ported from src/main/java/soc/message/SOCLargestArmy.java.
//
// Wire format:  LARGESTARMY SEP game SEP2 playerNumber
// In all-v2.0.00 games the server sends SOCGameElements(LARGEST_ARMY_PLAYER)
// instead. Parsing reads two SEP2 tokens; garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseJavaInt } from '../javaInt';

/** Strict integer check matching Java Integer.parseInt. */
function parseIntStrict(s: string): number | null {
  return parseJavaInt(s);
}

/**
 * Announcement of the Largest Army player. Mirrors Java {@code SOCLargestArmy}.
 */
export class SOCLargestArmy implements SOCMessage {
  readonly type = MessageType.LARGESTARMY;

  /** Name of the game. */
  readonly game: string;

  /** Seat number of the player with Largest Army, or -1 for none. */
  readonly playerNumber: number;

  /**
   * @param game          game name
   * @param playerNumber  player's seat number, or -1
   */
  constructor(game: string, playerNumber: number) {
    this.game = game;
    this.playerNumber = playerNumber;
  }

  toCmd(): string {
    return `${MessageType.LARGESTARMY}${SEP}${this.game}${SEP2}${this.playerNumber}`;
  }

  /**
   * Parse the data portion. Mirrors Java: game = first SEP2 token, pn = second.
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCLargestArmy | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 2) {
      return null;
    }
    const pn = parseIntStrict(tok[1]);
    if (pn === null) {
      return null;
    }
    return new SOCLargestArmy(tok[0], pn);
  }
}

registerParser(MessageType.LARGESTARMY, SOCLargestArmy.parse);
