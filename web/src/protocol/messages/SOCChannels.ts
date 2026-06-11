// SOCChannels — list of all chat-channel names; a "connection complete" signal.
// Ported from src/main/java/soc/message/SOCChannels.java.
//
// Wire format:  CHANNELS SEP chan1 SEP2 chan2 SEP2 ...
// An empty list serializes to just "CHANNELS SEP" (e.g. "1003|"). Parsing uses
// StringTokenizer on SEP2, which skips empty tokens.

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/**
 * List of chat-channel names. Mirrors Java {@code SOCChannels}.
 */
export class SOCChannels implements SOCMessage {
  readonly type = MessageType.CHANNELS;

  /**
   * @param channels  channel names (may be empty)
   */
  constructor(readonly channels: readonly string[]) {}

  toCmd(): string {
    return `${MessageType.CHANNELS}${SEP}${this.channels.join(SEP2)}`;
  }

  /**
   * Parse the data portion. Mirrors Java's StringTokenizer(s, SEP2): empty
   * tokens are skipped, so "" yields an empty list.
   */
  static parse(params: string): SOCChannels {
    const channels = params.split(SEP2).filter((t) => t.length > 0);
    return new SOCChannels(channels);
  }
}

registerParser(MessageType.CHANNELS, SOCChannels.parse);
