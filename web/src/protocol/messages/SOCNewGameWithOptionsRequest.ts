// SOCNewGameWithOptionsRequest — client asks the server to create a new game
// with game options.
// Ported from src/main/java/soc/message/SOCNewGameWithOptionsRequest.java
// (extends SOCMessageTemplateJoinGame).
//
// Wire format:  NEWGAMEWITHOPTIONSREQUEST SEP nickname SEP2 password SEP2 host SEP2 game SEP2 optsStr
// where optsStr is the packed game-option string (see gameOptions.ts /
// serializeOptions), or "-" for no options.
//
// IMPORTANT subtleties, verified byte-for-byte against the real Java class:
//   * An empty password is emitted as EMPTYSTR ("\t"); the template constructor
//     normalizes EMPTYSTR/null password to "".
//   * `nickname` is "-" from an already-authenticated client; `host` is unused
//     and conventionally EMPTYSTR ("\t") from v2.0.00 clients.
//   * Parsing reads nickname/password/host/game with SEP2, then does
//     `optstr = st.nextToken(sep)` switching the tokenizer to SEP. Because the
//     SEP2 boundary after `game` is consumed but the token VALUE begins at it,
//     the parsed optsStr KEEPS a leading "," (e.g. the wire `BC=t4,PL=4` parses
//     to `,BC=t4,PL=4`; `-` parses to `,-`). This mirrors SOCNewGameWithOptions.
//   * Consequence: Java's decode(encode(...)) is NOT a byte identity — it
//     accumulates one leading comma per round-trip. This port reproduces that
//     exactly. The server tolerates the leading comma (parseOptionsToMap skips
//     leading/doubled commas), so it is harmless.
//   * When BUILDING a fresh request from the UI, pass the clean packed optsStr
//     (no leading comma); toCmd() emits it verbatim, matching the Java client's
//     outgoing bytes (e.g. `1078|myname,\t,\t,mygame,BC=t4,PL=4`).

import { MessageType, SEP, SEP2, EMPTYSTR } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/**
 * Request to create a new game with options. Mirrors Java
 * {@code SOCNewGameWithOptionsRequest}.
 */
export class SOCNewGameWithOptionsRequest implements SOCMessage {
  readonly type = MessageType.NEWGAMEWITHOPTIONSREQUEST;

  /** Player's nickname, or "-" if already auth'd to server. */
  readonly nickname: string;

  /** Optional password, or "" if none (EMPTYSTR/null normalized to ""). */
  readonly password: string;

  /** Unused optional server host name, or "-"/EMPTYSTR. */
  readonly host: string;

  /** Name of the game to create. */
  readonly game: string;

  /**
   * Packed game-option string. When building a request, this is the clean
   * packed string (e.g. "BC=t4,PL=4") or "-" for none. When decoded off the
   * wire it KEEPS the leading "," artifact (see the file-header note).
   */
  readonly optsStr: string;

  /**
   * @param nickname  nickname, or "-" if already auth'd
   * @param password  optional password; EMPTYSTR or null becomes ""
   * @param host      unused host name, or "-"/EMPTYSTR
   * @param game      game name
   * @param optsStr   packed options string, or "-" for none; emitted verbatim
   */
  constructor(
    nickname: string,
    password: string | null,
    host: string,
    game: string,
    optsStr: string,
  ) {
    this.nickname = nickname;
    // Java template ctor: ((pw != null) && ! pw.equals(EMPTYSTR)) ? pw : "".
    this.password =
      password !== null && password !== EMPTYSTR ? password : '';
    this.host = host;
    this.game = game;
    this.optsStr = optsStr;
  }

  toCmd(): string {
    // Java: empty password is emitted as EMPTYSTR; optsStr is appended verbatim.
    const pw = this.password.length === 0 ? EMPTYSTR : this.password;
    return (
      `${MessageType.NEWGAMEWITHOPTIONSREQUEST}${SEP}${this.nickname}` +
      `${SEP2}${pw}${SEP2}${this.host}${SEP2}${this.game}${SEP2}${this.optsStr}`
    );
  }

  /**
   * Parse the data portion. Mirrors Java exactly: nickname/password/host/game
   * read with SEP2, then the rest taken with SEP as the delimiter so optsStr
   * KEEPS its leading "," (see the file-header note). EMPTYSTR password -> "".
   *
   * @returns the parsed message, or null if fewer than 5 fields (garbled)
   */
  static parse(params: string): SOCNewGameWithOptionsRequest | null {
    // Find the 4 SEP2 boundaries delimiting nickname, password, host, game.
    // Then optsStr is everything from the 4th boundary onward, INCLUDING the
    // leading comma, matching Java's st.nextToken(sep).
    const i1 = params.indexOf(SEP2);
    if (i1 === -1) {
      return null;
    }
    const i2 = params.indexOf(SEP2, i1 + 1);
    if (i2 === -1) {
      return null;
    }
    const i3 = params.indexOf(SEP2, i2 + 1);
    if (i3 === -1) {
      return null;
    }
    const i4 = params.indexOf(SEP2, i3 + 1);
    if (i4 === -1) {
      return null;
    }

    const nn = params.substring(0, i1);
    const pwRaw = params.substring(i1 + 1, i2);
    const hn = params.substring(i2 + 1, i3);
    const ga = params.substring(i3 + 1, i4);
    // Java's nextToken(sep): begins at the consumed SEP2 boundary -> leading ",".
    const optsStr = params.substring(i4);

    const password = pwRaw === EMPTYSTR ? '' : pwRaw;
    return new SOCNewGameWithOptionsRequest(nn, password, hn, ga, optsStr);
  }
}

registerParser(
  MessageType.NEWGAMEWITHOPTIONSREQUEST,
  SOCNewGameWithOptionsRequest.parse,
);
