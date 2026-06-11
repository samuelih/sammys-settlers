// SOCPickResourceType — resource type chosen (Monopoly card).
// Ported from src/main/java/soc/message/SOCPickResourceType.java.
//
// Wire format:  PICKRESOURCETYPE SEP game SEP2 resourceType
// resourceType is a Resource value (CLAY=1..WOOD=5). Sent from current player's
// client in response to GAMESTATE(WAITING_FOR_MONOPOLY). Parsing reads two SEP2
// tokens; garbled -> null. Before v2.0.00 this class was SOCMonopolyPick.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseIntStrict } from './resourceSet';

/**
 * Chosen resource type for Monopoly. Mirrors Java {@code SOCPickResourceType}.
 */
export class SOCPickResourceType implements SOCMessage {
  readonly type = MessageType.PICKRESOURCETYPE;

  /** Name of the game. */
  readonly game: string;

  /** The chosen resource type (Resource value). */
  readonly resourceType: number;

  /**
   * @param game          game name
   * @param resourceType  chosen resource type
   */
  constructor(game: string, resourceType: number) {
    this.game = game;
    this.resourceType = resourceType;
  }

  toCmd(): string {
    return `${MessageType.PICKRESOURCETYPE}${SEP}${this.game}${SEP2}${this.resourceType}`;
  }

  /**
   * Parse the data portion (game, resourceType).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCPickResourceType | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 2) {
      return null;
    }
    const rs = parseIntStrict(tok[1]);
    if (rs === null) {
      return null;
    }
    return new SOCPickResourceType(tok[0], rs);
  }
}

registerParser(MessageType.PICKRESOURCETYPE, SOCPickResourceType.parse);
