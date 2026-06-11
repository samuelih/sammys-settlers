// SOCGameOptionGetDefaults — current new-game option defaults.
// Ported from src/main/java/soc/message/SOCGameOptionGetDefaults.java.
//
// Wire format:  GAMEOPTIONGETDEFAULTS [SEP opts]
//   * Client -> server: sent with no opts (just the type id "1080") to ask for
//     the server's current defaults.
//   * Server -> client: opts is the packed option string of all known options
//     (empty string-valued options omitted).
// On parse, an empty data portion becomes null (no opts).

import { MessageType, SEP } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/**
 * New-game option defaults request/reply. Mirrors Java
 * {@code SOCGameOptionGetDefaults}.
 */
export class SOCGameOptionGetDefaults implements SOCMessage {
  readonly type = MessageType.GAMEOPTIONGETDEFAULTS;

  /** Packed option name-value string, or null (client->server request). */
  readonly opts: string | null;

  /**
   * @param opts  packed options string, or null for none (client request)
   */
  constructor(opts: string | null) {
    this.opts = opts;
  }

  toCmd(): string {
    if (this.opts !== null) {
      return `${MessageType.GAMEOPTIONGETDEFAULTS}${SEP}${this.opts}`;
    }
    return String(MessageType.GAMEOPTIONGETDEFAULTS);
  }

  /**
   * Parse the data portion. Mirrors Java: empty string -> null opts.
   *
   * @returns the parsed message (never null)
   */
  static parse(params: string): SOCGameOptionGetDefaults {
    return new SOCGameOptionGetDefaults(params.length === 0 ? null : params);
  }
}

registerParser(
  MessageType.GAMEOPTIONGETDEFAULTS,
  SOCGameOptionGetDefaults.parse,
);
