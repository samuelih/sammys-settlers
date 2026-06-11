// SOCGameState — the server tells clients a game's current state.
// Ported from src/main/java/soc/message/SOCGameState.java.
//
// Wire format:  GAMESTATE SEP game SEP2 state
// Both fields are always present. `state` is one of the SOCGame state values
// (see the GameState constants); 0 = NEW. Parsing uses StringTokenizer on SEP2
// reading exactly two tokens (game, state); a non-integer state or a missing
// token is garbled -> null.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/** Strict integer check matching Java Integer.parseInt. */
function parseIntStrict(s: string): number | null {
  if (!/^[+-]?\d+$/.test(s)) {
    return null;
  }
  return Number.parseInt(s, 10);
}

/**
 * Current game-state announcement. Mirrors Java {@code SOCGameState}.
 */
export class SOCGameState implements SOCMessage {
  readonly type = MessageType.GAMESTATE;

  /** Name of the game. */
  readonly game: string;

  /** The game's current state (a SOCGame state value; 0 = NEW). */
  readonly state: number;

  /**
   * @param game   game name
   * @param state  game state value
   */
  constructor(game: string, state: number) {
    this.game = game;
    this.state = state;
  }

  toCmd(): string {
    return `${MessageType.GAMESTATE}${SEP}${this.game}${SEP2}${this.state}`;
  }

  /**
   * Parse the data portion. Mirrors Java: game = first SEP2 token, state =
   * second token parsed as an int.
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCGameState | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 2) {
      return null;
    }
    const state = parseIntStrict(tok[1]);
    if (state === null) {
      return null;
    }
    return new SOCGameState(tok[0], state);
  }
}

registerParser(MessageType.GAMESTATE, SOCGameState.parse);
