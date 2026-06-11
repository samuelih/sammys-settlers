// SOCGameOptionInfo — server's reply describing one game option.
// Ported from src/main/java/soc/message/SOCGameOptionInfo.java (extends
// SOCMessageTemplateMs, a multi-message).
//
// This is a MULTI-message: SEP separates EVERY field. Blank fields travel as
// EMPTYSTR ("\t") and are restored to "" on parse.
//
// Field layout (verified byte-for-byte against the Java class; see
// captured examples in the protocol agent's report):
//   [0]  key                 option keyname, or "-" for end-of-list marker
//   [1]  optType             OTYPE_* integer (UNKNOWN=0,BOOL=1,INT=2,INTBOOL=3,
//                            ENUM=4,ENUMBOOL=5,STR=6,STRHIDE=7)
//   [2]  minVersion          integer
//   [3]  lastModVersion      integer
//   [4]  defaultBoolValue    't' or 'f'
//   [5]  defaultIntValue     integer
//   [6]  minIntValue         integer
//   [7]  maxIntValue         integer (for STR/STRHIDE this is max string length;
//                            for ENUM/ENUMBOOL this is the number of enum choices)
//   [8]  boolValue (current) 't' or 'f'
//   [9]  intValue (current) OR string value (for STR/STRHIDE); "" stored as null
//   [10] optFlags            integer (>= v2.0.00 clients); 't'/'f' for older
//                            clients meaning FLAG_DROP_IF_UNUSED; "" => 0
//   [11] desc                display text; required except OTYPE_UNKNOWN
//   [12..] enum choice texts (only for ENUM / ENUMBOOL)
//
// Example wire strings:
//   1082|PL|2|-1|1108|f|4|2|6|f|4|0|Maximum # players
//   1082|VP|3|-1|2000|f|10|10|20|f|10|1|Victory points to win: #
//   1082|SC|6|2000|2000|f|0|0|8|f|<TAB>|1|Game Scenario: #     (<TAB> = EMPTYSTR)
//   1082|-|0|2147483647|2147483647|f|0|0|0|f|0|f|-             (end-of-list marker)

import { MessageType, SEP, EMPTYSTR, OTYPE_MIN, OTYPE_MAX, OptionType } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/** Strict integer check matching Java Integer.parseInt. */
function parseIntStrict(s: string): number {
  if (!/^[+-]?\d+$/.test(s)) {
    throw new Error(`not an integer: ${s}`);
  }
  return Number.parseInt(s, 10);
}

/**
 * Info about one game option. Mirrors Java {@code SOCGameOptionInfo}. The raw
 * parsed fields are exposed; build a structured {@code GameOptionDescriptor}
 * from this with {@code descriptorFromInfo()} in gameOptions.ts.
 */
export class SOCGameOptionInfo implements SOCMessage {
  readonly type = MessageType.GAMEOPTIONINFO;

  /** Option keyname (field [0]), or "-" for the end-of-list marker. */
  readonly key: string;

  /** OTYPE_* type code (field [1]); coerced to UNKNOWN if out of range. */
  readonly optType: number;

  /** Minimum client version (field [2]). */
  readonly minVersion: number;

  /** Last-modified version (field [3]). */
  readonly lastModVersion: number;

  /** Default boolean value (field [4]). */
  readonly defaultBoolValue: boolean;

  /** Default integer value (field [5]). */
  readonly defaultIntValue: number;

  /** Minimum integer value (field [6]). */
  readonly minIntValue: number;

  /**
   * Maximum integer value (field [7]). For STR/STRHIDE this is the max string
   * length; for ENUM/ENUMBOOL it is the number of enum choices.
   */
  readonly maxIntValue: number;

  /** Current boolean value (field [8]). */
  readonly curBoolValue: boolean;

  /** Current integer value (field [9]) for non-string types; 0 for strings. */
  readonly curIntValue: number;

  /** Current string value (field [9]) for STR/STRHIDE; null if empty/other types. */
  readonly curStrValue: string | null;

  /** Option flags bitfield (field [10]). */
  readonly optFlags: number;

  /**
   * Exact wire token of field [10], preserved for byte-faithful re-encoding.
   * Older clients (or the server's `OPTINFO_NO_MORE_OPTS` end-of-list marker,
   * which is built with cliVers=0) send 't'/'f' here instead of an integer.
   * Defaults to the integer rendering of {@link optFlags}.
   */
  readonly flagsWireForm: string;

  /** Display description (field [11]); "" for an UNKNOWN with no description. */
  readonly desc: string;

  /** Enum choice display strings (fields [12+]) for ENUM/ENUMBOOL, else empty. */
  readonly enumVals: readonly string[];

  /**
   * Construct from parsed fields. Most callers use {@link parse}.
   */
  constructor(fields: {
    key: string;
    optType: number;
    minVersion: number;
    lastModVersion: number;
    defaultBoolValue: boolean;
    defaultIntValue: number;
    minIntValue: number;
    maxIntValue: number;
    curBoolValue: boolean;
    curIntValue: number;
    curStrValue: string | null;
    optFlags: number;
    flagsWireForm?: string;
    desc: string;
    enumVals: readonly string[];
  }) {
    this.key = fields.key;
    this.optType = fields.optType;
    this.minVersion = fields.minVersion;
    this.lastModVersion = fields.lastModVersion;
    this.defaultBoolValue = fields.defaultBoolValue;
    this.defaultIntValue = fields.defaultIntValue;
    this.minIntValue = fields.minIntValue;
    this.maxIntValue = fields.maxIntValue;
    this.curBoolValue = fields.curBoolValue;
    this.curIntValue = fields.curIntValue;
    this.curStrValue = fields.curStrValue;
    this.optFlags = fields.optFlags;
    this.flagsWireForm = fields.flagsWireForm ?? String(fields.optFlags);
    this.desc = fields.desc;
    this.enumVals = fields.enumVals;
  }

