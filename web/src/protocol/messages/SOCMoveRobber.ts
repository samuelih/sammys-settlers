// SOCMoveRobber — move the robber (positive coord) or pirate (negative coord).
// Ported from src/main/java/soc/message/SOCMoveRobber.java.
//
// Wire format:  MOVEROBBER SEP game SEP2 playerNumber SEP2 coordinates
// coordinates: POSITIVE hex coordinate moves the robber; NEGATIVE moves the
// pirate (e.g. pirate to hex 0x0104 is sent as -0x0104); 0 takes the pirate off
// the board. The constructor does NOT validate the sign. Parsing reads three
// SEP2 tokens; garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseIntStrict } from './resourceSet';

/**
 * Move the robber or pirate. Mirrors Java {@code SOCMoveRobber}.
 */
export class SOCMoveRobber implements SOCMessage {
  readonly type = MessageType.MOVEROBBER;

  /** Name of the game. */
  readonly game: string;

  /** Seat number moving the robber/pirate. */
  readonly playerNumber: number;

  /** Hex coordinate: positive = robber, negative or 0 = pirate. */
  readonly coordinates: number;

  /**
   * @param game          game name
   * @param playerNumber  seat number
   * @param coordinates   hex coordinate (positive robber, negative/0 pirate)
   */
  constructor(game: string, playerNumber: number, coordinates: number) {
    this.game = game;
    this.playerNumber = playerNumber;
    this.coordinates = coordinates;
  }

  toCmd(): string {
    return (
      `${MessageType.MOVEROBBER}${SEP}${this.game}` +
      `${SEP2}${this.playerNumber}${SEP2}${this.coordinates}`
    );
  }

  /**
   * Parse the data portion (game, playerNumber, coordinates).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCMoveRobber | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 3) {
      return null;
    }
    const pn = parseIntStrict(tok[1]);
    const co = parseIntStrict(tok[2]);
    if (pn === null || co === null) {
      return null;
    }
    return new SOCMoveRobber(tok[0], pn, co);
  }
}

registerParser(MessageType.MOVEROBBER, SOCMoveRobber.parse);
