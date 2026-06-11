// SOCTurn — server signals the start of a player's turn.
// Ported from src/main/java/soc/message/SOCTurn.java.
//
// Wire format:  TURN SEP game SEP2 playerNumber [SEP2 gameState]
// The optional gameState field (v2.0.00+) carries the new turn's game state, so
// a separate SOCGameState message isn't needed. Java clamps gs <= 0 to 0 and
// omits the field when 0. Parsing reads 2 or 3 SEP2 tokens; garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/** Strict integer check matching Java Integer.parseInt. */
function parseIntStrict(s: string): number | null {
  if (!/^[+-]?\d+$/.test(s)) {
    return null;
  }
  return Number.parseInt(s, 10);
}

/**
 * Start-of-turn announcement. Mirrors Java {@code SOCTurn}.
 */
export class SOCTurn implements SOCMessage {
  readonly type = MessageType.TURN;

  /** Name of the game. */
  readonly game: string;

  /** Seat number of the new current player. */
  readonly playerNumber: number;

  /** New turn's game state, or 0 if not sent (matches Java's clamp of gs <= 0). */
  readonly gameState: number;

  /**
   * @param game          game name
   * @param playerNumber  current player's seat number
   * @param gameState     new game state, or 0 (values <= 0 are treated as 0)
   */
  constructor(game: string, playerNumber: number, gameState = 0) {
    this.game = game;
    this.playerNumber = playerNumber;
    this.gameState = gameState > 0 ? gameState : 0;
  }

  toCmd(): string {
    let cmd = `${MessageType.TURN}${SEP}${this.game}${SEP2}${this.playerNumber}`;
    if (this.gameState > 0) {
      cmd += `${SEP2}${this.gameState}`;
    }
    return cmd;
  }

  /**
   * Parse the data portion (game, playerNumber, [gameState]). The state token is
   * optional. Mirrors Java's StringTokenizer-based parseDataStr.
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCTurn | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 2) {
      return null;
    }
    const pn = parseIntStrict(tok[1]);
    if (pn === null) {
      return null;
    }
    let gs = 0;
    if (tok.length > 2) {
      const parsed = parseIntStrict(tok[2]);
      if (parsed === null) {
        return null;
      }
      gs = parsed;
    }
    return new SOCTurn(tok[0], pn, gs);
  }
}

registerParser(MessageType.TURN, SOCTurn.parse);
