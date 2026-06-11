// SOCDeclinePlayerRequest — server declines a player's request, with a reason.
// Ported from src/main/java/soc/message/SOCDeclinePlayerRequest.java. @since 2.5.00
//
// Wire format:
//   DECLINEPLAYERREQUEST SEP gameName SEP2 gameState SEP2 reasonCode
//     [SEP2 detailValue1 SEP2 detailValue2 [SEP2 reasonText]]
// The optional tail (detail1, detail2, optional reasonText) is emitted only when
// (detailValue1 != 0) || (detailValue2 != 0) || (reasonText != null). When the
// tail is present, detail1 and detail2 are always both present; reasonText is
// last and MAY CONTAIN COMMAS (the Java parser reads "the rest of the string"
// for it, via an unlikely delimiter, then strips one leading SEP2 and trims).
// reasonCode is a DeclineReason code. Parsing: 3 required fields, optional 2 more
// detail fields, then an optional comma-bearing reasonText. Garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseIntStrict } from './resourceSet';

/**
 * Server decline of a player request. Mirrors Java {@code SOCDeclinePlayerRequest}.
 */
export class SOCDeclinePlayerRequest implements SOCMessage {
  readonly type = MessageType.DECLINEPLAYERREQUEST;

  /** Name of the game. */
  readonly game: string;

  /** Optional current game state, or 0. */
  readonly gameState: number;

  /** Reason the request was declined (DeclineReason code). */
  readonly reasonCode: number;

  /** Optional detail value related to the reason, or 0. */
  readonly detailValue1: number;

  /** Optional detail value related to the reason, or 0. */
  readonly detailValue2: number;

  /** Optional localized reason text, or null (client picks text from reasonCode). */
  readonly reasonText: string | null;

  /**
   * @param game          game name
   * @param gameState     current game state, or 0
   * @param reasonCode    DeclineReason code
   * @param detailValue1  detail value (default 0)
   * @param detailValue2  detail value (default 0)
   * @param reasonText    localized reason text, or null (default)
   */
  constructor(
    game: string,
    gameState: number,
    reasonCode: number,
    detailValue1 = 0,
    detailValue2 = 0,
    reasonText: string | null = null,
  ) {
    this.game = game;
    this.gameState = gameState;
    this.reasonCode = reasonCode;
    this.detailValue1 = detailValue1;
    this.detailValue2 = detailValue2;
    this.reasonText = reasonText;
  }

  toCmd(): string {
    let cmd =
      `${MessageType.DECLINEPLAYERREQUEST}${SEP}${this.game}` +
      `${SEP2}${this.gameState}${SEP2}${this.reasonCode}`;
    if (this.detailValue1 !== 0 || this.detailValue2 !== 0 || this.reasonText !== null) {
      cmd += `${SEP2}${this.detailValue1}${SEP2}${this.detailValue2}`;
      if (this.reasonText !== null) {
        cmd += `${SEP2}${this.reasonText}`;
      }
    }
    return cmd;
  }

  /**
   * Parse the data portion. Mirrors Java {@code parseDataStr}, including reading
   * the comma-bearing reasonText as the remainder of the string.
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCDeclinePlayerRequest | null {
    // Read up to the first 5 SEP2-delimited fields manually so a comma-bearing
    // reasonText (field 6+) isn't split. Java's StringTokenizer skips empty
    // tokens for the leading fields, but those numeric fields can't be empty.
    const fields: string[] = [];
    let rest = params;
    // We need at most 5 leading numeric fields before reasonText.
    for (let n = 0; n < 5; ++n) {
      const idx = rest.indexOf(SEP2);
      if (idx === -1) {
        fields.push(rest);
        rest = '';
        break;
      }
      fields.push(rest.substring(0, idx));
      rest = rest.substring(idx + 1);
    }
    // After 5 fields are taken, `rest` (if non-empty) is the reasonText, which
    // may still hold commas. Java strips a single leading SEP2 and trims.

    if (fields.length < 3) {
      return null;
    }
    const game = fields[0];
    const gaState = parseIntStrict(fields[1]);
    const rcode = parseIntStrict(fields[2]);
    if (gaState === null || rcode === null) {
      return null;
    }

    let detail1 = 0;
    let detail2 = 0;
    let reasonText: string | null = null;
    if (fields.length >= 5) {
      const d1 = parseIntStrict(fields[3]);
      const d2 = parseIntStrict(fields[4]);
      if (d1 === null || d2 === null) {
        return null;
      }
      detail1 = d1;
      detail2 = d2;
      if (rest.length > 0) {
        // Java reads ","+reasonText as one token, applies String.trim() (which
        // can't remove the leading comma), THEN strips that leading comma. Net
        // effect: trailing whitespace is removed but leading whitespace of the
        // text is preserved. Reproduce that exactly (our `rest` already excludes
        // the leading comma we consumed as a field delimiter).
        reasonText = rest.replace(/\s+$/, '');
      }
    } else if (fields.length === 4) {
      // Java would throw reading the 2nd detail token -> null.
      return null;
    }

    return new SOCDeclinePlayerRequest(game, gaState, rcode, detail1, detail2, reasonText);
  }
}

registerParser(MessageType.DECLINEPLAYERREQUEST, SOCDeclinePlayerRequest.parse);
