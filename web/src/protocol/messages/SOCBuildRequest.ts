// SOCBuildRequest — client asks to build a piece type (or request Special Building).
// Ported from src/main/java/soc/message/SOCBuildRequest.java.
//
// Wire format:  BUILDREQUEST SEP game SEP2 pieceType
// `pieceType` is a SOCPlayingPiece type (ROAD=0..SHIP=3), or -1 to request the
// 6-player Special Building Phase. The Java constructor throws if pieceType < -1.
// Parsing reads two SEP2 tokens; garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseJavaInt } from '../javaInt';

/** Strict integer check matching Java Integer.parseInt (allows leading sign). */
function parseIntStrict(s: string): number | null {
  return parseJavaInt(s);
}

/**
 * Request to build a piece. Mirrors Java {@code SOCBuildRequest}.
 */
export class SOCBuildRequest implements SOCMessage {
  readonly type = MessageType.BUILDREQUEST;

  /** Name of the game. */
  readonly game: string;

  /** Piece type to build (SOCPlayingPiece), or -1 for Special Building. */
  readonly pieceType: number;

  /**
   * @param game       game name
   * @param pieceType  piece type, or -1 for Special Building
   * @throws Error if pieceType < -1 (Java parity)
   */
  constructor(game: string, pieceType: number) {
    if (pieceType < -1) {
      throw new Error(`pt: ${pieceType}`);
    }
    this.game = game;
    this.pieceType = pieceType;
  }

  toCmd(): string {
    return `${MessageType.BUILDREQUEST}${SEP}${this.game}${SEP2}${this.pieceType}`;
  }

  /**
   * Parse the data portion (game, pieceType).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCBuildRequest | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 2) {
      return null;
    }
    const pt = parseIntStrict(tok[1]);
    if (pt === null || pt < -1) {
      return null;
    }
    return new SOCBuildRequest(tok[0], pt);
  }
}

registerParser(MessageType.BUILDREQUEST, SOCBuildRequest.parse);
