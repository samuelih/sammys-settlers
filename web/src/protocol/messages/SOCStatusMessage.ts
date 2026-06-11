// SOCStatusMessage — status text shown in the client's main window, with an
// optional status value. Ported from src/main/java/soc/message/SOCStatusMessage.java.
//
// Wire format:  STATUSMESSAGE SEP [svalue SEP2] status
// The status value is omitted when <= 0 (back-compat with pre-1.1.06 clients).
// When present, the status text itself MAY contain SEP2 chars; only the first
// SEP2 is significant for splitting off the value.

import { MessageType, SEP, SEP2, StatusValue } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/**
 * Status message: text plus an optional {@link StatusValue} code.
 * Mirrors Java {@code SOCStatusMessage}.
 */
export class SOCStatusMessage implements SOCMessage {
  readonly type = MessageType.STATUSMESSAGE;

  /** The status text to show the user. May contain SEP2 chars when svalue > 0. */
  readonly status: string;

  /** The status value (e.g. {@link StatusValue.SV_OK}); 0 if none. */
  readonly svalue: number;

  /**
   * @param svalue  status value; if <= 0 it is not output on the wire
   * @param status  status text
   */
  constructor(svalue: number, status: string) {
    this.svalue = svalue;
    this.status = status;
  }

  /** Create with status value {@link StatusValue.SV_OK} (0). */
  static ok(status: string): SOCStatusMessage {
    return new SOCStatusMessage(StatusValue.SV_OK, status);
  }

  toCmd(): string {
    let cmd = `${MessageType.STATUSMESSAGE}${SEP}`;
    if (this.svalue > 0) {
      cmd += `${this.svalue}${SEP2}`;
    }
    cmd += this.status;
    return cmd;
  }

  /**
   * Parse the data portion. Mirrors Java's parseDataStr:
   *  - Find the first SEP2. If present and at index > 0, try to parse the
   *    preceding substring as the status value; negative clamps to 0; if it's
   *    not numeric, keep the whole string as status (svalue stays 0).
   *  - If the data STARTS with SEP2 (index 0), it's garbled -> null.
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCStatusMessage | null {
    let sv = 0;
    let s = params;
    let i = s.indexOf(SEP2);
    if (i !== -1) {
      if (i > 0) {
        const head = s.substring(0, i);
        const parsed = Number.parseInt(head, 10);
        if (Number.isInteger(parsed) && String(parsed) === head) {
          sv = parsed < 0 ? 0 : parsed;
        } else {
          // Non-numeric prefix: keep whole string as status (Java sets i = -1).
          i = -1;
        }
      } else {
        return null; // Garbled: started with SEP2
      }
      if (i !== -1) {
        s = s.substring(i + 1);
      }
    }

    return new SOCStatusMessage(sv, s);
  }
}

registerParser(MessageType.STATUSMESSAGE, SOCStatusMessage.parse);
