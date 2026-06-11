// SOCChoosePlayer — client's choice of whom to rob, or robber-vs-pirate / cloth-vs-resource.
// Ported from src/main/java/soc/message/SOCChoosePlayer.java.
//
// Wire format:  CHOOSEPLAYER SEP game SEP2 choice
// `choice` >= 0 is the chosen victim player number; the special negatives are
// ChoosePlayerChoice: CHOICE_NO_PLAYER=-1, CHOICE_MOVE_ROBBER=-2,
// CHOICE_MOVE_PIRATE=-3. In WAITING_FOR_ROB_CLOTH_OR_RESOURCE, choice=pn robs a
// resource and choice=-(pn+1) robs cloth. Parsing reads two SEP2 tokens;
// garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseIntStrict } from './resourceSet';

/**
 * Choice of victim / robber-or-pirate. Mirrors Java {@code SOCChoosePlayer}.
 */
export class SOCChoosePlayer implements SOCMessage {
  readonly type = MessageType.CHOOSEPLAYER;

  /** Name of the game. */
  readonly game: string;

  /** Chosen player number, or a ChoosePlayerChoice special negative. */
  readonly choice: number;

  /**
   * @param game    game name
   * @param choice  chosen player number, or special negative
   */
  constructor(game: string, choice: number) {
    this.game = game;
    this.choice = choice;
  }

  toCmd(): string {
    return `${MessageType.CHOOSEPLAYER}${SEP}${this.game}${SEP2}${this.choice}`;
  }

  /**
   * Parse the data portion (game, choice).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCChoosePlayer | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 2) {
      return null;
    }
    const ch = parseIntStrict(tok[1]);
    if (ch === null) {
      return null;
    }
    return new SOCChoosePlayer(tok[0], ch);
  }
}

registerParser(MessageType.CHOOSEPLAYER, SOCChoosePlayer.parse);
