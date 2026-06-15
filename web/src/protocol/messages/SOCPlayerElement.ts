// SOCPlayerElement — server conveys one part of a player's status.
// Ported from src/main/java/soc/message/SOCPlayerElement.java.
//
// Wire format:
//   PLAYERELEMENT SEP game SEP2 playerNumber SEP2 actionType SEP2 elementType
//     SEP2 amount [SEP2 'Y']
// The trailing 'Y' token is present iff isNews is true. On the wire the action
// type is always SET(100)/GAIN(101)/LOSE(102); the news flag is carried by the
// 'Y' token (the Java *_NEWS pseudo-actions are internal convenience values that
// never appear on the wire). playerNumber may be -1 for some element types.
// Parsing reads 5 or 6 SEP2 tokens; garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseJavaInt } from '../javaInt';

/** Strict integer check matching Java Integer.parseInt (allows leading sign). */
function parseIntStrict(s: string): number | null {
  return parseJavaInt(s);
}

/**
 * One player-status element change. Mirrors Java {@code SOCPlayerElement}.
 */
export class SOCPlayerElement implements SOCMessage {
  readonly type = MessageType.PLAYERELEMENT;

  /** Name of the game. */
  readonly game: string;

  /** Seat number, or -1 for board/all-player elements. */
  readonly playerNumber: number;

  /** Action: SET(100), GAIN(101), or LOSE(102). */
  readonly actionType: number;

  /** Element type (PlayerElementType value). */
  readonly elementType: number;

  /** Amount to set, gain, or lose. */
  readonly amount: number;

  /** True if this is a notable/unexpected gain or loss (sound cue). */
  readonly news: boolean;

  /**
   * @param game          game name
   * @param playerNumber  seat number, or -1
   * @param actionType    SET(100)/GAIN(101)/LOSE(102)
   * @param elementType   element type
   * @param amount        amount to set/gain/lose
   * @param news          notable-news flag (default false)
   */
  constructor(
    game: string,
    playerNumber: number,
    actionType: number,
    elementType: number,
    amount: number,
    news = false,
  ) {
    this.game = game;
    this.playerNumber = playerNumber;
    this.actionType = actionType;
    this.elementType = elementType;
    this.amount = amount;
    this.news = news;
  }

  toCmd(): string {
    let cmd =
      `${MessageType.PLAYERELEMENT}${SEP}${this.game}` +
      `${SEP2}${this.playerNumber}${SEP2}${this.actionType}` +
      `${SEP2}${this.elementType}${SEP2}${this.amount}`;
    if (this.news) {
      cmd += `${SEP2}Y`;
    }
    return cmd;
  }

  /**
   * Parse the data portion. Mirrors Java: 5 required tokens plus an optional
   * 6th 'Y' token for the news flag.
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCPlayerElement | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 5) {
      return null;
    }
    const pn = parseIntStrict(tok[1]);
    const ac = parseIntStrict(tok[2]);
    const et = parseIntStrict(tok[3]);
    const amt = parseIntStrict(tok[4]);
    if (pn === null || ac === null || et === null || amt === null) {
      return null;
    }
    const news = tok.length > 5 && tok[5] === 'Y';
    return new SOCPlayerElement(tok[0], pn, ac, et, amt, news);
  }
}

registerParser(MessageType.PLAYERELEMENT, SOCPlayerElement.parse);
