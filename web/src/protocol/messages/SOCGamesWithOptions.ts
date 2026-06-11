// SOCGamesWithOptions — list of games with their packed game-option strings.
// Ported from src/main/java/soc/message/SOCGamesWithOptions.java, which extends
// SOCMessageTemplateMs (a SOCMessageMulti).
//
// This is a MULTI-message: it uses SEP (not SEP2) between every field.
// Wire format:  GAMESWITHOPTIONS SEP game1 SEP opts1 SEP game2 SEP opts2 ...
// Params come in (gameName, optString) pairs; an options-less / unjoinable game
// has "-" as its optString. Blank/null params are sent as EMPTYSTR ("\t") and
// restored to "" on parse (parseData_FindEmptyStrs). An empty list serializes
// to just "GAMESWITHOPTIONS" (e.g. "1083") with no trailing SEP.

import { MessageType, SEP, EMPTYSTR } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/**
 * One game entry from a {@link SOCGamesWithOptions} message.
 */
export interface GameWithOptions {
  /** Game name; may carry the MARKER_THIS_GAME_UNJOINABLE prefix. */
  readonly name: string;
  /**
   * Packed game-option string as produced by Java
   * {@code SOCGameOption.packOptionsToString(...)}, or "-" if none. Not parsed
   * here into individual options (that's a later phase).
   */
  readonly optsStr: string;
}

/**
 * List of all games plus their option strings. Mirrors Java
 * {@code SOCGamesWithOptions}.
 */
export class SOCGamesWithOptions implements SOCMessage {
  readonly type = MessageType.GAMESWITHOPTIONS;

  /**
   * @param games  game/option pairs (may be empty)
   */
  constructor(readonly games: readonly GameWithOptions[]) {}

  /**
   * The flat parameter list as it appears on the wire (gameName, optsStr, ...).
   * Mirrors Java {@code SOCMessageTemplateMs.getParams()}.
   */
  getParams(): string[] {
    const pa: string[] = [];
    for (const g of this.games) {
      pa.push(g.name);
      pa.push(g.optsStr);
    }
    return pa;
  }

  toCmd(): string {
    // Mirrors SOCMessageTemplateMs.toCmd: type id, then SEP + param for each
    // param, with blank/empty params replaced by EMPTYSTR.
    let cmd = String(MessageType.GAMESWITHOPTIONS);
    for (const p of this.getParams()) {
      cmd += SEP;
      cmd += p.length > 0 ? p : EMPTYSTR;
    }
    return cmd;
  }

  /**
   * Parse the data portion (everything after the first SEP), which for a
   * multi-message still contains SEP separators between the remaining field
   * groups. Mirrors Java: the field groups are split on SEP, EMPTYSTR tokens
   * become "", and there must be an even number of params (game/opts pairs).
   *
   * @param params  data portion; "" for an empty list (no games)
   * @returns the parsed message, or null if param count is odd (garbled)
   */
  static parse(params: string): SOCGamesWithOptions | null {
    // For an empty game list, toCmd() emits just "1083" with no SEP, so decode()
    // passes us "" -> no params.
    const raw = params.length === 0 ? [] : params.split(SEP);
    // EMPTYSTR -> "" (parseData_FindEmptyStrs).
    const flat = raw.map((t) => (t === EMPTYSTR ? '' : t));

    if (flat.length % 2 !== 0) {
      return null; // must have an even number of strings
    }

    const games: GameWithOptions[] = [];
    for (let i = 0; i < flat.length; i += 2) {
      games.push({ name: flat[i], optsStr: flat[i + 1] });
    }
    return new SOCGamesWithOptions(games);
  }
}

registerParser(MessageType.GAMESWITHOPTIONS, SOCGamesWithOptions.parse);
