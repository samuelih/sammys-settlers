// @vitest-environment node
//
// LIVE integration test: drives the real defaults-first option-discovery flow
// against a running Java SOCServer on ws://localhost:8888 and asserts that the
// standard options (PL, VP, SBL, BC, ...) come back as fully-typed descriptors
// — NOT OTYPE_UNKNOWN. This is the end-to-end proof of the Phase-2 fix.
//
// Requires a live server (web/scripts/start-test-server.sh). When no server is
// reachable, every test self-SKIPS so `npm test` stays green offline/CI.
//
// It exercises the SAME protocol codec the app uses (decode/encode), plus the
// SAME handshake feature string (CLIENT_FEATURES) and discovery helpers
// (parseDefaultsKeys, descriptorFromInfo, mergeDefaultValue), but over a raw
// `ws` socket so it can run in Node without a browser WebSocket.

import { WebSocket } from 'ws';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  decode,
  encode,
  MessageType,
  SOCGameOptionGetDefaults,
  SOCGameOptionGetInfos,
  SOCGameOptionInfo,
  SOCVersion,
  descriptorFromInfo,
  mergeDefaultValue,
  parseDefaultsKeys,
  type GameOptionDescriptor,
} from '../protocol';
import {
  CLIENT_FEATURES,
  CLIENT_LOCALE,
  CLIENT_VERSION_BUILD,
  CLIENT_VERSION_NUMBER,
  CLIENT_VERSION_STRING,
} from './GameConnection';

const WS_URL = process.env.JS_WS_URL ?? 'ws://localhost:8888';
const CONNECT_TIMEOUT_MS = 1500;
const FLOW_TIMEOUT_MS = 8000;

/** Result of a full live discovery run. */
interface DiscoveryResult {
  /** Ordered frames sent C->S (raw toCmd strings). */
  sent: string[];
  /** Ordered frames received S->C that are part of the option flow. */
  recvOptionFrames: string[];
  /** Final descriptors keyed by option key (post-merge). */
  descriptors: Record<string, GameOptionDescriptor>;
  /** The raw defaults string from the server's 1080 reply. */
  defaultsString: string;
}

/** Is a live server reachable? Decided once before the suite. */
let serverUp = false;

beforeAll(async () => {
  serverUp = await new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (ok: boolean): void => {
      if (done) return;
      done = true;
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve(ok);
    };
    const ws = new WebSocket(WS_URL);
    const t = setTimeout(() => finish(false), CONNECT_TIMEOUT_MS);
    ws.on('open', () => {
      clearTimeout(t);
      finish(true);
    });
    ws.on('error', () => {
      clearTimeout(t);
      finish(false);
    });
  });
});

/**
 * Run the real defaults-first discovery against the live server, mirroring the
 * web client: VERSION handshake (with features) -> GAMEOPTIONGETDEFAULTS ->
 * explicit GAMEOPTIONGETINFOS -> collect GAMEOPTIONINFO until the end marker.
 */
