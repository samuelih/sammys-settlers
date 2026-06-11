// SOCDiscardRequest — server asks a player to discard a number of cards.
// Ported from src/main/java/soc/message/SOCDiscardRequest.java.
//
// Wire format:  DISCARDREQUEST SEP game SEP2 numDiscards
// Client should respond with SOCDiscard. Same prompt/response pattern as
// SOCSimpleRequest(PROMPT_PICK_RESOURCES) / SOCPickResources. Parsing reads two
// SEP2 tokens; garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseIntStrict } from './resourceSet';

/**
 * Prompt to discard N cards. Mirrors Java {@code SOCDiscardRequest}.
 */
export class SOCDiscardRequest implements SOCMessage {
  readonly type = MessageType.DISCARDREQUEST;

  /** Name of the game. */
  readonly game: string;

  /** Number of cards to discard. */
  readonly numDiscards: number;

  /**
   * @param game         game name
   * @param numDiscards  number to discard
   */
  constructor(game: string, numDiscards: number) {
    this.game = game;
    this.numDiscards = numDiscards;
  }

  toCmd(): string {
    return `${MessageType.DISCARDREQUEST}${SEP}${this.game}${SEP2}${this.numDiscards}`;
  }

  /**
   * Parse the data portion (game, numDiscards).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCDiscardRequest | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 2) {
      return null;
    }
    const nd = parseIntStrict(tok[1]);
    if (nd === null) {
      return null;
    }
    return new SOCDiscardRequest(tok[0], nd);
  }
}

registerParser(MessageType.DISCARDREQUEST, SOCDiscardRequest.parse);
