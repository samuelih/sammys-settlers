// SOCRejectOffer — reject all offers ("no thanks"), or a server reply-reason code.
// Ported from src/main/java/soc/message/SOCRejectOffer.java.
//
// Wire format:  REJECTOFFER SEP game SEP2 playerNumber [SEP2 reasonCode]
// The reasonCode field is emitted only when != 0 (server reply codes like
// REASON_CANNOT_MAKE_TRADE=1, REASON_NOT_YOUR_TURN=2, REASON_CANNOT_MAKE_OFFER=3;
// see RejectOfferReason). From client it's a plain "no thanks" with reasonCode 0;
// the playerNumber is ignored by the server in that direction. Parsing reads 2 or
// 3 SEP2 tokens; garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseIntStrict } from './resourceSet';

/**
 * Reject a trade offer, or a server decline reason. Mirrors Java
 * {@code SOCRejectOffer}.
 */
export class SOCRejectOffer implements SOCMessage {
  readonly type = MessageType.REJECTOFFER;

  /** Name of the game. */
  readonly game: string;

  /** Seat number rejecting (from server), or -1 with some reason codes. */
  readonly playerNumber: number;

  /** Reply/decline reason code (RejectOfferReason), or 0 for a plain reject. */
  readonly reasonCode: number;

  /**
   * @param game          game name
   * @param playerNumber  seat number, or -1
   * @param reasonCode    reason code, or 0 (default)
   */
  constructor(game: string, playerNumber: number, reasonCode = 0) {
    this.game = game;
    this.playerNumber = playerNumber;
    this.reasonCode = reasonCode;
  }

  toCmd(): string {
    let cmd = `${MessageType.REJECTOFFER}${SEP}${this.game}${SEP2}${this.playerNumber}`;
    if (this.reasonCode !== 0) {
      cmd += `${SEP2}${this.reasonCode}`;
    }
    return cmd;
  }

  /**
   * Parse the data portion (game, playerNumber, [reasonCode]).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCRejectOffer | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 2) {
      return null;
    }
    const pn = parseIntStrict(tok[1]);
    if (pn === null) {
      return null;
    }
    let rc = 0;
    if (tok.length > 2) {
      const parsed = parseIntStrict(tok[2]);
      if (parsed === null) {
        return null;
      }
      rc = parsed;
    }
    return new SOCRejectOffer(tok[0], pn, rc);
  }
}

registerParser(MessageType.REJECTOFFER, SOCRejectOffer.parse);
