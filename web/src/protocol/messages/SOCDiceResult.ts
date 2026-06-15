// SOCDiceResult — server reports the total amount rolled on the dice.
// Ported from src/main/java/soc/message/SOCDiceResult.java (extends SOCMessageTemplate1i).
//
// Wire format:  DICERESULT SEP game SEP2 result
// `result` is the dice total this turn, or -1 at game start / to clear the
// displayed result. Parsing reads two SEP2 tokens (game, result); garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseJavaInt } from '../javaInt';

/** Strict integer check matching Java Integer.parseInt (allows leading sign). */
function parseIntStrict(s: string): number | null {
  return parseJavaInt(s);
}

/**
 * Dice-roll total report. Mirrors Java {@code SOCDiceResult}.
 */
export class SOCDiceResult implements SOCMessage {
  readonly type = MessageType.DICERESULT;

  /** Name of the game. */
  readonly game: string;

  /** Dice total this turn (2..12), or -1 to clear. */
  readonly result: number;

  /**
   * @param game    game name
   * @param result  dice total, or -1
   */
  constructor(game: string, result: number) {
    this.game = game;
    this.result = result;
  }

  toCmd(): string {
    return `${MessageType.DICERESULT}${SEP}${this.game}${SEP2}${this.result}`;
  }

  /**
   * Parse the data portion. Mirrors Java: game = first SEP2 token, result = second.
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCDiceResult | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 2) {
      return null;
    }
    const result = parseIntStrict(tok[1]);
    if (result === null) {
      return null;
    }
    return new SOCDiceResult(tok[0], result);
  }
}

registerParser(MessageType.DICERESULT, SOCDiceResult.parse);
