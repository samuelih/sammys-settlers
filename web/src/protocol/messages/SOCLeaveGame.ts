// SOCLeaveGame — someone is leaving a game (client->server then server->all).
// Ported from src/main/java/soc/message/SOCLeaveGame.java.
//
// Wire format:  LEAVEGAME SEP nickname SEP2 host SEP2 game
// `nickname` is ignored from client (can be "-" but not blank). `host` is an
// unused optional server host name, always "-" from v2.0.00 clients / v1.1.17
// servers. Parsing needs exactly 3 SEP2 tokens; fewer is garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/**
 * Leave-game request/announcement. Mirrors Java {@code SOCLeaveGame}.
 */
export class SOCLeaveGame implements SOCMessage {
  readonly type = MessageType.LEAVEGAME;

  /** Leaving member's nickname (ignored from client; "-" allowed, not blank). */
  readonly nickname: string;

  /** Unused optional server host name, or "-". */
  readonly host: string;

  /** Name of the game. */
  readonly game: string;

  /**
   * @param nickname  leaving member's nickname, or "-"
   * @param host      unused host name, or "-"
   * @param game      game name
   */
  constructor(nickname: string, host: string, game: string) {
    this.nickname = nickname;
    this.host = host;
    this.game = game;
  }

  toCmd(): string {
    return (
      `${MessageType.LEAVEGAME}${SEP}${this.nickname}` +
      `${SEP2}${this.host}${SEP2}${this.game}`
    );
  }

  /**
   * Parse the data portion. Mirrors Java: 3 SEP2 tokens (nickname, host, game).
   *
   * @returns the parsed message, or null if fewer than 3 tokens (garbled)
   */
  static parse(params: string): SOCLeaveGame | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 3) {
      return null;
    }
    const [nn, hn, ga] = tok;
    return new SOCLeaveGame(nn, hn, ga);
  }
}

registerParser(MessageType.LEAVEGAME, SOCLeaveGame.parse);