  /** True if this is the end-of-list marker (key "-", type UNKNOWN). */
  isNoMoreOpts(): boolean {
    return this.key === '-' && this.optType === OptionType.OTYPE_UNKNOWN;
  }

  toCmd(): string {
    const isStr =
      this.optType === OptionType.OTYPE_STR ||
      this.optType === OptionType.OTYPE_STRHIDE;
    const field9 = isStr ? this.curStrValue ?? '' : String(this.curIntValue);

    const parts: string[] = [
      this.key,
      String(this.optType),
      String(this.minVersion),
      String(this.lastModVersion),
      this.defaultBoolValue ? 't' : 'f',
      String(this.defaultIntValue),
      String(this.minIntValue),
      String(this.maxIntValue),
      this.curBoolValue ? 't' : 'f',
      field9,
      this.flagsWireForm,
      this.desc,
    ];
    const isEnum =
      this.optType === OptionType.OTYPE_ENUM ||
      this.optType === OptionType.OTYPE_ENUMBOOL;
    if (isEnum) {
      for (const ev of this.enumVals) {
        parts.push(ev);
      }
    }

    // Multi-message: SEP before every field; blank fields -> EMPTYSTR.
    let cmd = String(MessageType.GAMEOPTIONINFO);
    for (const p of parts) {
      cmd += SEP;
      cmd += p.length > 0 ? p : EMPTYSTR;
    }
    return cmd;
  }

  /**
   * Parse the multi-message data portion (SEP-separated fields). Mirrors Java's
   * SOCGameOptionInfo(List) constructor: EMPTYSTR -> "", >= 11 fields required,
   * type coerced to UNKNOWN if out of range.
   *
   * @param params  data portion (everything after the first SEP)
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCGameOptionInfo | null {
    // For a multi-message the data still contains SEP separators.
    const raw = params.length === 0 ? [] : params.split(SEP);
    const f = raw.map((t) => (t === EMPTYSTR ? '' : t));
    if (f.length < 11) {
      return null;
    }

    try {
      let otyp = parseIntStrict(f[1]);
      if (otyp < OTYPE_MIN || otyp > OTYPE_MAX) {
        otyp = OptionType.OTYPE_UNKNOWN;
      }

      const minVersion = parseIntStrict(f[2]);
      const lastModVersion = parseIntStrict(f[3]);
      const defaultBoolValue = f[4] === 't';
      const defaultIntValue = parseIntStrict(f[5]);
      const minIntValue = parseIntStrict(f[6]);
      const maxIntValue = parseIntStrict(f[7]);
      const curBoolValue = f[8] === 't';

      const isStr =
        otyp === OptionType.OTYPE_STR || otyp === OptionType.OTYPE_STRHIDE;
      let curIntValue = 0;
      let curStrValue: string | null = null;
      if (isStr) {
        curStrValue = f[9].length === 0 ? null : f[9];
      } else {
        curIntValue = parseIntStrict(f[9]);
      }

      // field [10]: int flags, or 't'/'f' (old clients) / "" meaning 0.
      // Preserve the raw token so re-encoding is byte-faithful (e.g. the
      // server's end-of-list marker sends 'f' here, built with cliVers=0).
      const flagsWireForm = f[10];
      let optFlags: number;
      if (f[10] === 't') {
        optFlags = 0x01; // FLAG_DROP_IF_UNUSED
      } else if (f[10] === 'f' || f[10].length === 0) {
        optFlags = 0;
      } else {
        optFlags = parseIntStrict(f[10]);
      }

      const isEnum =
        otyp === OptionType.OTYPE_ENUM || otyp === OptionType.OTYPE_ENUMBOOL;
      if (!isEnum && f.length !== 11 && f.length !== 12) {
        return null; // Java: throws IllegalArgumentException("params.length")
      }

      const desc = f.length > 11 ? f[11] : '';

      let enumVals: string[] = [];
      if (isEnum) {
        // Java: choices = new String[ival_max]; arraycopy(params, 12, ...).
        // Requires at least 12 + maxIntValue fields.
        if (f.length < 12 + maxIntValue) {
          return null;
        }
        enumVals = f.slice(12, 12 + maxIntValue);
      }

      return new SOCGameOptionInfo({
        key: f[0],
        optType: otyp,
        minVersion,
        lastModVersion,
        defaultBoolValue,
        defaultIntValue,
        minIntValue,
        maxIntValue,
        curBoolValue,
        curIntValue,
        curStrValue,
        optFlags,
        flagsWireForm,
        desc,
        enumVals,
      });
    } catch {
      return null;
    }
  }
}

registerParser(MessageType.GAMEOPTIONINFO, SOCGameOptionInfo.parse);
