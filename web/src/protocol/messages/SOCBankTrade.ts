// SOCBankTrade — request/announce a trade with the bank or a port.
// Ported from src/main/java/soc/message/SOCBankTrade.java.
//
// Wire format:
//   BANKTRADE SEP game
//     SEP2 giveClay SEP2 giveOre SEP2 giveSheep SEP2 giveWheat SEP2 giveWood
//     SEP2 getClay  SEP2 getOre  SEP2 getSheep  SEP2 getWheat  SEP2 getWood
//     [SEP2 playerNumber]
// The two resource sets are each the five known amounts CLAY..WOOD (no UNKNOWN).
// playerNumber is sent only when != -1 (server announcement carries the trading
// player; a client request uses -1 and omits the field). Parsing reads 11 SEP2
// tokens (game + 10 amounts), optionally a 12th playerNumber; garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import {
  type ResourceSet,
  giveGetToInts,
  parseIntStrict,
  resourceSetFromInts,
} from './resourceSet';

/**
 * Bank/port trade request or announcement. Mirrors Java {@code SOCBankTrade}.
 */
export class SOCBankTrade implements SOCMessage {
  readonly type = MessageType.BANKTRADE;

  /** Name of the game. */
  readonly game: string;

  /** Resources being given to the bank/port (UNKNOWN ignored). */
  readonly give: ResourceSet;

  /** Resources being taken from the bank/port (UNKNOWN ignored). */
  readonly get: ResourceSet;

  /** Trading player number (from server), or -1 for a client request. */
  readonly playerNumber: number;

  /**
   * @param game          game name
   * @param give          resources given to the bank/port
   * @param get           resources taken from the bank/port
   * @param playerNumber  trading player number, or -1 (default) to omit
   */
  constructor(game: string, give: ResourceSet, get: ResourceSet, playerNumber = -1) {
    this.game = game;
    this.give = give;
    this.get = get;
    this.playerNumber = playerNumber;
  }

  toCmd(): string {
    let cmd = `${MessageType.BANKTRADE}${SEP}${this.game}`;
    for (const n of giveGetToInts(this.give)) {
      cmd += `${SEP2}${n}`;
    }
    for (const n of giveGetToInts(this.get)) {
      cmd += `${SEP2}${n}`;
    }
    if (this.playerNumber !== -1) {
      cmd += `${SEP2}${this.playerNumber}`;
    }
    return cmd;
  }

  /**
   * Parse the data portion (game, 10 amounts, [playerNumber]).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCBankTrade | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 11) {
      return null; // game + 5 give + 5 get
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
    const give = resourceSetFromInts(amounts, 0);
    const get = resourceSetFromInts(amounts, 5);
    if (give === null || get === null) {
      return null;
    }
    const playerNumber = amounts.length > 10 ? amounts[10] : -1;
    return new SOCBankTrade(game, give, get, playerNumber);
  }
}

registerParser(MessageType.BANKTRADE, SOCBankTrade.parse);
