// SOCSetTurn — server sets the current player number (no other state change).
// Ported from src/main/java/soc/message/SOCSetTurn.java (extends SOCMessageTemplate1i).
//
// Wire format:  SETTURN SEP game SEP2 playerNumber
// In all-v2.0.00 games the server sends SOCGameElements(CURRENT_PLAYER) instead.
// Parsing reads two SEP2 tokens; garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/** Strict integer check matching Java Integer.parseInt. */
function parseIntStrict(s: string): number | null {
  if (!/^[+-]?\d+$/.test(s)) {
    return null;
  }
  return Number.parseInt(s, 10);
}

/**
 * Set the current player number. Mirrors Java {@code SOCSetTurn}.
 */
export class SOCSetTurn implements SOCMessage {
  readonly type = MessageType.SETTURN;

  /** Name of the game. */
  readonly game: string;

  /** Seat number of the new current player. */
  readonly playerNumber: number;

  /**
   * @param game          game name
   * @param playerNumber  current player's seat number
   */
  constructor(game: string, playerNumber: number) {
    this.game = game;
    this.playerNumber = playerNumber;
  }

  toCmd(): string {
    return `${MessageType.SETTURN}${SEP}${this.game}${SEP2}${this.playerNumber}`;
  }

  /**
   * Parse the data portion. Mirrors Java: game = first SEP2 token, pn = second.
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCSetTurn | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 2) {
      return null;
    }
    const pn = parseIntStrict(tok[1]);
    if (pn === null) {
      return null;
    }
    return new SOCSetTurn(tok[0], pn);
  }
}

registerParser(MessageType.SETTURN, SOCSetTurn.parse);
