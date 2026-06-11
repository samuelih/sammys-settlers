// SOCPlayDevCardRequest — client asks to play a development card.
// Ported from src/main/java/soc/message/SOCPlayDevCardRequest.java.
//
// Wire format:  PLAYDEVCARDREQUEST SEP game SEP2 devCardType
// devCardType is a SOCDevCardConstants value (DevCardType: KNIGHT=9, ROADS=1,
// DISC=2, MONO=3, ...). NOTE: the v2.0.00 KNIGHT renumbering is NOT handled here;
// since we speak v2.7.00 we always send the current value. Parsing reads two
// SEP2 tokens; garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseIntStrict } from './resourceSet';

/**
 * Request to play a development card. Mirrors Java {@code SOCPlayDevCardRequest}.
 */
export class SOCPlayDevCardRequest implements SOCMessage {
  readonly type = MessageType.PLAYDEVCARDREQUEST;

  /** Name of the game. */
  readonly game: string;

  /** Dev-card type (DevCardType value). */
  readonly devCard: number;

  /**
   * @param game     game name
   * @param devCard  dev-card type
   */
  constructor(game: string, devCard: number) {
    this.game = game;
    this.devCard = devCard;
  }

  toCmd(): string {
    return `${MessageType.PLAYDEVCARDREQUEST}${SEP}${this.game}${SEP2}${this.devCard}`;
  }

  /**
   * Parse the data portion (game, devCardType).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCPlayDevCardRequest | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 2) {
      return null;
    }
    const dc = parseIntStrict(tok[1]);
    if (dc === null) {
      return null;
    }
    return new SOCPlayDevCardRequest(tok[0], dc);
  }
}

registerParser(MessageType.PLAYDEVCARDREQUEST, SOCPlayDevCardRequest.parse);
