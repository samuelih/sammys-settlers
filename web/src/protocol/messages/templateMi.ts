// Shared helpers for SOCMessageTemplateMi-style messages.
// Ported from src/main/java/soc/message/SOCMessageTemplateMi.java.
//
// Wire format:  TYPE SEP game SEP p0 SEP p1 SEP p2 ...
// Unlike single messages (which use SEP2 between fields after the type), these
// multi-messages use SEP ('|') between EVERY field, with the game name first and
// the rest being integers. The data portion passed to a parser (everything after
// the first SEP) is therefore "game SEP p0 SEP p1 ...".
//
// Java builds the parse list (`multiData`) by splitting the whole command on SEP
// via StringTokenizer; element 0 is the game name, the rest are int params. Note
// that in Java a multi-message with ONLY a game name and no params is delivered
// as `data` (a single token), not `multiData`; these message types all require
// at least one param, so an empty param list is garbled regardless.

import { SEP } from '../constants';
import { parseJavaInt } from '../javaInt';

/** Strict integer check matching Java Integer.parseInt (allows leading sign). */
export function parseIntStrict(s: string): number | null {
  return parseJavaInt(s);
}

/**
 * Build the wire command for a Mi-style message: type, game, then each int param
 * separated by SEP. Mirrors {@code SOCMessageTemplateMi.toCmd}.
 *
 * @param type   message type id
 * @param game   game name
 * @param params integer parameters
 * @returns the command string
 */
export function templateMiToCmd(type: number, game: string, params: readonly number[]): string {
  let cmd = `${type}${SEP}${game}`;
  for (const p of params) {
    cmd += `${SEP}${p}`;
  }
  return cmd;
}

/**
 * Result of splitting a Mi-style data portion: the game name and the parsed int
 * params, or null if any param token isn't a clean integer.
 */
export interface MiParts {
  game: string;
  params: number[];
}

/**
 * Split a Mi-style data portion ("game SEP p0 SEP p1 ...") into the game name
 * and integer params. Java's StringTokenizer skips empty tokens; we mirror that.
 *
 * @param data  the data portion (everything after the first SEP)
 * @returns the parts, or null if a param token is non-integer
 */
export function parseTemplateMi(data: string): MiParts | null {
  const tok = data.split(SEP).filter((t) => t.length > 0);
  if (tok.length < 1) {
    return null;
  }
  const game = tok[0];
  const params: number[] = [];
  for (let i = 1; i < tok.length; ++i) {
    const n = parseIntStrict(tok[i]);
    if (n === null) {
      return null;
    }
    params.push(n);
  }
  return { game, params };
}
