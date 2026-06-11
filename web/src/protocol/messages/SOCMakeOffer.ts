// SOCMakeOffer — make/update or announce a player-to-player trade offer.
// Ported from src/main/java/soc/message/SOCMakeOffer.java (+ soc.game.SOCTradeOffer).
//
// Wire format:
//   MAKEOFFER SEP game
//     SEP2 from
//     SEP2 to[0] SEP2 to[1] ... SEP2 to[maxPlayers-1]   (lowercase "true"/"false")
//     SEP2 giveClay SEP2 giveOre SEP2 giveSheep SEP2 giveWheat SEP2 giveWood
//     SEP2 getClay  SEP2 getOre  SEP2 getSheep  SEP2 getWheat  SEP2 getWood
//
// The `to` boolean array has one element per player number (== game.maxPlayers,
// 4 or 6). Its length is NOT sent explicitly: the Java parser computes it as
// (token count after `from`) - 10, since the last 10 tokens are the two 5-int
// resource sets. So the port must do the same. Booleans are Java
// Boolean.toString()/valueOf(): only the exact (case-insensitive) string "true"
// is true; anything else is false. Any UNKNOWN resources are never sent (the
// give/get blocks are CLAY..WOOD only). Parsing needs >= 12 tokens (game, from,
// >=1 `to`, 10 amounts); garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import {
  type ResourceSet,
  giveGetToInts,
  parseIntStrict,
  resourceSetFromInts,
} from './resourceSet';

/** A player-to-player trade offer (mirrors {@code soc.game.SOCTradeOffer}). */
export interface TradeOffer {
  /** Player number making the offer (ignored by server when sent from client). */
  from: number;
  /** One flag per player number: true = offer is made to that player. */
  to: boolean[];
  /** Resources offered by the {@code from} player. */
  give: ResourceSet;
  /** Resources wanted in exchange (given to the {@code from} player). */
  get: ResourceSet;
}

/**
 * Make/update or announce a trade offer. Mirrors Java {@code SOCMakeOffer}.
 */
export class SOCMakeOffer implements SOCMessage {
  readonly type = MessageType.MAKEOFFER;

  /** Name of the game. */
  readonly game: string;

  /** The trade offer. */
  readonly offer: TradeOffer;

  /**
   * @param game   game name
   * @param offer  the trade offer
   */
  constructor(game: string, offer: TradeOffer) {
    this.game = game;
    this.offer = offer;
  }

  toCmd(): string {
    let cmd = `${MessageType.MAKEOFFER}${SEP}${this.game}${SEP2}${this.offer.from}`;
    for (const t of this.offer.to) {
      cmd += `${SEP2}${t ? 'true' : 'false'}`;
    }
    for (const n of giveGetToInts(this.offer.give)) {
      cmd += `${SEP2}${n}`;
    }
    for (const n of giveGetToInts(this.offer.get)) {
      cmd += `${SEP2}${n}`;
    }
    return cmd;
  }

  /**
   * Parse the data portion (game, from, to[...], 10 amounts).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCMakeOffer | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    // game, from, >=1 `to`, 10 resource amounts
    if (tok.length < 13) {
      return null;
    }
    const game = tok[0];
    const from = parseIntStrict(tok[1]);
    if (from === null) {
      return null;
    }

    // Java: numPlayerTokens = countTokens() - (2 * 5). countTokens() here is the
    // number of tokens AFTER `from`, i.e. tok.length - 2. So `to` length is that
    // minus 10 (the two resource sets).
    const afterFrom = tok.length - 2;
    const numTo = afterFrom - 10;
    if (numTo < 1) {
      return null;
    }

    const to: boolean[] = [];
    for (let i = 0; i < numTo; ++i) {
      // Java Boolean.valueOf: true only for case-insensitive "true".
      to.push(tok[2 + i].toLowerCase() === 'true');
    }

    const amounts: number[] = [];
    for (let i = 2 + numTo; i < tok.length; ++i) {
      const n = parseIntStrict(tok[i]);
      if (n === null) {
        return null;
      }
      amounts.push(n);
    }
    if (amounts.length !== 10) {
      return null;
    }
    const give = resourceSetFromInts(amounts, 0);
    const get = resourceSetFromInts(amounts, 5);
    if (give === null || get === null) {
      return null;
    }

    return new SOCMakeOffer(game, { from, to, give, get });
  }
}

registerParser(MessageType.MAKEOFFER, SOCMakeOffer.parse);
