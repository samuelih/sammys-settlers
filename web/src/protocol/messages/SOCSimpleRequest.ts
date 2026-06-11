// SOCSimpleRequest — generic player request / server prompt with 2 detail values.
// Ported from src/main/java/soc/message/SOCSimpleRequest.java
// (extends SOCMessageTemplate4i). @since 1.1.18
//
// Wire format:  SIMPLEREQUEST SEP game SEP2 playerNumber SEP2 reqType SEP2 value1 SEP2 value2
// All four int fields are ALWAYS present (the template4i toCmd writes every
// field even when 0). reqType is a SimpleRequestType code (PROMPT_PICK_RESOURCES=1,
// SC_PIRI_FORT_ATTACK=1000, TRADE_PORT_PLACE=1001). Parsing reads exactly 5 SEP2
// tokens; garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseIntStrict } from './resourceSet';

/**
 * Generic player request / server prompt. Mirrors Java {@code SOCSimpleRequest}.
 */
export class SOCSimpleRequest implements SOCMessage {
  readonly type = MessageType.SIMPLEREQUEST;

  /** Name of the game. */
  readonly game: string;

  /** Requesting player number (or -1 in a server denial reply). */
  readonly playerNumber: number;

  /** Request type code (SimpleRequestType). */
  readonly reqType: number;

  /** First optional detail value, or 0. */
  readonly value1: number;

  /** Second optional detail value, or 0. */
  readonly value2: number;

  /**
   * @param game          game name
   * @param playerNumber  requesting player number
   * @param reqType       request type code
   * @param value1        first detail value (default 0)
   * @param value2        second detail value (default 0)
   */
  constructor(game: string, playerNumber: number, reqType: number, value1 = 0, value2 = 0) {
    this.game = game;
    this.playerNumber = playerNumber;
    this.reqType = reqType;
    this.value1 = value1;
    this.value2 = value2;
  }

  toCmd(): string {
    return (
      `${MessageType.SIMPLEREQUEST}${SEP}${this.game}` +
      `${SEP2}${this.playerNumber}${SEP2}${this.reqType}` +
      `${SEP2}${this.value1}${SEP2}${this.value2}`
    );
  }

  /**
   * Parse the data portion (game, pn, reqType, value1, value2).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCSimpleRequest | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 5) {
      return null;
    }
    const pn = parseIntStrict(tok[1]);
    const rt = parseIntStrict(tok[2]);
    const v1 = parseIntStrict(tok[3]);
    const v2 = parseIntStrict(tok[4]);
    if (pn === null || rt === null || v1 === null || v2 === null) {
      return null;
    }
    return new SOCSimpleRequest(tok[0], pn, rt, v1, v2);
  }
}

registerParser(MessageType.SIMPLEREQUEST, SOCSimpleRequest.parse);
