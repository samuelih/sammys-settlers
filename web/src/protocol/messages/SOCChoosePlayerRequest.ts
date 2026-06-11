// SOCChoosePlayerRequest — server prompts a player to choose a victim to steal from.
// Ported from src/main/java/soc/message/SOCChoosePlayerRequest.java.
//
// Wire format:  CHOOSEPLAYERREQUEST SEP game SEP2 [ "NONE" SEP2 ] c0 SEP2 c1 ...
// Each c<i> is lowercase "true"/"false": choices[i] true means player i is a
// possible victim. The optional leading "NONE" token (canChooseNone) means the
// player may also choose to steal from no one (some scenarios). The choices
// array length equals game.maxPlayers (4 or 6). On parse, each choice token is
// true only when it exactly equals "true" (Java `tok.equals("true")`, NOT
// case-insensitive — differs from Boolean.valueOf). Parsing needs >= 1 token
// after game; garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/**
 * Prompt to choose a robbery victim. Mirrors Java {@code SOCChoosePlayerRequest}.
 */
export class SOCChoosePlayerRequest implements SOCMessage {
  readonly type = MessageType.CHOOSEPLAYERREQUEST;

  /** Name of the game. */
  readonly game: string;

  /** One flag per player number: true = a possible victim. */
  readonly choices: readonly boolean[];

  /** True if the player may also choose to steal from no one. */
  readonly canChooseNone: boolean;

  /**
   * @param game           game name
   * @param choices        per-player possible-victim flags
   * @param canChooseNone  whether "no one" is allowed (default false)
   */
  constructor(game: string, choices: readonly boolean[], canChooseNone = false) {
    this.game = game;
    this.choices = choices;
    this.canChooseNone = canChooseNone;
  }

  toCmd(): string {
    let cmd = `${MessageType.CHOOSEPLAYERREQUEST}${SEP}${this.game}`;
    if (this.canChooseNone) {
      cmd += `${SEP2}NONE`;
    }
    for (const c of this.choices) {
      cmd += `${SEP2}${c ? 'true' : 'false'}`;
    }
    return cmd;
  }

  /**
   * Parse the data portion (game, [NONE,] choices...).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCChoosePlayerRequest | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 2) {
      return null; // game + at least one choice token
    }
    const game = tok[0];
    let idx = 1;
    let canChooseNone = false;
    if (tok[idx] === 'NONE') {
      canChooseNone = true;
      idx += 1;
      if (idx >= tok.length) {
        return null; // "NONE" with no choices is garbled
      }
    }
    const choices: boolean[] = [];
    for (let i = idx; i < tok.length; ++i) {
      // Java: tok.equals("true") — exact match, not case-insensitive.
      choices.push(tok[i] === 'true');
    }
    return new SOCChoosePlayerRequest(game, choices, canChooseNone);
  }
}

registerParser(MessageType.CHOOSEPLAYERREQUEST, SOCChoosePlayerRequest.parse);
