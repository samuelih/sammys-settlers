// SOCDiscard — the resources a player chose to discard, or a server confirmation.
// Ported from src/main/java/soc/message/SOCDiscard.java.
//
// Wire format:
//   DISCARD SEP game SEP2 [ 'p' playerNumber SEP2 ] clay SEP2 ore SEP2 sheep
//     SEP2 wheat SEP2 wood SEP2 unknown
// NOTE: unlike the trade messages, this carries all SIX amounts including
// UNKNOWN (used to report the total amount discarded to other players as
// UNKNOWN=total). The optional player-number field is written as the literal
// "p<playerNumber>" token (v2.5.00+), deliberately placed near the START of the
// fields so older clients ignore the whole message rather than misread a trailing
// pn. Parsing: after the game name, if the next token starts with 'p' it's the
// player number; then exactly 6 integer amounts follow. Garbled -> null.
//
// From client this carries no player number (pn = -1).

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { type ResourceSet, parseIntStrict } from './resourceSet';

/**
 * Discarded resources. Mirrors Java {@code SOCDiscard}.
 */
export class SOCDiscard implements SOCMessage {
  readonly type = MessageType.DISCARD;

  /** Name of the game. */
  readonly game: string;

  /** Player number (server v2.5+), or -1 if none in message. */
  readonly playerNumber: number;

  /** The discarded resources (all six amounts, including UNKNOWN). */
  readonly resources: ResourceSet;

  /**
   * @param game          game name
   * @param playerNumber  player number, or -1 (default) to omit
   * @param resources     discarded resources (uses all six amounts)
   */
  constructor(game: string, playerNumber: number, resources: ResourceSet) {
    this.game = game;
    this.playerNumber = playerNumber;
    this.resources = resources;
  }

  toCmd(): string {
    const r = this.resources;
    const pnField = this.playerNumber >= 0 ? `p${this.playerNumber}${SEP2}` : '';
    return (
      `${MessageType.DISCARD}${SEP}${this.game}${SEP2}${pnField}` +
      `${r.clay}${SEP2}${r.ore}${SEP2}${r.sheep}${SEP2}${r.wheat}${SEP2}${r.wood}${SEP2}${r.unknown}`
    );
  }

  /**
   * Parse the data portion (game, ['p'pn,] 6 amounts).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCDiscard | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 7) {
      return null; // game + 6 amounts (no pn)
    }
    const game = tok[0];
    let idx = 1;
    let playerNumber = -1;
    if (tok[idx].charAt(0) === 'p') {
      const pn = parseIntStrict(tok[idx].substring(1));
      if (pn === null) {
        return null;
      }
      playerNumber = pn;
      idx += 1;
    }
    if (idx + 6 > tok.length) {
      return null; // need 6 amount tokens after optional pn
    }
    const amts: number[] = [];
    for (let i = 0; i < 6; ++i) {
      const n = parseIntStrict(tok[idx + i]);
      if (n === null) {
        return null;
      }
      amts.push(n);
    }
    const resources: ResourceSet = {
      clay: amts[0],
      ore: amts[1],
      sheep: amts[2],
      wheat: amts[3],
      wood: amts[4],
      unknown: amts[5],
    };
    return new SOCDiscard(game, playerNumber, resources);
  }
}

registerParser(MessageType.DISCARD, SOCDiscard.parse);
