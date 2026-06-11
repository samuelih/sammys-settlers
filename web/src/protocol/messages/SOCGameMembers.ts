// SOCGameMembers — list of all members (players + observers) in a game.
// Ported from src/main/java/soc/message/SOCGameMembers.java.
//
// Wire format:  GAMEMEMBERS SEP game SEP2 member1 SEP2 member2 ...
// The first SEP2 token is the game name; the rest are member nicknames. Parsing
// uses StringTokenizer on SEP2 (skips empty tokens), so an empty member list is
// just "GAMEMEMBERS SEP game". This message tells the client the server has
// finished sending a game's join details and is ready for input.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/**
 * List of a game's members. Mirrors Java {@code SOCGameMembers}.
 */
export class SOCGameMembers implements SOCMessage {
  readonly type = MessageType.GAMEMEMBERS;

  /** Name of the game. */
  readonly game: string;

  /** Member nicknames (players and observers); may be empty. */
  readonly members: readonly string[];

  /**
   * @param game     game name
   * @param members  member nicknames (may be empty)
   */
  constructor(game: string, members: readonly string[]) {
    this.game = game;
    this.members = members;
  }

  toCmd(): string {
    let cmd = `${MessageType.GAMEMEMBERS}${SEP}${this.game}`;
    for (const m of this.members) {
      cmd += `${SEP2}${m}`;
    }
    return cmd;
  }

  /**
   * Parse the data portion. Mirrors Java: first SEP2 token is the game name,
   * remaining tokens are members. StringTokenizer skips empty tokens.
   *
   * @returns the parsed message, or null if no game-name token (garbled)
   */
  static parse(params: string): SOCGameMembers | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 1) {
      return null;
    }
    const game = tok[0];
    const members = tok.slice(1);
    return new SOCGameMembers(game, members);
  }
}

registerParser(MessageType.GAMEMEMBERS, SOCGameMembers.parse);
