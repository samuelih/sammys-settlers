// SOCDevCardAction — a player is drawing/playing/adding/removing a development card.
// Ported from src/main/java/soc/message/SOCDevCardAction.java.
//
// Wire format:
//   DEVCARDACTION SEP game SEP2 playerNumber SEP2 actionType SEP2 cardType [SEP2 cardType ...]
// Single-card form has exactly one cardType; the multi-card form (2+ cardTypes)
// is used only at end-of-game to reveal hidden VP cards. actionType is a
// DevCardAction value (DRAW=0, PLAY=1, ADD_NEW=2, ADD_OLD=3, CANNOT_PLAY=4,
// REMOVE_NEW=5, REMOVE_OLD=6). cardType is a DevCardType value (UNKNOWN=0,
// ROADS=1, ..., KNIGHT=9). For CANNOT_PLAY, playerNumber is always -1.
//
// Parse subtleties (matching Java):
//  * needs >= 4 tokens (game, pn, ac, ct); garbled -> null.
//  * if there's a 5th token, ALL trailing card types form `cardTypes` (a list),
//    and `cardType` becomes unused. So `cardTypes != null` iff there were >= 2
//    card-type tokens.
//  * more than MAX_MULTIPLE (100) card types -> null (DoS guard).

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseIntStrict } from './resourceSet';

/** Maximum number of card types in one message (Java {@code MAX_MULTIPLE}). */
export const DEVCARD_MAX_MULTIPLE = 100;

/**
 * A dev-card draw/play/add/remove. Mirrors Java {@code SOCDevCardAction}.
 */
export class SOCDevCardAction implements SOCMessage {
  readonly type = MessageType.DEVCARDACTION;

  /** Name of the game. */
  readonly game: string;

  /** Seat number, or -1 for CANNOT_PLAY. */
  readonly playerNumber: number;

  /** Action (DevCardAction value). */
  readonly actionType: number;

  /** Single card type (DevCardType value); unused if {@link cardTypes} is set. */
  readonly cardType: number;

  /** Multiple card types (end-of-game VP reveal), or null for single-card form. */
  readonly cardTypes: readonly number[] | null;

  /**
   * @param game          game name
   * @param playerNumber  seat number, or -1 for CANNOT_PLAY
   * @param actionType    DevCardAction value
   * @param cardType      single card type, OR an array for the multi-card form
   */
  constructor(
    game: string,
    playerNumber: number,
    actionType: number,
    cardType: number | readonly number[],
  ) {
    this.game = game;
    this.playerNumber = playerNumber;
    this.actionType = actionType;
    if (Array.isArray(cardType)) {
      // Java's multi-card constructor: a single-element list behaves as single-card.
      if (cardType.length === 1) {
        this.cardType = cardType[0];
        this.cardTypes = null;
      } else {
        this.cardType = 0;
        this.cardTypes = cardType;
      }
    } else {
      this.cardType = cardType as number;
      this.cardTypes = null;
    }
  }

  toCmd(): string {
    let cmd =
      `${MessageType.DEVCARDACTION}${SEP}${this.game}` +
      `${SEP2}${this.playerNumber}${SEP2}${this.actionType}`;
    if (this.cardTypes === null) {
      cmd += `${SEP2}${this.cardType}`;
    } else {
      for (const ct of this.cardTypes) {
        cmd += `${SEP2}${ct}`;
      }
    }
    return cmd;
  }

  /**
   * Parse the data portion (game, pn, ac, ct [, ct ...]).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCDevCardAction | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 4) {
      return null;
    }
    const pn = parseIntStrict(tok[1]);
    const ac = parseIntStrict(tok[2]);
    if (pn === null || ac === null) {
      return null;
    }

    const cardTypes: number[] = [];
    for (let i = 3; i < tok.length; ++i) {
      const ct = parseIntStrict(tok[i]);
      if (ct === null) {
        return null;
      }
      cardTypes.push(ct);
    }
    // Java guards against more than MAX_MULTIPLE card types.
    if (cardTypes.length > DEVCARD_MAX_MULTIPLE) {
      return null;
    }

    if (cardTypes.length === 1) {
      return new SOCDevCardAction(tok[0], pn, ac, cardTypes[0]);
    }
    return new SOCDevCardAction(tok[0], pn, ac, cardTypes);
  }
}

registerParser(MessageType.DEVCARDACTION, SOCDevCardAction.parse);
