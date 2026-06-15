// SOCLongestRoad — server says which player has Longest Road/Route, or -1.
// Ported from src/main/java/soc/message/SOCLongestRoad.java.
//
// Wire format:  LONGESTROAD SEP game SEP2 playerNumber
// In all-v2.0.00 games the server sends SOCGameElements(LONGEST_ROAD_PLAYER)
// instead. Parsing reads two SEP2 tokens; garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseJavaInt } from '../javaInt';

/** Strict integer check matching Java Integer.parseInt. */
function parseIntStrict(s: string): number | null {
  return parseJavaInt(s);
}

/**
 * Announcement of the Longest Road player. Mirrors Java {@code SOCLongestRoad}.
 */
export class SOCLongestRoad implements SOCMessage {
  readonly type = MessageType.LONGESTROAD;

  /** Name of the game. */
  readonly game: string;

  /** Seat number of the player with Longest Road, or -1 for none. */
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
    return `${MessageType.LONGESTROAD}${SEP}${this.game}${SEP2}${this.playerNumber}`;
  }

  /**
   * Parse the data portion. Mirrors Java: game = first SEP2 token, pn = second.
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCLongestRoad | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 2) {
      return null;
    }
    const pn = parseIntStrict(tok[1]);
    if (pn === null) {
      return null;
    }
    return new SOCLongestRoad(tok[0], pn);
  }
}

registerParser(MessageType.LONGESTROAD, SOCLongestRoad.parse);
