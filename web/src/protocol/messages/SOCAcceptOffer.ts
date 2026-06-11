// SOCAcceptOffer — accept a trade offer; from server (v2.5+) carries the traded resources.
// Ported from src/main/java/soc/message/SOCAcceptOffer.java.
//
// Wire format:
//   ACCEPTOFFER SEP game SEP2 accepting SEP2 offering
//     [ SEP2 toAcceptingClay..Wood (5) SEP2 toOfferingClay..Wood (5) ]
// The two optional 5-int resource blocks (resources given to each player) are
// present only in the v2.5.00+ server announcement; a client request and older
// servers omit them. Both blocks are present together or both absent. From
// client, `accepting` is ignored by the server. Parsing reads 3 SEP2 tokens, or
// 13 (3 + 10 amounts); garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import {
  type ResourceSet,
  giveGetToInts,
  parseIntStrict,
  resourceSetFromInts,
} from './resourceSet';

/**
 * Accept a trade offer. Mirrors Java {@code SOCAcceptOffer}.
 */
export class SOCAcceptOffer implements SOCMessage {
  readonly type = MessageType.ACCEPTOFFER;

  /** Name of the game. */
  readonly game: string;

  /** Accepting player number (from server); ignored when sent from client. */
  readonly accepting: number;

  /** Offering player number whose offer is being accepted. */
  readonly offering: number;

  /** Resources given to the accepting player (server v2.5+), or null. */
  readonly resToAccepting: ResourceSet | null;

  /** Resources given to the offering player (server v2.5+), or null. */
  readonly resToOffering: ResourceSet | null;

  /**
   * @param game            game name
   * @param accepting       accepting player number
   * @param offering        offering player number
   * @param resToAccepting  resources to accepting player, or null (default)
   * @param resToOffering   resources to offering player, or null (default)
   * @throws Error if exactly one of the resource sets is null (Java parity)
   */
  constructor(
    game: string,
    accepting: number,
    offering: number,
    resToAccepting: ResourceSet | null = null,
    resToOffering: ResourceSet | null = null,
  ) {
    if ((resToAccepting === null) !== (resToOffering === null)) {
      throw new Error('toAc, toOf: inconsistent nulls');
    }
    this.game = game;
    this.accepting = accepting;
    this.offering = offering;
    this.resToAccepting = resToAccepting;
    this.resToOffering = resToOffering;
  }

  toCmd(): string {
    let cmd =
      `${MessageType.ACCEPTOFFER}${SEP}${this.game}` +
      `${SEP2}${this.accepting}${SEP2}${this.offering}`;
    if (this.resToAccepting !== null && this.resToOffering !== null) {
      for (const n of giveGetToInts(this.resToAccepting)) {
        cmd += `${SEP2}${n}`;
      }
      for (const n of giveGetToInts(this.resToOffering)) {
        cmd += `${SEP2}${n}`;
      }
    }
    return cmd;
  }

  /**
   * Parse the data portion (game, accepting, offering, [10 amounts]).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCAcceptOffer | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 3) {
      return null;
    }
    const ac = parseIntStrict(tok[1]);
    const of = parseIntStrict(tok[2]);
    if (ac === null || of === null) {
      return null;
    }

    let toAc: ResourceSet | null = null;
    let toOf: ResourceSet | null = null;
    if (tok.length > 3) {
      const amounts: number[] = [];
      for (let i = 3; i < tok.length; ++i) {
        const n = parseIntStrict(tok[i]);
        if (n === null) {
          return null;
        }
        amounts.push(n);
      }
      if (amounts.length < 10) {
        return null;
      }
      toAc = resourceSetFromInts(amounts, 0);
      toOf = resourceSetFromInts(amounts, 5);
      if (toAc === null || toOf === null) {
        return null;
      }
    }

    return new SOCAcceptOffer(tok[0], ac, of, toAc, toOf);
  }
}

registerParser(MessageType.ACCEPTOFFER, SOCAcceptOffer.parse);
