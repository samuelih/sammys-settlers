// SOCSimpleAction — generic in-game action/event from server with 2 detail values.
// Ported from src/main/java/soc/message/SOCSimpleAction.java
// (extends SOCMessageTemplate4i). @since 1.1.19
//
// Wire format:  SIMPLEACTION SEP game SEP2 playerNumber SEP2 actType SEP2 value1 SEP2 value2
// All four int fields are ALWAYS present. playerNumber may be -1 if the action
// isn't about a specific player. actType is a SimpleActionType code
// (DEVCARD_BOUGHT=1, RSRC_TYPE_MONOPOLIZED=3, BOARD_EDGE_SET_SPECIAL=4, ...).
// This message comes AFTER any messages that updated game/player data. Parsing
// reads exactly 5 SEP2 tokens; garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseIntStrict } from './resourceSet';

/**
 * Generic in-game action/event. Mirrors Java {@code SOCSimpleAction}.
 */
export class SOCSimpleAction implements SOCMessage {
  readonly type = MessageType.SIMPLEACTION;

  /** Name of the game. */
  readonly game: string;

  /** Player acting/acted on, or -1 if not about a specific player. */
  readonly playerNumber: number;

  /** Action type code (SimpleActionType). */
  readonly actType: number;

  /** First optional detail value, or 0. */
  readonly value1: number;

  /** Second optional detail value, or 0. */
  readonly value2: number;

  /**
   * @param game          game name
   * @param playerNumber  player number, or -1
   * @param actType       action type code
   * @param value1        first detail value (default 0)
   * @param value2        second detail value (default 0)
   */
  constructor(game: string, playerNumber: number, actType: number, value1 = 0, value2 = 0) {
    this.game = game;
    this.playerNumber = playerNumber;
    this.actType = actType;
    this.value1 = value1;
    this.value2 = value2;
  }

  toCmd(): string {
    return (
      `${MessageType.SIMPLEACTION}${SEP}${this.game}` +
      `${SEP2}${this.playerNumber}${SEP2}${this.actType}` +
      `${SEP2}${this.value1}${SEP2}${this.value2}`
    );
  }

  /**
   * Parse the data portion (game, pn, actType, value1, value2).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCSimpleAction | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 5) {
      return null;
    }
    const pn = parseIntStrict(tok[1]);
    const at = parseIntStrict(tok[2]);
    const v1 = parseIntStrict(tok[3]);
    const v2 = parseIntStrict(tok[4]);
    if (pn === null || at === null || v1 === null || v2 === null) {
      return null;
    }
    return new SOCSimpleAction(tok[0], pn, at, v1, v2);
  }
}

registerParser(MessageType.SIMPLEACTION, SOCSimpleAction.parse);
