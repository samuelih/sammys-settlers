// SOCSetPlayedDevCard — set the "played a dev card this turn" flag for a player.
// Ported from src/main/java/soc/message/SOCSetPlayedDevCard.java.
//
// Wire format:  SETPLAYEDDEVCARD SEP game SEP2 playerNumber SEP2 playedDevCard
// playedDevCard is Java Boolean.toString() => lowercase "true"/"false". On parse
// Java uses Boolean.valueOf(): true only for the case-insensitive string "true".
// Sent to clients older than v2.0.00; newer clients get
// SOCPlayerElement(PLAYED_DEV_CARD_FLAG) instead. Parsing reads three SEP2
// tokens; garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseIntStrict } from './resourceSet';

/**
 * Set the played-dev-card flag. Mirrors Java {@code SOCSetPlayedDevCard}.
 */
export class SOCSetPlayedDevCard implements SOCMessage {
  readonly type = MessageType.SETPLAYEDDEVCARD;

  /** Name of the game. */
  readonly game: string;

  /** Seat number. */
  readonly playerNumber: number;

  /** Whether the player has played a dev card this turn. */
  readonly playedDevCard: boolean;

  /**
   * @param game           game name
   * @param playerNumber   seat number
   * @param playedDevCard  the flag value
   */
  constructor(game: string, playerNumber: number, playedDevCard: boolean) {
    this.game = game;
    this.playerNumber = playerNumber;
    this.playedDevCard = playedDevCard;
  }

  toCmd(): string {
    return (
      `${MessageType.SETPLAYEDDEVCARD}${SEP}${this.game}` +
      `${SEP2}${this.playerNumber}${SEP2}${this.playedDevCard ? 'true' : 'false'}`
    );
  }

  /**
   * Parse the data portion (game, playerNumber, playedDevCard).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCSetPlayedDevCard | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 3) {
      return null;
    }
    const pn = parseIntStrict(tok[1]);
    if (pn === null) {
      return null;
    }
    // Java Boolean.valueOf: true only for case-insensitive "true".
    const pd = tok[2].toLowerCase() === 'true';
    return new SOCSetPlayedDevCard(tok[0], pn, pd);
  }
}

registerParser(MessageType.SETPLAYEDDEVCARD, SOCSetPlayedDevCard.parse);
