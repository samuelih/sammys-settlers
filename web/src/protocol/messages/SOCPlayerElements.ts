// SOCPlayerElements — several player-status element changes in one message.
// Ported from src/main/java/soc/message/SOCPlayerElements.java
// (extends SOCMessageTemplateMi).
//
// Wire format (SEP between every field):
//   PLAYERELEMENTS SEP game SEP playerNumber SEP actionType
//     SEP elemType0 SEP amount0 SEP elemType1 SEP amount1 ...
// Same payload as a batch of SOCPlayerElement messages sharing one playerNumber
// and actionType, but cheaper to send. There is no "isNews" flag. Server-only;
// min client version 2.0.00.
//
// Java requires the full param list (incl. game) to have length >= 5 and be odd,
// i.e. at least one (elemType, amount) pair after game/pn/action; garbled -> null.

import { MessageType } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseTemplateMi, templateMiToCmd } from './templateMi';

/**
 * Batch of player-status element changes. Mirrors Java {@code SOCPlayerElements}.
 */
export class SOCPlayerElements implements SOCMessage {
  readonly type = MessageType.PLAYERELEMENTS;

  /** Name of the game. */
  readonly game: string;

  /** Seat number, or -1 for all-player elements. */
  readonly playerNumber: number;

  /** Action: SET(100), GAIN(101), or LOSE(102). */
  readonly actionType: number;

  /** Element types (PlayerElementType values), parallel to {@link amounts}. */
  readonly elementTypes: readonly number[];

  /** Amounts to set/change, parallel to {@link elementTypes}. */
  readonly amounts: readonly number[];

  /**
   * @param game          game name
   * @param playerNumber  seat number, or -1
   * @param actionType    SET(100)/GAIN(101)/LOSE(102)
   * @param elementTypes  element types
   * @param amounts       amounts, same length as elementTypes
   * @throws Error if elementTypes and amounts differ in length (Java parity)
   */
  constructor(
    game: string,
    playerNumber: number,
    actionType: number,
    elementTypes: readonly number[],
    amounts: readonly number[],
  ) {
    if (elementTypes.length !== amounts.length) {
      throw new Error('lengths');
    }
    this.game = game;
    this.playerNumber = playerNumber;
    this.actionType = actionType;
    this.elementTypes = elementTypes;
    this.amounts = amounts;
  }

  /**
   * The flat int param array (pn, action, then interleaved type/amount pairs),
   * as built by the Java server constructor.
   */
  getParams(): number[] {
    const pa: number[] = [this.playerNumber, this.actionType];
    for (let i = 0; i < this.elementTypes.length; ++i) {
      pa.push(this.elementTypes[i]);
      pa.push(this.amounts[i]);
    }
    return pa;
  }

  toCmd(): string {
    return templateMiToCmd(MessageType.PLAYERELEMENTS, this.game, this.getParams());
  }

  /**
   * Parse the data portion. Mirrors Java: needs pn, action, and >= 1 type/amount
   * pair; the param count after game must be even and >= 4.
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(data: string): SOCPlayerElements | null {
    const parts = parseTemplateMi(data);
    if (parts === null) {
      return null;
    }
    const { game, params } = parts;
    // params = [pn, action, et0, amt0, et1, amt1, ...]; need >= 4 and even.
    if (params.length < 4 || params.length % 2 !== 0) {
      return null;
    }
    const playerNumber = params[0];
    const actionType = params[1];
    const elementTypes: number[] = [];
    const amounts: number[] = [];
    for (let i = 2; i < params.length; i += 2) {
      elementTypes.push(params[i]);
      amounts.push(params[i + 1]);
    }
    return new SOCPlayerElements(game, playerNumber, actionType, elementTypes, amounts);
  }
}

registerParser(MessageType.PLAYERELEMENTS, SOCPlayerElements.parse);
