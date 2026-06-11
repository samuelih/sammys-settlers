// SOCBuyDevCardRequest — client asks to buy a development card.
// Ported from src/main/java/soc/message/SOCBuyDevCardRequest.java.
//
// Wire format:  BUYDEVCARDREQUEST SEP game
// The entire data portion is the game name (Java parseDataStr returns
// new SOCBuyDevCardRequest(s) verbatim, so the game name may contain commas).
// Before v2.0.00 this class was SOCBuyCardRequest.

import { MessageType, SEP } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/**
 * Request to buy a development card. Mirrors Java {@code SOCBuyDevCardRequest}.
 */
export class SOCBuyDevCardRequest implements SOCMessage {
  readonly type = MessageType.BUYDEVCARDREQUEST;

  /** Name of the game. */
  readonly game: string;

  /**
   * @param game  game name
   */
  constructor(game: string) {
    this.game = game;
  }

  toCmd(): string {
    return `${MessageType.BUYDEVCARDREQUEST}${SEP}${this.game}`;
  }

  /**
   * Parse the data portion (the whole thing is the game name).
   *
   * @returns the parsed message (never null; Java parseDataStr can't fail here)
   */
  static parse(params: string): SOCBuyDevCardRequest {
    return new SOCBuyDevCardRequest(params);
  }
}

registerParser(MessageType.BUYDEVCARDREQUEST, SOCBuyDevCardRequest.parse);
