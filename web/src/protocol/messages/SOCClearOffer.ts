// SOCClearOffer — retract a trade offer, or server clears offers from displays.
// Ported from src/main/java/soc/message/SOCClearOffer.java.
//
// Wire format:  CLEAROFFER SEP game SEP2 playerNumber
// playerNumber -1 means "all players clear all offers" (server->client only,
// since v1.1.09). Parsing reads two SEP2 tokens; garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseIntStrict } from './resourceSet';

/**
 * Retract / clear a trade offer. Mirrors Java {@code SOCClearOffer}.
 */
export class SOCClearOffer implements SOCMessage {
  readonly type = MessageType.CLEAROFFER;

  /** Name of the game. */
  readonly game: string;

  /** Seat number whose offer is cleared, or -1 for all. */
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
    return `${MessageType.CLEAROFFER}${SEP}${this.game}${SEP2}${this.playerNumber}`;
  }

  /**
   * Parse the data portion (game, playerNumber).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCClearOffer | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 2) {
      return null;
    }
    const pn = parseIntStrict(tok[1]);
    if (pn === null) {
      return null;
    }
    return new SOCClearOffer(tok[0], pn);
  }
}

registerParser(MessageType.CLEAROFFER, SOCClearOffer.parse);
