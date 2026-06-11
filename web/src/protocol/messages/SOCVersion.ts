// SOCVersion — cli/serv version handshake.
// Ported from src/main/java/soc/message/SOCVersion.java.
//
// Wire format:
//   VERSION SEP vernum SEP2 verstr [SEP2 build [SEP2 feats [SEP2 cliLocale]]]
// build and feats are sent as EMPTYSTR ("\t") when null; cliLocale is omitted
// entirely (no trailing SEP2) when null. Empty/EMPTYSTR fields parse back to null.

import { MessageType, SEP, SEP2, EMPTYSTR } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/**
 * Version+features message. First message sent client->server, and server's
 * first outbound message. Mirrors Java {@code SOCVersion}.
 */
export class SOCVersion implements SOCMessage {
  readonly type = MessageType.VERSION;

  /**
   * @param versNum    version number, e.g. 2700 for 2.7.00
   * @param versStr    version display string, e.g. "2.7.00"
   * @param versBuild  build string, or null
   * @param feats      active optional features (encoded), or null
   * @param cliLocale  client JVM locale (e.g. "en_US"), or null
   * @throws Error if versBuild is null and feats is non-null (matches Java).
   */
  constructor(
    readonly versNum: number,
    readonly versStr: string,
    readonly versBuild: string | null,
    readonly feats: string | null,
    readonly cliLocale: string | null,
  ) {
    if (versBuild === null && feats !== null) {
      throw new Error('null versBuild, non-null feats');
    }
  }

  toCmd(): string {
    return (
      `${MessageType.VERSION}${SEP}${this.versNum}${SEP2}${this.versStr}` +
      `${SEP2}${this.versBuild !== null ? this.versBuild : EMPTYSTR}` +
      `${SEP2}${this.feats !== null ? this.feats : EMPTYSTR}` +
      `${this.cliLocale !== null ? `${SEP2}${this.cliLocale}` : ''}`
    );
  }

  /**
   * Parse the data portion (after the first SEP) into a SOCVersion.
   * Mirrors Java's StringTokenizer(s, SEP2) tokenization, which SKIPS empty
   * tokens; the EMPTYSTR ("\t") token is non-empty so it survives and is then
   * converted to null. Returns null if vernum/verstr are missing or malformed.
   */
  static parse(params: string): SOCVersion | null {
    // StringTokenizer on SEP2 skips empty tokens (the practical effect here).
    const tokens = params.split(SEP2).filter((t) => t.length > 0);
    if (tokens.length < 2) {
      return null;
    }

    const versNum = Number.parseInt(tokens[0], 10);
    if (!Number.isInteger(versNum)) {
      return null;
    }
    const versStr = tokens[1];

    let build: string | null = null;
    let feats: string | null = null;
    let locale: string | null = null;

    if (tokens.length >= 3) {
      build = tokens[2];
      if (build.length === 0 || build === EMPTYSTR) {
        build = null;
      }
      if (tokens.length >= 4) {
        feats = tokens[3];
        if (feats.length === 0 || feats === EMPTYSTR) {
          feats = null;
        }
        if (tokens.length >= 5) {
          locale = tokens[4];
          if (locale.length === 0 || locale === EMPTYSTR) {
            locale = null;
          }
        }
      }
    }

    return new SOCVersion(versNum, versStr, build, feats, locale);
  }
}

registerParser(MessageType.VERSION, SOCVersion.parse);
