// SOCPickResources — resources picked (Year of Plenty / Gold Hex), or server announcement.
// Ported from src/main/java/soc/message/SOCPickResources.java.
//
// Wire format:
//   PICKRESOURCES SEP game SEP2 clay SEP2 ore SEP2 sheep SEP2 wheat SEP2 wood
//     [SEP2 playerNumber SEP2 reasonCode]
// The five known amounts CLAY..WOOD (no UNKNOWN). playerNumber + reasonCode are
// emitted together, only when (playerNumber != 0) || (reasonCode != 0) — used by
// the v2.5.00+ server announcement (reasonCode is PickResourcesReason). A client
// request omits them. Parsing reads 6 SEP2 tokens (game + 5 amounts), optionally
// 8 (with pn + reasonCode); garbled -> null.
//
// Before v2.0.00 this class was SOCDiscoveryPick.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import {
  type ResourceSet,
  giveGetToInts,
  parseIntStrict,
  resourceSetFromInts,
} from './resourceSet';

/**
 * Picked resources / gold-hex pick. Mirrors Java {@code SOCPickResources}.
 */
export class SOCPickResources implements SOCMessage {
  readonly type = MessageType.PICKRESOURCES;

  /** Name of the game. */
  readonly game: string;

  /** The picked resources (UNKNOWN ignored). */
  readonly resources: ResourceSet;

  /** Player number (from server), or 0 from client. */
  readonly playerNumber: number;

  /** Reason code (PickResourcesReason) from server, or 0. */
  readonly reasonCode: number;

  /**
   * @param game          game name
   * @param resources     picked resources
   * @param playerNumber  player number, or 0 (default)
   * @param reasonCode    reason code, or 0 (default)
   */
  constructor(game: string, resources: ResourceSet, playerNumber = 0, reasonCode = 0) {
    this.game = game;
    this.resources = resources;
    this.playerNumber = playerNumber;
    this.reasonCode = reasonCode;
  }

  toCmd(): string {
    let cmd = `${MessageType.PICKRESOURCES}${SEP}${this.game}`;
    for (const n of giveGetToInts(this.resources)) {
      cmd += `${SEP2}${n}`;
    }
    if (this.playerNumber !== 0 || this.reasonCode !== 0) {
      cmd += `${SEP2}${this.playerNumber}${SEP2}${this.reasonCode}`;
    }
    return cmd;
  }

  /**
   * Parse the data portion (game, 5 amounts, [playerNumber, reasonCode]).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCPickResources | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 6) {
      return null;
    }
    const game = tok[0];
    const amounts: number[] = [];
    for (let i = 1; i < tok.length; ++i) {
      const n = parseIntStrict(tok[i]);
      if (n === null) {
        return null;
      }
      amounts.push(n);
    }
    const resources = resourceSetFromInts(amounts, 0);
    if (resources === null) {
      return null;
    }
    let playerNumber = 0;
    let reasonCode = 0;
    if (amounts.length > 5) {
      // Java reads exactly two more tokens; if only one is present it throws -> null.
      if (amounts.length < 7) {
        return null;
      }
      playerNumber = amounts[5];
      reasonCode = amounts[6];
    }
    return new SOCPickResources(game, resources, playerNumber, reasonCode);
  }
}

registerParser(MessageType.PICKRESOURCES, SOCPickResources.parse);
