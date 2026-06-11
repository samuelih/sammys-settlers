// SOCInventoryItemAction — client request, or server response/announcement,
// about scenario-specific SOCInventoryItems in a player's inventory (Cities &
// Knights progress cards itypes 11..19 — see doc/Cities-and-Knights-Implemented.md;
// SC_FTRI gift trade ports, whose itype is the NEGATIVE of the port type).
// Ported from src/main/java/soc/message/SOCInventoryItemAction.java. @since 2.0.00
//
// Wire format:
//   INVENTORYITEMACTION SEP game SEP2 playerNumber SEP2 action SEP2 itemType [SEP2 rcode]
// The trailing rcode is OMITTED when 0. Its meaning depends on the action
// (matching Java, which overloads reasonCode to carry the flags):
//  * action PLAY or CANNOT_PLAY: rcode is a plain reason code (e.g. the
//    SOCGame.canPlayInventoryItem return codes for CANNOT_PLAY).
//  * Any OTHER action (BUY/ADD_*/PLAYED/PLACING_EXTRA/REMOVE_*): rcode is a
//    bit field of FLAG_ISKEPT (0x01) | FLAG_ISVP (0x02) | FLAG_CANCPLAY (0x04),
//    decoded into the isKept/isVP/canCancelPlay booleans.
//
// Parse subtleties (matching Java):
//  * needs >= 4 tokens (game, pn, ac, it); the 5th (rcode) is optional;
//    extra tokens are ignored. Garbled ints -> null.
//  * For flag-carrying actions, the parsed message's reasonCode is REBUILT
//    from the three flag bits, so bits above 0x07 are silently dropped
//    (e.g. wire rcode 11 re-encodes as 3). PLAY/CANNOT_PLAY keep rcode as-is.
//  * playerNumber is -1 for CANNOT_PLAY; sent-from-client values are ignored
//    by the server (the client sends its current player number for PLAY).

import { InventoryItemAction, MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseIntStrict } from './resourceSet';

/** {@code isKept} flag bit in the wire rcode field (Java {@code FLAG_ISKEPT}). */
export const INVITEM_FLAG_ISKEPT = 0x01;

/** {@code isVP} flag bit in the wire rcode field (Java {@code FLAG_ISVP}). */
export const INVITEM_FLAG_ISVP = 0x02;

/** {@code canCancelPlay} flag bit in the wire rcode field (Java {@code FLAG_CANCPLAY}). */
export const INVITEM_FLAG_CANCPLAY = 0x04;

/**
 * An inventory-item add/play/remove. Mirrors Java {@code SOCInventoryItemAction}.
 */
export class SOCInventoryItemAction implements SOCMessage {
  readonly type = MessageType.INVENTORYITEMACTION;

  /** Name of the game. */
  readonly game: string;

  /** Player number (-1 for CANNOT_PLAY from server; ignored by server when sent from client). */
  readonly playerNumber: number;

  /** Action ({@link InventoryItemAction} value), such as ADD_PLAYABLE or PLAY. */
  readonly action: number;

  /** The item type code, from {@code SOCInventoryItem.itype}. May be negative (SC_FTRI ports). */
  readonly itemType: number;

  /**
   * Reason code for CANNOT_PLAY (or 0). For all actions except PLAY and
   * CANNOT_PLAY this carries the {@link isKept}/{@link isVP}/{@link canCancelPlay}
   * flag bits over the network, exactly as in Java.
   */
  readonly reasonCode: number;

  /** True if the item is kept in inventory until end of game. Sent for all actions except PLAY and CANNOT_PLAY. */
  readonly isKept: boolean;

  /** True if the item is worth victory points. Sent for all actions except PLAY and CANNOT_PLAY. */
  readonly isVP: boolean;

  /** True if the item's later play/placement can be canceled. Sent for all actions except PLAY and CANNOT_PLAY. */
  readonly canCancelPlay: boolean;

  /**
   * Create an InventoryItemAction. The last parameter mirrors Java's two
   * non-trivial constructors:
   *  * a number = plain {@link reasonCode} (Java {@code (ga, pn, ac, it, rc)});
   *    the flags will be false. Default 0.
   *  * a flags object (Java {@code (ga, pn, ac, it, kept, vp, canCancel)});
   *    {@link reasonCode} becomes the encoded flag bit field, exactly as Java
   *    sets it.
   *
   * @param game          game name
   * @param playerNumber  player number, or -1 for action CANNOT_PLAY
   * @param action        the action ({@link InventoryItemAction} value)
   * @param itemType      item type code, from {@code SOCInventoryItem.itype}
   * @param rcOrFlags     reason code (default 0), OR the kept/vp/canCancel flags
   */
  constructor(
    game: string,
    playerNumber: number,
    action: number,
    itemType: number,
    rcOrFlags: number | { kept: boolean; vp: boolean; canCancel: boolean } = 0,
  ) {
    this.game = game;
    this.playerNumber = playerNumber;
    this.action = action;
    this.itemType = itemType;
    if (typeof rcOrFlags === 'number') {
      this.reasonCode = rcOrFlags;
      this.isKept = false;
      this.isVP = false;
      this.canCancelPlay = false;
    } else {
      this.reasonCode =
        (rcOrFlags.kept ? INVITEM_FLAG_ISKEPT : 0) |
        (rcOrFlags.vp ? INVITEM_FLAG_ISVP : 0) |
        (rcOrFlags.canCancel ? INVITEM_FLAG_CANCPLAY : 0);
      this.isKept = rcOrFlags.kept;
      this.isVP = rcOrFlags.vp;
      this.canCancelPlay = rcOrFlags.canCancel;
    }
  }

  toCmd(): string {
    let cmd =
      `${MessageType.INVENTORYITEMACTION}${SEP}${this.game}` +
      `${SEP2}${this.playerNumber}${SEP2}${this.action}${SEP2}${this.itemType}`;
    if (this.reasonCode !== 0) {
      cmd += `${SEP2}${this.reasonCode}`;
    }
    return cmd;
  }

  /**
   * Parse the data portion (game, pn, ac, it [, rcode]).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCInventoryItemAction | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 4) {
      return null;
    }
    const pn = parseIntStrict(tok[1]);
    const ac = parseIntStrict(tok[2]);
    const it = parseIntStrict(tok[3]);
    if (pn === null || ac === null || it === null) {
      return null;
    }

    let rc = 0;
    if (tok.length > 4) {
      const parsed = parseIntStrict(tok[4]);
      if (parsed === null) {
        return null;
      }
      rc = parsed;
      if (ac !== InventoryItemAction.PLAY && ac !== InventoryItemAction.CANNOT_PLAY) {
        // Flag-carrying action: decode the bits; reasonCode is rebuilt from
        // them, so any higher bits are dropped (Java parity).
        return new SOCInventoryItemAction(tok[0], pn, ac, it, {
          kept: (rc & INVITEM_FLAG_ISKEPT) !== 0,
          vp: (rc & INVITEM_FLAG_ISVP) !== 0,
          canCancel: (rc & INVITEM_FLAG_CANCPLAY) !== 0,
        });
      }
    }

    return new SOCInventoryItemAction(tok[0], pn, ac, it, rc);
  }
}

registerParser(MessageType.INVENTORYITEMACTION, SOCInventoryItemAction.parse);
