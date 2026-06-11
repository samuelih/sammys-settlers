// SOCScenarioInfo — scenario info request (client) / reply (server).
// Ported from src/main/java/soc/message/SOCScenarioInfo.java (extends
// SOCMessageTemplateMs, a multi-message).
//
// MULTI-message: SEP separates every field; EMPTYSTR ("\t") <-> "".
//
// Wire forms (verified byte-for-byte against the Java class):
//   Server, full scenario:  SCENARIOINFO SEP key SEP minVers SEP lastModVers SEP opts SEP title [SEP longDesc]
//     e.g. 1101|SC_NSHO|2000|2000|_SC_SEAC=t,SBL=t,VP=t13|New Shores
//   Server, key unknown:    SCENARIOINFO SEP key SEP 0 SEP -2          (lastModVers == MARKER_KEY_UNKNOWN)
//     e.g. 1101|SC_FAKE|0|-2
//   Server, end-of-list:    SCENARIOINFO SEP -                         (single "-" marker)
//     e.g. 1101|-
//   Client, single key:     SCENARIOINFO SEP [ SEP key                 ("[" = MARKER_SCEN_NAME_LIST)
//     e.g. 1101|[|SC_NSHO
//   Client, key list+any:   SCENARIOINFO SEP [ SEP key1 SEP key2 SEP ? ("?" = MARKER_ANY_CHANGED)
//     e.g. 1101|[|SC_NSHO|SC_4ISL|?
//   Client, any-changed:    SCENARIOINFO SEP ?
//     e.g. 1101|?
//
// isFromServer is determined by pa[0]: "[" or "?" => from client, else server.

import { MessageType, SEP, EMPTYSTR } from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/** Marker: client asks for any new/changed scenarios (last item in list). */
export const MARKER_ANY_CHANGED = '?';

/** Marker: first field of a client's scenario-keyname list. */
export const MARKER_SCEN_NAME_LIST = '[';

/** Marker: server's end-of-list scenario name. */
export const MARKER_NO_MORE_SCENS = '-';

/** lastModVersion value indicating the requested scenario key is unknown. */
export const MARKER_KEY_UNKNOWN = -2;

/** Strict integer check matching Java Integer.parseInt. */
function parseIntStrict(s: string): number {
  if (!/^[+-]?\d+$/.test(s)) {
    throw new Error(`not an integer: ${s}`);
  }
  return Number.parseInt(s, 10);
}

/** Parsed scenario details (server reply with a known scenario). */
export interface ScenarioDetails {
  /** Scenario keyname. */
  readonly key: string;
  /** Minimum client version. */
  readonly minVersion: number;
  /** Last-modified version. */
  readonly lastModVersion: number;
  /** Packed game-options string for this scenario (field [3]), or "-". */
  readonly opts: string;
  /** One-line title/description (field [4]), localized if available. */
  readonly title: string;
  /** Optional long description (field [5]), or null. */
  readonly longDesc: string | null;
}

/**
 * Scenario info request/reply. Mirrors Java {@code SOCScenarioInfo}. Use the
 * static factory helpers to build the various request/reply forms.
 */
export class SOCScenarioInfo implements SOCMessage {
  readonly type = MessageType.SCENARIOINFO;

  /** True if this is a server reply (not a client request). */
  readonly isFromServer: boolean;

  /** True if the requested scenario key is unknown at the server. */
  readonly isKeyUnknown: boolean;

  /** True if this is the empty end-of-list marker. */
  readonly noMoreScens: boolean;

  /** Scenario key for a server reply (or null when from client). */
  readonly scKey: string | null;

  /** Parsed scenario details if available (server reply), else null. */
  readonly scenario: ScenarioDetails | null;

  /**
   * Client request: scenario keynames asked about. Does NOT include the
   * "[" marker or "?" marker (those are reflected by other fields). Null when
   * this is a server reply.
   */
  readonly requestKeys: readonly string[] | null;

  /** Client request: true if "?" (any-changed) marker was included. */
  readonly requestAnyChanged: boolean;

  private constructor(fields: {
    isFromServer: boolean;
    isKeyUnknown: boolean;
    noMoreScens: boolean;
    scKey: string | null;
    scenario: ScenarioDetails | null;
    requestKeys: readonly string[] | null;
    requestAnyChanged: boolean;
  }) {
    this.isFromServer = fields.isFromServer;
    this.isKeyUnknown = fields.isKeyUnknown;
    this.noMoreScens = fields.noMoreScens;
    this.scKey = fields.scKey;
    this.scenario = fields.scenario;
    this.requestKeys = fields.requestKeys;
    this.requestAnyChanged = fields.requestAnyChanged;
  }

  // ----- Server reply factories -----

  /** Server reply with full scenario details. */
  static fromServer(scenario: ScenarioDetails): SOCScenarioInfo {
    return new SOCScenarioInfo({
      isFromServer: true,
      isKeyUnknown: false,
      noMoreScens: false,
      scKey: scenario.key,
      scenario,
      requestKeys: null,
      requestAnyChanged: false,
    });
  }

  /** Server reply: requested scenario key is unknown. */
  static unknownKey(scKey: string): SOCScenarioInfo {
    return new SOCScenarioInfo({
      isFromServer: true,
      isKeyUnknown: true,
      noMoreScens: false,
      scKey,
      scenario: null,
      requestKeys: null,
      requestAnyChanged: false,
    });
  }

  /** Server reply: end-of-list marker. */
  static noMore(): SOCScenarioInfo {
    return new SOCScenarioInfo({
      isFromServer: true,
      isKeyUnknown: false,
      noMoreScens: true,
      scKey: MARKER_NO_MORE_SCENS,
      scenario: null,
      requestKeys: null,
      requestAnyChanged: false,
    });
  }

