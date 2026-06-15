// SOCCancelBuildRequest — cancel a build/placement; meaning depends on state/direction.
// Ported from src/main/java/soc/message/SOCCancelBuildRequest.java.
//
// Wire format:  CANCELBUILDREQUEST SEP game SEP2 pieceType
// `pieceType` is a SOCPlayingPiece type (ROAD=0..), or one of the special
// negatives CARD=-2 / INV_ITEM_PLACE_CANCEL=-3. Unlike SOCBuildRequest, the
// Java constructor does NOT validate pieceType. Parsing reads two SEP2 tokens;
// garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseJavaInt } from '../javaInt';

/** pieceType to cancel playing a non-Road-Building dev card / deny dev-card buy (-2). */
export const CANCEL_CARD = -2;

/** pieceType to cancel special inventory-item placement (-3). */
export const CANCEL_INV_ITEM_PLACE = -3;

/** Strict integer check matching Java Integer.parseInt (allows leading sign). */
function parseIntStrict(s: string): number | null {
  return parseJavaInt(s);
}

/**
 * Cancel a build/placement request. Mirrors Java {@code SOCCancelBuildRequest}.
 */
export class SOCCancelBuildRequest implements SOCMessage {
  readonly type = MessageType.CANCELBUILDREQUEST;

  /** Name of the game. */
  readonly game: string;

  /** Piece type to cancel (SOCPlayingPiece), or CARD (-2) / INV_ITEM (-3). */
  readonly pieceType: number;

  /**
   * @param game       game name
   * @param pieceType  piece type, or a special negative cancel code
   */
  constructor(game: string, pieceType: number) {
    this.game = game;
    this.pieceType = pieceType;
  }

  toCmd(): string {
    return `${MessageType.CANCELBUILDREQUEST}${SEP}${this.game}${SEP2}${this.pieceType}`;
  }

  /**
   * Parse the data portion (game, pieceType).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCCancelBuildRequest | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 2) {
      return null;
    }
    const pt = parseIntStrict(tok[1]);
    if (pt === null) {
      return null;
    }
    return new SOCCancelBuildRequest(tok[0], pt);
  }
}

registerParser(MessageType.CANCELBUILDREQUEST, SOCCancelBuildRequest.parse);
