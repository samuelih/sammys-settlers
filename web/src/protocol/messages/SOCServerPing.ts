// SOCServerPing — server keep-alive / disconnect notice; client echoes it back.
// Ported from src/main/java/soc/message/SOCServerPing.java.
//
// Wire format:  SERVERPING SEP sleepTime

import { MessageType, SEP } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';
import { parseJavaInt } from '../javaInt';

/** Strict integer check matching Java Integer.parseInt. */
function parseIntStrict(s: string): number | null {
  return parseJavaInt(s);
}

/**
 * Ping message carrying a sleep time (seconds for humans, -1 = being
 * disconnected). Mirrors Java {@code SOCServerPing}.
 */
export class SOCServerPing implements SOCMessage {
  readonly type = MessageType.SERVERPING;

  /**
   * @param sleepTime  the sleep time, or -1; see Java {@code getSleepTime()}
   */
  constructor(readonly sleepTime: number) {}

  toCmd(): string {
    return `${MessageType.SERVERPING}${SEP}${this.sleepTime}`;
  }

  /**
   * Parse the data portion (the integer sleep time). Returns null if not an
   * integer (Java would throw NumberFormatException, caught by toMsg -> null).
   */
  static parse(params: string): SOCServerPing | null {
    const st = parseIntStrict(params);
    if (st === null) {
      return null;
    }
    return new SOCServerPing(st);
  }
}

registerParser(MessageType.SERVERPING, SOCServerPing.parse);
