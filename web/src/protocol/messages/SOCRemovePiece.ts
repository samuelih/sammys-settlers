// SOCRemovePiece — server announces a piece removed from the board.
// Ported from src/main/java/soc/message/SOCRemovePiece.java (extends
// SOCMessageTemplate3i). @since 2.0.00
//
// Wire format:  REMOVEPIECE SEP game SEP2 playerNumber SEP2 pieceType SEP2 coord
// Originally used when a SC_PIRI pirate-fortress attack fails (a ship is
// removed); the Cities & Knights barbarian attack also uses it for a city
// downgrade — SOCRemovePiece(city) followed by SOCPutPiece(settlement); see
// doc/Cities-and-Knights-Implemented.md ("Barbarians"). The Java constructor
// requires coord >= 0; parse returns null otherwise. Parsing reads four SEP2
// tokens; garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseIntStrict } from './resourceSet';

/**
 * Piece-removal announcement. Mirrors Java {@code SOCRemovePiece}.
 */
export class SOCRemovePiece implements SOCMessage {
  readonly type = MessageType.REMOVEPIECE;

  /** Name of the game. */
  readonly game: string;

  /** Owner's seat number. */
  readonly playerNumber: number;

  /** Piece type (SOCPlayingPiece, e.g. SHIP=3, CITY=2). */
  readonly pieceType: number;

  /** Coordinate of the piece to remove (0xRRCC); must be >= 0. */
  readonly coord: number;

  /**
   * @param game          game name
   * @param playerNumber  owner's seat number
   * @param pieceType     piece type
   * @param coord         coordinate of the piece to remove; must be >= 0
   * @throws Error if coord < 0 (Java parity: IllegalArgumentException)
   */
  constructor(game: string, playerNumber: number, pieceType: number, coord: number) {
    if (coord < 0) {
      throw new Error('coord < 0');
    }
    this.game = game;
    this.playerNumber = playerNumber;
    this.pieceType = pieceType;
    this.coord = coord;
  }

  toCmd(): string {
    return (
      `${MessageType.REMOVEPIECE}${SEP}${this.game}` +
      `${SEP2}${this.playerNumber}${SEP2}${this.pieceType}${SEP2}${this.coord}`
    );
  }

  /**
   * Parse the data portion (game, playerNumber, pieceType, coord).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCRemovePiece | null {
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
    if (co < 0) {
      return null; // Java constructor would throw -> parse returns null
    }
    return new SOCRemovePiece(tok[0], pn, pt, co);
  }
}

registerParser(MessageType.REMOVEPIECE, SOCRemovePiece.parse);
