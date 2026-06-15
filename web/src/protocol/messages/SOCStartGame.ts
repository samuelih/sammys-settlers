// SOCStartGame — request to start a game (client) / announce a game started (server).
// Ported from src/main/java/soc/message/SOCStartGame.java.
//
// Wire format:  STARTGAME SEP game [SEP2 gameState]
// The optional gameState field (v2.0.00+) is only emitted when > 0. Values <= 0
// are normalized to 0 (omitted). Ignored from client.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseJavaInt } from '../javaInt';

/** Strict integer check matching Java Integer.parseInt. */
function parseIntStrict(s: string): number | null {
  return parseJavaInt(s);
}

/**
 * Start-game request/announcement. Mirrors Java {@code SOCStartGame}.
 */
export class SOCStartGame implements SOCMessage {
  readonly type = MessageType.STARTGAME;

  /** Name of the game. */
  readonly game: string;

  /** New turn's game state, or 0 to omit (values <= 0 normalize to 0). */
  readonly gameState: number;

  /**
   * @param game       game name
   * @param gameState  optional game state, or 0 (default); <= 0 becomes 0
   */
  constructor(game: string, gameState = 0) {
    this.game = game;
    this.gameState = gameState > 0 ? gameState : 0;
  }

  toCmd(): string {
    // Java: STARTGAME sep ga + ((gs > 0) ? sep2 + gs : "")
    const tail = this.gameState > 0 ? `${SEP2}${this.gameState}` : '';
    return `${MessageType.STARTGAME}${SEP}${this.game}${tail}`;
  }

  /**
   * Parse the data portion. Mirrors Java: game = first SEP2 token; optional
   * second token parsed as the game state.
   *
   * @returns the parsed message, or null if garbled (non-int gameState)
   */
  static parse(params: string): SOCStartGame | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 1) {
      return null;
    }
    const game = tok[0];
    let gs = 0;
    if (tok.length > 1) {
      const parsed = parseIntStrict(tok[1]);
      if (parsed === null) {
        return null;
      }
      gs = parsed;
    }
    return new SOCStartGame(game, gs);
  }
}

registerParser(MessageType.STARTGAME, SOCStartGame.parse);
