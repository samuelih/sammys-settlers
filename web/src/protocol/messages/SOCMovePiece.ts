// SOCMovePiece — move (client request) or announce (server) a piece to a new edge.
// Ported from src/main/java/soc/message/SOCMovePiece.java (extends SOCMessageTemplate4i).
//
// Wire format:  MOVEPIECE SEP game SEP2 playerNumber SEP2 pieceType SEP2 fromCoord SEP2 toCoord
// Currently only ships (SOCPlayingPiece.SHIP=3) are movable. The Java
// constructor requires pieceType/fromCoord/toCoord all >= 0; parse returns null
// otherwise. Parsing reads five SEP2 tokens; garbled -> null.

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
 * Piece-move request/announcement. Mirrors Java {@code SOCMovePiece}.
 */
export class SOCMovePiece implements SOCMessage {
  readonly type = MessageType.MOVEPIECE;

  /** Name of the game. */
  readonly game: string;

  /** Owner's seat number (from server). */
  readonly playerNumber: number;

  /** Piece type (SOCPlayingPiece, e.g. SHIP=3); must be >= 0. */
  readonly pieceType: number;

  /** Edge coordinate to move from (0xRRCC); must be >= 0. */
  readonly fromCoord: number;

  /** Edge coordinate to move to (0xRRCC); must be >= 0. */
  readonly toCoord: number;

  /**
   * @param game          game name
   * @param playerNumber  owner's seat number
   * @param pieceType     piece type; must be >= 0
   * @param fromCoord     edge to move from; must be >= 0
   * @param toCoord       edge to move to; must be >= 0
   * @throws Error if pieceType < 0, fromCoord < 0, or toCoord < 0 (Java parity)
   */
  constructor(
    game: string,
    playerNumber: number,
    pieceType: number,
    fromCoord: number,
    toCoord: number,
  ) {
    if (pieceType < 0) {
      throw new Error(`pt < 0: ${pieceType}`);
    }
    if (fromCoord < 0) {
      throw new Error('fromCoord < 0');
    }
    if (toCoord < 0) {
      throw new Error('toCoord < 0');
    }
    this.game = game;
    this.playerNumber = playerNumber;
    this.pieceType = pieceType;
    this.fromCoord = fromCoord;
    this.toCoord = toCoord;
  }

  toCmd(): string {
    return (
      `${MessageType.MOVEPIECE}${SEP}${this.game}` +
      `${SEP2}${this.playerNumber}${SEP2}${this.pieceType}` +
      `${SEP2}${this.fromCoord}${SEP2}${this.toCoord}`
    );
  }

  /**
   * Parse the data portion (game, playerNumber, pieceType, fromCoord, toCoord).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCMovePiece | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 5) {
      return null;
    }
    const pn = parseIntStrict(tok[1]);
    const pt = parseIntStrict(tok[2]);
    const fc = parseIntStrict(tok[3]);
    const tc = parseIntStrict(tok[4]);
    if (pn === null || pt === null || fc === null || tc === null) {
      return null;
    }
    if (pt < 0 || fc < 0 || tc < 0) {
      return null; // Java constructor would throw -> parse returns null
    }
    return new SOCMovePiece(tok[0], pn, pt, fc, tc);
  }
}

registerParser(MessageType.MOVEPIECE, SOCMovePiece.parse);
