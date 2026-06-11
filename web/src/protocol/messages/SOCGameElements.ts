// SOCGameElements — set/update several game-status fields in one message.
// Ported from src/main/java/soc/message/SOCGameElements.java
// (extends SOCMessageTemplateMi).
//
// Wire format (SEP between every field):
//   GAMEELEMENTS SEP game SEP elemType0 SEP value0 SEP elemType1 SEP value1 ...
// Replaces older single-purpose messages (SOCLongestRoad, SOCSetTurn, etc) for
// v2.0.00+ clients. Element types are GameElementType values (CURRENT_PLAYER,
// DEV_CARD_COUNT, FIRST_PLAYER, LONGEST_ROAD_PLAYER, LARGEST_ARMY_PLAYER, ...).
//
// Java requires the full param list (incl. game) to have length >= 3 and be odd,
// i.e. at least one (elemType, value) pair; garbled -> null.

import { MessageType } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseTemplateMi, templateMiToCmd } from './templateMi';

/**
 * Batch of game-status field updates. Mirrors Java {@code SOCGameElements}.
 */
export class SOCGameElements implements SOCMessage {
  readonly type = MessageType.GAMEELEMENTS;

  /** Name of the game. */
  readonly game: string;

  /** Element types (GameElementType values), parallel to {@link values}. */
  readonly elementTypes: readonly number[];

  /** New values, parallel to {@link elementTypes}. */
  readonly values: readonly number[];

  /**
   * @param game          game name
   * @param elementTypes  element types
   * @param values        values, same length as elementTypes
   * @throws Error if elementTypes and values differ in length (Java parity)
   */
  constructor(
    game: string,
    elementTypes: readonly number[],
    values: readonly number[],
  ) {
    if (elementTypes.length !== values.length) {
      throw new Error('lengths');
    }
    this.game = game;
    this.elementTypes = elementTypes;
    this.values = values;
  }

  /** The flat int param array (interleaved type/value pairs). */
  getParams(): number[] {
    const pa: number[] = [];
    for (let i = 0; i < this.elementTypes.length; ++i) {
      pa.push(this.elementTypes[i]);
      pa.push(this.values[i]);
    }
    return pa;
  }

  toCmd(): string {
    return templateMiToCmd(MessageType.GAMEELEMENTS, this.game, this.getParams());
  }

  /**
   * Parse the data portion. Mirrors Java: needs >= 1 type/value pair; the param
   * count after game must be even and >= 2.
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(data: string): SOCGameElements | null {
    const parts = parseTemplateMi(data);
    if (parts === null) {
      return null;
    }
    const { game, params } = parts;
    // params = [et0, val0, et1, val1, ...]; need >= 2 and even.
    if (params.length < 2 || params.length % 2 !== 0) {
      return null;
    }
    const elementTypes: number[] = [];
    const values: number[] = [];
    for (let i = 0; i < params.length; i += 2) {
      elementTypes.push(params[i]);
      values.push(params[i + 1]);
    }
    return new SOCGameElements(game, elementTypes, values);
  }
}

registerParser(MessageType.GAMEELEMENTS, SOCGameElements.parse);