function runDiscovery(): Promise<DiscoveryResult> {
  return new Promise<DiscoveryResult>((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    const sent: string[] = [];
    const recvOptionFrames: string[] = [];
    const infos = new Map<string, SOCGameOptionInfo>();
    let defaultsString = '';
    let defaults = new Map<string, string>();
    let sentVersion = false;
    let sentDefaults = false;

    const send = (cmd: string): void => {
      sent.push(cmd);
      ws.send(cmd);
    };

    const fail = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      reject(new Error('live discovery timed out'));
    }, FLOW_TIMEOUT_MS);

    ws.on('error', (e) => {
      clearTimeout(fail);
      reject(e);
    });

    ws.on('message', (data: unknown) => {
      const raw = String(data);
      const msg = decode(raw);
      if (msg === null) {
        return;
      }

      if (msg.type === MessageType.VERSION && !sentVersion) {
        sentVersion = true;
        send(
          encode(
            new SOCVersion(
              CLIENT_VERSION_NUMBER,
              CLIENT_VERSION_STRING,
              CLIENT_VERSION_BUILD,
              CLIENT_FEATURES,
              CLIENT_LOCALE,
            ),
          ),
        );
        // After the handshake completes (server has our version+feats), kick off
        // discovery. A small delay lets the server finish sending the game list.
        setTimeout(() => {
          if (!sentDefaults) {
            sentDefaults = true;
            send(encode(new SOCGameOptionGetDefaults(null)));
          }
        }, 300);
        return;
      }

      if (msg.type === MessageType.GAMEOPTIONGETDEFAULTS) {
        recvOptionFrames.push(raw);
        const def = msg as SOCGameOptionGetDefaults;
        defaultsString = def.opts ?? '';
        const parsed = parseDefaultsKeys(defaultsString);
        defaults = parsed.values;
        send(encode(new SOCGameOptionGetInfos(parsed.keys, true, false)));
        return;
      }

      if (msg.type === MessageType.GAMEOPTIONINFO) {
        recvOptionFrames.push(raw);
        const info = msg as SOCGameOptionInfo;
        if (info.isNoMoreOpts()) {
          clearTimeout(fail);
          // Build + merge descriptors exactly as the store does.
          const descriptors: Record<string, GameOptionDescriptor> = {};
          for (const [key, inf] of infos) {
            let d = descriptorFromInfo(inf);
            const raw0 = defaults.get(key);
            if (raw0 !== undefined) {
              d = mergeDefaultValue(d, raw0);
            }
            descriptors[key] = d;
          }
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          resolve({ sent, recvOptionFrames, descriptors, defaultsString });
          return;
        }
        infos.set(info.key, info);
      }
    });
  });
}

describe('live option discovery against the Java server (WS 8888)', () => {
  it('returns PL/VP/SBL/BC as fully-typed descriptors, not unknown', async () => {
    if (!serverUp) {
      // No live server reachable: skip so `npm test` stays green offline.
      return;
    }

    const res = await runDiscovery();

    // The C->S sequence: VERSION (with feats) -> 1080 -> 1081(explicit keys).
    expect(res.sent.some((c) => c.startsWith('9998|'))).toBe(true);
    expect(res.sent).toContain('1080');
    const getInfos = res.sent.find((c) => c.startsWith('1081|'));
    expect(getInfos, 'sent an explicit GAMEOPTIONGETINFOS').toBeDefined();
    // Must be an explicit key list, NOT the bare "-" all-changed form.
    expect(getInfos).not.toBe('1081|-');
    expect(getInfos).not.toMatch(/\|-($|,)/);

    // The standard options the user must be able to configure.
    const want = ['PL', 'VP', 'SBL', 'BC', 'N7', 'NT', 'RD', 'PLB'];
    for (const key of want) {
      const d = res.descriptors[key];
      expect(d, `${key} present in descriptors`).toBeDefined();
      expect(d.optType, `${key} not unknown`).not.toBe('unknown');
      expect(d.desc.length, `${key} has a description`).toBeGreaterThan(0);
    }

    // Concrete shape checks that only pass if features were honored:
    expect(res.descriptors.PL.optType).toBe('int');
    expect(res.descriptors.PL.maxIntValue).toBe(6); // 6pl feature honored
    expect(res.descriptors.VP.optType).toBe('intbool');
    expect(res.descriptors.SBL.optType).toBe('bool'); // sb feature honored
    expect(res.descriptors.SBL.desc).toBe('Use sea board');
    expect(res.descriptors.BC.optType).toBe('intbool');

    // ZERO unknown descriptors overall.
    const unknowns = Object.values(res.descriptors).filter(
      (d) => d.optType === 'unknown',
    );
    expect(unknowns.map((d) => d.key)).toEqual([]);
  });

  it('the defaults reply lists the standard option keys', async () => {
    if (!serverUp) {
      return;
    }
    const res = await runDiscovery();
    const { keys } = parseDefaultsKeys(res.defaultsString);
    for (const key of ['PL', 'VP', 'SBL', 'BC', 'N7', 'NT', 'RD', 'PLB']) {
      expect(keys, `${key} in defaults reply`).toContain(key);
    }
  });
});
