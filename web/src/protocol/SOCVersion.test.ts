import { describe, it, expect } from 'vitest';
import { decode, encode } from './index';
import { SOCVersion } from './messages/SOCVersion';

// Ground-truth wire strings captured from the real Java SOCVersion.toCmd()
// (see web/docs/protocol.md). EMPTYSTR is a literal TAB ("\t").

describe('SOCVersion', () => {
  it('matches the exact Java wire string (build/feats null, locale set)', () => {
    const msg = new SOCVersion(2700, '2.7.00', null, null, 'en_US');
    expect(msg.toCmd()).toBe('9998|2700,2.7.00,\t,\t,en_US');
  });

  it('omits trailing cliLocale entirely when null', () => {
    const msg = new SOCVersion(2700, '2.7.00', null, null, null);
    expect(msg.toCmd()).toBe('9998|2700,2.7.00,\t,\t');
  });

  it('emits build but EMPTYSTR feats when build set, feats null', () => {
    const msg = new SOCVersion(2700, '2.7.00', 'JM20240101', null, null);
    expect(msg.toCmd()).toBe('9998|2700,2.7.00,JM20240101,\t');
  });

  it('emits all fields when present', () => {
    const msg = new SOCVersion(2700, '2.7.00', 'JM20240101', '6pl=1;sb=1', 'en_US');
    expect(msg.toCmd()).toBe('9998|2700,2.7.00,JM20240101,6pl=1;sb=1,en_US');
  });

  it('throws when build is null but feats is non-null (Java parity)', () => {
    expect(() => new SOCVersion(2700, '2.7.00', null, 'x', null)).toThrow();
  });

  it('decodes a server VERSION line', () => {
    const msg = decode('9998|2700,2.7.00,\t,\t,en_US');
    expect(msg).toBeInstanceOf(SOCVersion);
    const v = msg as SOCVersion;
    expect(v.versNum).toBe(2700);
    expect(v.versStr).toBe('2.7.00');
    expect(v.versBuild).toBeNull();
    expect(v.feats).toBeNull();
    expect(v.cliLocale).toBe('en_US');
  });

  it('round-trips via decode(encode(msg)) for each field shape', () => {
    const cases = [
      new SOCVersion(2700, '2.7.00', null, null, 'en_US'),
      new SOCVersion(2700, '2.7.00', null, null, null),
      new SOCVersion(2700, '2.7.00', 'JM20240101', null, null),
      new SOCVersion(2700, '2.7.00', 'JM20240101', '6pl=1;sb=1', 'en_US'),
    ];
    for (const original of cases) {
      const back = decode(encode(original));
      expect(back).toBeInstanceOf(SOCVersion);
      expect(back).toEqual(original);
    }
  });
});
