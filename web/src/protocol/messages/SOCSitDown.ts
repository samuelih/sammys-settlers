// SOCSitDown — request to sit at a seat (client) / announce a seated player (server).
// Ported from src/main/java/soc/message/SOCSitDown.java.
//
// Wire format:  SITDOWN SEP game SEP2 nickname SEP2 playerNumber SEP2 robotFlag
// The robotFlag is rendered with Java Boolean.toString(): "true"/"false"
// (lowercase). Parsing uses Boolean.valueOf(token), which is true ONLY for the
// case-insensitive string "true"; any other token (incl "false", "x", "") is
// false. We replicate that exactly.
//
// nickname is ignored from client (can be "-" or EMPTYSTR but not blank);
// robotFlag is ignored from client by servers v2.5.00+.

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
 * Sit-down request/announcement. Mirrors Java {@code SOCSitDown}.
 */
export class SOCSitDown implements SOCMessage {
  readonly type = MessageType.SITDOWN;

  /** Name of the game. */
  readonly game: string;

  /** Nickname of the player (ignored from client; "-" or EMPTYSTR allowed). */
  readonly nickname: string;

  /** Seat number. */
  readonly playerNumber: number;

  /** True if this seat holds a robot (ignored from client by v2.5.00+ servers). */
  readonly robotFlag: boolean;

  /**
   * @param game          game name
   * @param nickname      player nickname (or "-"/EMPTYSTR from client)
   * @param playerNumber  seat number
   * @param robotFlag     robot flag
   */
  constructor(
    game: string,
    nickname: string,
    playerNumber: number,
    robotFlag: boolean,
  ) {
    this.game = game;
    this.nickname = nickname;
    this.playerNumber = playerNumber;
    this.robotFlag = robotFlag;
  }

  toCmd(): string {
    // Java appends the boolean via String concat -> "true"/"false" (lowercase).
    return (
      `${MessageType.SITDOWN}${SEP}${this.game}${SEP2}${this.nickname}` +
      `${SEP2}${this.playerNumber}${SEP2}${this.robotFlag ? 'true' : 'false'}`
    );
  }

  /**
   * Parse the data portion. Mirrors Java: 4 SEP2 tokens; playerNumber is an
   * int; robotFlag = Boolean.valueOf(token) (true only for "true", any case).
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCSitDown | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 4) {
      return null;
    }
    const [ga, nk, pnStr, rfStr] = tok;
    const pn = parseIntStrict(pnStr);
    if (pn === null) {
      return null;
    }
    // Boolean.valueOf: true iff token equalsIgnoreCase "true".
    const rf = rfStr.toLowerCase() === 'true';
    return new SOCSitDown(ga, nk, pn, rf);
  }
}

registerParser(MessageType.SITDOWN, SOCSitDown.parse);
