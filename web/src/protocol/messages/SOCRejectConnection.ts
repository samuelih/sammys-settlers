// SOCRejectConnection — server refuses this connection, with a text reason.
// Ported from src/main/java/soc/message/SOCRejectConnection.java.
//
// Wire format:  REJECTCONNECTION SEP text
// The data portion is used verbatim as the text (no SEP2 parsing).

import { MessageType, SEP } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/**
 * "You aren't allowed to connect" reply from the server.
 * Mirrors Java {@code SOCRejectConnection}.
 */
export class SOCRejectConnection implements SOCMessage {
  readonly type = MessageType.REJECTCONNECTION;

  /**
   * @param text  the human-readable rejection text
   */
  constructor(readonly text: string) {}

  toCmd(): string {
    return `${MessageType.REJECTCONNECTION}${SEP}${this.text}`;
  }

  /**
   * Parse the data portion. Java uses the string directly as the text, so this
   * never fails.
   */
  static parse(params: string): SOCRejectConnection {
    return new SOCRejectConnection(params);
  }
}

registerParser(MessageType.REJECTCONNECTION, SOCRejectConnection.parse);
