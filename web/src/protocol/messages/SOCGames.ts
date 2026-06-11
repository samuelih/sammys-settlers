// SOCGames — backwards-compat list of game names (no options).
// Ported from src/main/java/soc/message/SOCGames.java.
//
// Wire format:  GAMES SEP game1 SEP2 game2 SEP2 ...
// Game names may carry the MARKER_THIS_GAME_UNJOINABLE prefix. Parsing uses
// StringTokenizer on SEP2 (empty tokens skipped).

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/**
 * List of game names. Mirrors Java {@code SOCGames}. The web client (v2700)
 * normally receives {@link SOCGamesWithOptions} instead, but this is kept for
 * completeness/back-compat.
 */
export class SOCGames implements SOCMessage {
  readonly type = MessageType.GAMES;

  /**
   * @param games  game names (may be empty); may include the unjoinable marker
   */
  constructor(readonly games: readonly string[]) {}

  toCmd(): string {
    return `${MessageType.GAMES}${SEP}${this.games.join(SEP2)}`;
  }

  /**
   * Parse the data portion. Mirrors Java's StringTokenizer(s, SEP2): empty
   * tokens are skipped, so "" yields an empty list.
   */
  static parse(params: string): SOCGames {
    const games = params.split(SEP2).filter((t) => t.length > 0);
    return new SOCGames(games);
  }
}

registerParser(MessageType.GAMES, SOCGames.parse);
