// SOCServerPing — server keep-alive / disconnect notice; client echoes it back.
// Ported from src/main/java/soc/message/SOCServerPing.java.
//
// Wire format:  SERVERPING SEP sleepTime

import { MessageType, SEP } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

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
    const st = Number.parseInt(params, 10);
    if (!Number.isInteger(st)) {
      return null;
    }
    return new SOCServerPing(st);
  }
}

registerParser(MessageType.SERVERPING, SOCServerPing.parse);
