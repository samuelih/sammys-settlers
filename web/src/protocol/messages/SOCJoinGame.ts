// SOCJoinGame — request to join an existing game (or create an options-less one);
// also broadcast from server announcing a member joined.
// Ported from src/main/java/soc/message/SOCJoinGame.java (extends
// SOCMessageTemplateJoinGame).
//
// Wire format:  JOINGAME SEP nickname SEP2 password SEP2 host SEP2 game
// Subtleties (verified against Java):
//   * An empty password is sent as EMPTYSTR ("\t"); on parse EMPTYSTR -> "".
//     The constructor likewise normalizes EMPTYSTR/null password to "".
//   * `nickname` is "-" from an already-authenticated client; `host` is unused
//     and conventionally EMPTYSTR ("\t") from v2.0.00 clients (server ignores it).
//   * Parsing uses StringTokenizer on SEP2 and needs exactly 4 tokens; fewer
//     (any field missing) is garbled -> null. StringTokenizer skips empty
//     tokens, so a literally-empty field would shift tokens; real fields use
//     EMPTYSTR/"-" rather than "".

import { MessageType, SEP, SEP2, EMPTYSTR } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/**
 * Join-game request/announcement. Mirrors Java {@code SOCJoinGame}.
 */
export class SOCJoinGame implements SOCMessage {
  readonly type = MessageType.JOINGAME;

  /** Joining member's nickname, or "-" from an already-auth'd client. */
  readonly nickname: string;

  /** Optional password, or "" if none (EMPTYSTR/null normalized to ""). */
  readonly password: string;

  /** Unused optional server host name, or "-"/EMPTYSTR. Server ignores it. */
  readonly host: string;

  /** Name of the game to join. */
  readonly game: string;

  /**
   * @param nickname  nickname, or "-" if already auth'd to server
   * @param password  optional password; EMPTYSTR or null becomes ""
   * @param host      unused host name, or "-"/EMPTYSTR
   * @param game      game name
   */
  constructor(
    nickname: string,
    password: string | null,
    host: string,
    game: string,
  ) {
    this.nickname = nickname;
    // Java: password = ((pw != null) && ! pw.equals(EMPTYSTR)) ? pw : "";
    this.password =
      password !== null && password !== EMPTYSTR ? password : '';
    this.host = host;
    this.game = game;
  }

  toCmd(): string {
    // Java: empty password is emitted as EMPTYSTR to avoid two adjacent SEP2s.
    const pw = this.password.length === 0 ? EMPTYSTR : this.password;
    return (
      `${MessageType.JOINGAME}${SEP}${this.nickname}${SEP2}${pw}` +
      `${SEP2}${this.host}${SEP2}${this.game}`
    );
  }

  /**
   * Parse the data portion. Mirrors Java's StringTokenizer(s, SEP2) reading
   * exactly 4 tokens (nickname, password, host, game). EMPTYSTR password -> "".
   *
   * @returns the parsed message, or null if fewer than 4 tokens (garbled)
   */
  static parse(params: string): SOCJoinGame | null {
    // StringTokenizer skips empty tokens; replicate by filtering.
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 4) {
      return null;
    }
    const [nn, pw, hn, ga] = tok;
    const password = pw === EMPTYSTR ? '' : pw;
    return new SOCJoinGame(nn, password, hn, ga);
  }
}

registerParser(MessageType.JOINGAME, SOCJoinGame.parse);
