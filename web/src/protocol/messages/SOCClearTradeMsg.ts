// SOCClearTradeMsg — server wants trade messages/responses cleared in the client UI.
// Ported from src/main/java/soc/message/SOCClearTradeMsg.java.
//
// Wire format:  CLEARTRADEMSG SEP game SEP2 playerNumber
// playerNumber -1 means "all players clear trade messages" (since v1.1.12).
// Sent immediately after a SOCMakeOffer to clear responses from any prior offer.
// Parsing reads two SEP2 tokens; garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseIntStrict } from './resourceSet';

/**
 * Clear trade responses in the UI. Mirrors Java {@code SOCClearTradeMsg}.
 */
export class SOCClearTradeMsg implements SOCMessage {
  readonly type = MessageType.CLEARTRADEMSG;

  /** Name of the game. */
  readonly game: string;

  /** Seat number to clear, or -1 to clear all seats. */
  readonly playerNumber: number;

  /**
   * @param game          game name
   * @param playerNumber  seat number, or -1 for all
   */
  constructor(game: string, playerNumber: number) {
    this.game = game;
    this.playerNumber = playerNumber;
  }

  toCmd(): string {
    return `${MessageType.CLEARTRADEMSG}${SEP}${this.game}${SEP2}${this.playerNumber}`;
  }

  /**
   * Parse the data portion (game, playerNumber).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCClearTradeMsg | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 2) {
      return null;
    }
    const pn = parseIntStrict(tok[1]);
    if (pn === null) {
      return null;
    }
    return new SOCClearTradeMsg(tok[0], pn);
  }
}

registerParser(MessageType.CLEARTRADEMSG, SOCClearTradeMsg.parse);
