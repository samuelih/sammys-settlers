// SOCNewGameWithOptions — a new game with options was created.
// Ported from src/main/java/soc/message/SOCNewGameWithOptions.java, which
// extends SOCMessageTemplate2s.
//
// Wire format:  NEWGAMEWITHOPTIONS SEP game SEP2 minVers SEP2 opts
// where `opts` is "-" on the wire when there are no options. IMPORTANT
// round-trip subtlety (faithful to Java, verified against the real class):
//
//   * On parse, game and minVers are read with SEP2; then Java does
//     `opts = st.nextToken(sep)`, switching the tokenizer to SEP. Because the
//     SEP2 boundary after minVers is consumed but the token VALUE begins at it,
//     the parsed option string KEEPS the leading "," (e.g. ",BC=t4,N7=f7").
//   * Therefore `opts == "-"` is only ever true when there is no leading comma,
//     which doesn't happen in the normal wire path; the no-options wire value
//     "-" parses to ",-" and is NOT mapped to null.
//   * Consequently Java's own decode(encode(...)) is NOT a byte-identity: it
//     accumulates a leading comma each round (",-" re-encodes to ",,-"). This
//     port reproduces that exactly. The DECODED message (its `opts` field) is
//     the stable, comparable representation; tests round-trip on that.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/**
 * Announcement of a new game with options. Mirrors Java
 * {@code SOCNewGameWithOptions}.
 */
export class SOCNewGameWithOptions implements SOCMessage {
  readonly type = MessageType.NEWGAMEWITHOPTIONS;

  /** Game name; may carry the unjoinable marker prefix (template p1=game). */
  readonly game: string;

  /** Minimum client version required for this game, or -1 (template p1). */
  readonly minVers: number;

  /**
   * Encoded game options string (template p2), exactly as Java stores it after
   * parsing — including any leading "," (see the file-header note). When sent
   * to clients with no options the wire form is "-", which parses to ",-".
   * `null` only for the unusual case where Java mapped a bare "-" to null.
   */
  readonly opts: string | null;

  /**
   * @param game     game name (may include the unjoinable marker prefix)
   * @param minVers  minimum required client version, or -1
   * @param opts     encoded options (template p2); pass exactly what should be
   *                 emitted after the second SEP2. Use "-" for the server-side
   *                 no-options wire form, or null (rendered as "") like Java.
   */
  constructor(game: string, minVers: number, opts: string | null) {
    this.game = game;
    this.minVers = minVers;
    this.opts = opts;
  }

  toCmd(): string {
    // Mirrors SOCMessageTemplate2s.toCmd(type, game, p1=minVers, p2=opts):
    //   type SEP game SEP2 minVers SEP2 (opts != null ? opts : "")
    return (
      `${MessageType.NEWGAMEWITHOPTIONS}${SEP}${this.game}` +
      `${SEP2}${this.minVers}${SEP2}${this.opts !== null ? this.opts : ''}`
    );
  }

  /**
   * Parse the data portion. Mirrors Java's parseDataStr exactly:
   *  - game    = first SEP2 token
   *  - minVers = second SEP2 token (parsed as int)
   *  - opts    = remainder using SEP as the delimiter, so it KEEPS the leading
   *              "," that followed minVers.
   *  - then: if opts == "-" (only when no leading comma), opts = null.
   *
   * @returns the parsed message, or null if game/minVers are missing/malformed
   */
  static parse(params: string): SOCNewGameWithOptions | null {
    const firstComma = params.indexOf(SEP2);
    if (firstComma === -1) {
      return null;
    }
    const game = params.substring(0, firstComma);

    const afterGame = params.substring(firstComma + 1);
    const secondComma = afterGame.indexOf(SEP2);
    if (secondComma === -1) {
      // Java's st.nextToken(sep) for opts would throw NoSuchElementException.
      return null;
    }

    const minVersStr = afterGame.substring(0, secondComma);
    const minVers = Number.parseInt(minVersStr, 10);
    if (!Number.isInteger(minVers) || String(minVers) !== minVersStr) {
      return null;
    }

    // nextToken(sep): value begins at the consumed SEP2 boundary, so it starts
    // with ",". (There are no SEP chars left in the data portion at this point.)
    let opts: string | null = afterGame.substring(secondComma);

    // Java: if (opts.equals("-")) opts = null;  — practically never true on the
    // wire because of the leading comma, but kept for byte-fidelity.
    if (opts === '-') {
      opts = null;
    }

    return new SOCNewGameWithOptions(game, minVers, opts);
  }
}

registerParser(MessageType.NEWGAMEWITHOPTIONS, SOCNewGameWithOptions.parse);
