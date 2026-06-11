// SOCGameOptionGetInfos — client asks the server for info about game options.
// Ported from src/main/java/soc/message/SOCGameOptionGetInfos.java.
//
// Wire format:  GAMEOPTIONGETINFOS SEP key1 SEP2 key2 SEP2 ...
// Special tokens (not stored in optionKeys after parse):
//   * "-"        : ask for all new/changed options (client older than server).
//   * "?I18N"    : also send localized option descriptions (sets i18n flag).
//   * "?CHANGES" : also send any new/changed options when asking specific keys.
//
// Encoding rules (verified byte-for-byte against Java):
//   * Empty key list with no flags -> "1081|-".
//   * Key list joined by SEP2; if also asking i18n, "?I18N" appended after.
//   * hasOnlyTokenI18n: send just "?I18N" (no "-"): "1081|?I18N".
//   * "?CHANGES" is sent IN the keys list by the client but on parse is pulled
//     out into hasTokenGetAnyChanges and removed from optionKeys (so the decode
//     of "1081|PL,?CHANGES" re-encodes to "1081|PL", NOT byte-identical).

import { MessageType, SEP, SEP2 } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/** I18N option-description request token. */
export const OPTKEY_GET_I18N_DESCS = '?I18N';

/** Request token for any new/changed options alongside specific keys. */
export const OPTKEY_GET_ANY_CHANGES = '?CHANGES';

/**
 * Client request for game-option info. Mirrors Java
 * {@code SOCGameOptionGetInfos}.
 */
export class SOCGameOptionGetInfos implements SOCMessage {
  readonly type = MessageType.GAMEOPTIONGETINFOS;

  /**
   * Specific option keynames to ask about, or null for "-" (any new/changed).
   * Does NOT include "?I18N" (see {@link hasTokenGetI18nDescs}). May include
   * "?CHANGES" when built from the constructor, but after parse that token is
   * removed and {@link hasTokenGetAnyChanges} is set instead.
   */
  readonly optionKeys: readonly string[] | null;

  /** True if also asking for localized option descriptions ("?I18N"). */
  readonly hasTokenGetI18nDescs: boolean;

  /** True if asking ONLY for "?I18N" (same-version client); optionKeys is null. */
  readonly hasOnlyTokenI18n: boolean;

  /** True if "?CHANGES" was requested (parsed out of the keys list). */
  readonly hasTokenGetAnyChanges: boolean;

  /**
   * @param optionKeys            option keynames, or null for "-"; may include
   *                              "?CHANGES" but not "?I18N"
   * @param hasTokenGetI18nDescs  also request localized descriptions
   * @param hasOnlyTokenI18n      request only "?I18N" (optionKeys must be null)
   * @param hasTokenGetAnyChanges set when "?CHANGES" was parsed out of the list
   * @throws Error if hasOnlyTokenI18n but optionKeys != null (Java parity)
   */
  constructor(
    optionKeys: readonly string[] | null,
    hasTokenGetI18nDescs: boolean,
    hasOnlyTokenI18n: boolean,
    hasTokenGetAnyChanges = false,
  ) {
    if (hasOnlyTokenI18n && optionKeys !== null) {
      throw new Error(String(optionKeys));
    }
    this.optionKeys = optionKeys;
    this.hasTokenGetI18nDescs = hasTokenGetI18nDescs;
    this.hasOnlyTokenI18n = hasOnlyTokenI18n;
    this.hasTokenGetAnyChanges = hasTokenGetAnyChanges;
  }

  toCmd(): string {
    let cmd = `${MessageType.GAMEOPTIONGETINFOS}${SEP}`;

    if (this.optionKeys === null || this.optionKeys.length === 0) {
      if (!this.hasOnlyTokenI18n) {
        cmd += '-';
      }
    } else {
      cmd += this.optionKeys.join(SEP2);
    }

    if (this.hasTokenGetI18nDescs) {
      if (!this.hasOnlyTokenI18n) {
        cmd += SEP2;
      }
      cmd += OPTKEY_GET_I18N_DESCS;
    }

    return cmd;
  }

  /**
   * Parse the data portion. Mirrors Java's parseDataStr: split on SEP2, pull out
   * the "-", "?I18N", "?CHANGES" tokens into flags, keep the rest as keys.
   *
   * @returns the parsed message, or null if garbled ("-" mixed with keys)
   */
  static parse(params: string): SOCGameOptionGetInfos | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    let okey: string[] | null = [];
    let hasDash = false;
    let hasI18n = false;
    let hasAnyChanges = false;

    for (const ntok of tok) {
      if (ntok === '-') {
        hasDash = true;
        continue;
      }
      if (ntok === OPTKEY_GET_I18N_DESCS) {
        hasI18n = true;
        continue;
      }
      if (ntok === OPTKEY_GET_ANY_CHANGES) {
        hasAnyChanges = true;
        continue;
      }
      okey.push(ntok);
    }

    if (okey.length === 0) {
      okey = null;
    }
    if (hasDash && okey !== null) {
      return null; // parse error: "-" present alongside specific keys
    }

    const onlyI18n = hasI18n && okey === null && !hasDash;
    return new SOCGameOptionGetInfos(okey, hasI18n, onlyI18n, hasAnyChanges);
  }
}

registerParser(MessageType.GAMEOPTIONGETINFOS, SOCGameOptionGetInfos.parse);