  // ----- Client request factories -----

  /** Client request: ask about a single scenario by key. */
  static requestKey(scKey: string): SOCScenarioInfo {
    return new SOCScenarioInfo({
      isFromServer: false,
      isKeyUnknown: false,
      noMoreScens: false,
      scKey: null,
      scenario: null,
      requestKeys: [scKey],
      requestAnyChanged: false,
    });
  }

  /**
   * Client request: ask about a list of keys and/or any-changed.
   * @param keys              scenario keynames (may be empty)
   * @param addMarkerAnyChanged append "?" (any-changed) marker
   * @throws Error if keys empty and not addMarkerAnyChanged (empty message)
   */
  static request(
    keys: readonly string[],
    addMarkerAnyChanged: boolean,
  ): SOCScenarioInfo {
    if (keys.length === 0 && !addMarkerAnyChanged) {
      throw new Error('empty message');
    }
    return new SOCScenarioInfo({
      isFromServer: false,
      isKeyUnknown: false,
      noMoreScens: false,
      scKey: null,
      scenario: null,
      requestKeys: keys.length > 0 ? keys : null,
      requestAnyChanged: addMarkerAnyChanged,
    });
  }

  /** The flat parameter list as it appears on the wire (before EMPTYSTR-encoding). */
  private getParams(): string[] {
    if (!this.isFromServer) {
      // Client request: optional "[" marker + keys + optional "?".
      const pa: string[] = [];
      if (this.requestKeys !== null && this.requestKeys.length > 0) {
        pa.push(MARKER_SCEN_NAME_LIST);
        for (const k of this.requestKeys) {
          pa.push(k);
        }
      }
      if (this.requestAnyChanged) {
        pa.push(MARKER_ANY_CHANGED);
      }
      return pa;
    }

    // Server reply.
    if (this.noMoreScens) {
      return [MARKER_NO_MORE_SCENS];
    }
    if (this.isKeyUnknown) {
      // key, minVersion 0, lastModVersion -2.
      return [this.scKey ?? '', '0', String(MARKER_KEY_UNKNOWN)];
    }
    const sc = this.scenario;
    if (sc === null) {
      return [this.scKey ?? ''];
    }
    const pa = [
      sc.key,
      String(sc.minVersion),
      String(sc.lastModVersion),
      sc.opts,
      sc.title,
    ];
    if (sc.longDesc !== null && sc.longDesc.length > 0) {
      pa.push(sc.longDesc);
    }
    return pa;
  }

  toCmd(): string {
    // Multi-message: SEP before every field; blank fields -> EMPTYSTR.
    let cmd = String(MessageType.SCENARIOINFO);
    for (const p of this.getParams()) {
      cmd += SEP;
      cmd += p.length > 0 ? p : EMPTYSTR;
    }
    return cmd;
  }

  /**
   * Parse the multi-message data portion (SEP-separated). Mirrors Java's
   * SOCScenarioInfo(List) constructor.
   *
   * @param params  data portion (everything after the first SEP)
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCScenarioInfo | null {
    const raw = params.length === 0 ? [] : params.split(SEP);
    const pa = raw.map((t) => (t === EMPTYSTR ? '' : t));
    if (pa.length === 0) {
      return null;
    }

    try {
      const s = pa[0];
      const startsWithCliList = s === MARKER_SCEN_NAME_LIST;
      const isFromServer = !(startsWithCliList || s === MARKER_ANY_CHANGED);

      if (!isFromServer) {
        // Client request: remove "[" marker, collect keys, detect "?".
        let body = startsWithCliList ? pa.slice(1) : pa.slice(0);
        if (startsWithCliList && body.length === 0) {
          return null; // Java: IndexOutOfBoundsException
        }
        let anyChanged = false;
        if (body.length > 0 && body[body.length - 1] === MARKER_ANY_CHANGED) {
          anyChanged = true;
          body = body.slice(0, body.length - 1);
        }
        return new SOCScenarioInfo({
          isFromServer: false,
          isKeyUnknown: false,
          noMoreScens: false,
          scKey: null,
          scenario: null,
          requestKeys: body.length > 0 ? body : null,
          requestAnyChanged: anyChanged,
        });
      }

      // Server reply.
      const scKey = s;
      const noMoreScens = scKey === MARKER_NO_MORE_SCENS;
      if (noMoreScens) {
        return SOCScenarioInfo.noMore();
      }

      const minVers = parseIntStrict(pa[1]);
      const lastModVers = parseIntStrict(pa[2]);
      const isKeyUnknown = lastModVers === MARKER_KEY_UNKNOWN;
      if (isKeyUnknown) {
        return SOCScenarioInfo.unknownKey(scKey);
      }

      // Full scenario reply requires opts (pa[3]) and title (pa[4]); Java would
      // throw IndexOutOfBoundsException (=> null) if those are missing.
      if (pa.length < 5) {
        return null;
      }
      const longDesc = pa.length >= 6 ? pa[5] : null;
      const scenario: ScenarioDetails = {
        key: scKey,
        minVersion: minVers,
        lastModVersion: lastModVers,
        opts: pa[3],
        title: pa[4],
        longDesc: longDesc !== null && longDesc.length > 0 ? longDesc : null,
      };
      return SOCScenarioInfo.fromServer(scenario);
    } catch {
      return null;
    }
  }
}

registerParser(MessageType.SCENARIOINFO, SOCScenarioInfo.parse);
