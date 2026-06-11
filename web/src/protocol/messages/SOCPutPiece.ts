// SOCPutPiece — place (client request) or announce (server) a piece on the board.
// Ported from src/main/java/soc/message/SOCPutPiece.java.
//
// Wire format:  PUTPIECE SEP game SEP2 playerNumber SEP2 pieceType SEP2 coordinates
// NOTE the field order: playerNumber comes BEFORE pieceType. `pieceType` is a
// SOCPlayingPiece type (ROAD=0, SETTLEMENT=1, CITY=2, SHIP=3); `playerNumber`
// may be -1 for non-player-owned village pieces. The Java constructor requires
// pieceType >= 0 and coordinates >= 0; parse returns null otherwise. Parsing
// reads four SEP2 tokens; garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/** Strict integer check matching Java Integer.parseInt (allows leading '-'). */
function parseIntStrict(s: string): number | null {
  if (!/^[+-]?\d+$/.test(s)) {
    return null;
  }
  return Number.parseInt(s, 10);
}

/**
 * Piece placement request/announcement. Mirrors Java {@code SOCPutPiece}.
 */
export class SOCPutPiece implements SOCMessage {
  readonly type = MessageType.PUTPIECE;

  /** Name of the game. */
  readonly game: string;

  /** Owner's seat number (from server), or -1 for non-player-owned village. */
  readonly playerNumber: number;

  /** Piece type (SOCPlayingPiece); must be >= 0. */
  readonly pieceType: number;

  /** Node or edge coordinate (0xRRCC); must be >= 0. */
  readonly coordinates: number;

  /**
   * @param game          game name
   * @param playerNumber  owner's seat number, or -1
   * @param pieceType     piece type; must be >= 0
   * @param coordinates   node/edge coordinate; must be >= 0
   * @throws Error if pieceType < 0 or coordinates < 0 (Java parity)
   */
  constructor(game: string, playerNumber: number, pieceType: number, coordinates: number) {
    if (pieceType < 0) {
      throw new Error(`pt: ${pieceType}`);
    }
    if (coordinates < 0) {
      throw new Error(`coord < 0: ${coordinates}`);
    }
    this.game = game;
    this.playerNumber = playerNumber;
    this.pieceType = pieceType;
    this.coordinates = coordinates;
  }

  toCmd(): string {
    return (
      `${MessageType.PUTPIECE}${SEP}${this.game}` +
      `${SEP2}${this.playerNumber}${SEP2}${this.pieceType}${SEP2}${this.coordinates}`
    );
  }

  /**
   * Parse the data portion (game, playerNumber, pieceType, coordinates).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCPutPiece | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 4) {
      return null;
    }
    const pn = parseIntStrict(tok[1]);
    const pt = parseIntStrict(tok[2]);
    const co = parseIntStrict(tok[3]);
    if (pn === null || pt === null || co === null) {
      return null;
    }
    if (pt < 0 || co < 0) {
      return null; // Java constructor would throw -> parse returns null
    }
    return new SOCPutPiece(tok[0], pn, pt, co);
  }
}

registerParser(MessageType.PUTPIECE, SOCPutPiece.parse);
