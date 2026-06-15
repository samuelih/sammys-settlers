import { describe, it, expect } from 'vitest';
import { decode, encode, SOCVersion, SOCServerPing } from './index';
import { parseJavaInt } from './javaInt';

describe('decode/encode core', () => {
  it('dispatches on the type id up to the first SEP', () => {
    const msg = decode('9999|50');
    expect(msg).toBeInstanceOf(SOCServerPing);
    expect((msg as SOCServerPing).sleepTime).toBe(50);
  });

  it('returns null for an unknown message type id', () => {
    // 1234 has no registered parser (mirrors Java toMsg default branch).
    expect(decode('1234|whatever')).toBeNull();
  });

  it('returns null for a non-numeric type id', () => {
    expect(decode('notanumber|x')).toBeNull();
  });

  it('rejects garbled type-id tokens that Java Integer.parseInt would reject', () => {
    // JS Number.parseInt is lenient (stops at the first non-digit), but Java's
    // toMsg does Integer.parseInt(token) which throws -> toMsg returns null.
    // 1083 is GAMESWITHOPTIONS, a registered parser; without strict validation
    // "1083abc" would be truncated to 1083 and mis-dispatched.
    expect(decode('1083abc|game|opt')).toBeNull();
    expect(decode('  1083|x')).toBeNull();
    expect(decode('1083.5|x')).toBeNull();
    expect(decode('0x10|x')).toBeNull();
    expect(decode('1e3|x')).toBeNull();
  });

  it('accepts a leading + on the type id, matching Java Integer.parseInt', () => {
    // Java's Integer.parseInt("+9999") == 9999; the regex must allow a sign.
    const msg = decode('+9999|50');
    expect(msg).not.toBeNull();
    expect(msg?.type).toBe(9999);
  });

  it('rejects type ids outside Java int range', () => {
    expect(decode('2147483648|x')).toBeNull();
    expect(decode('-2147483649|x')).toBeNull();
    expect(decode('999999999999999999999999999999999999|x')).toBeNull();
  });

  it('returns null when the parser rejects garbled data', () => {
    // SERVERPING data must be an integer.
    expect(decode('9999|notanint')).toBeNull();
  });

  it('handles a multi-message type id with no SEP at all', () => {
    // "1083" (GAMESWITHOPTIONS, empty) has no SEP; decode must still dispatch.
    const msg = decode('1083');
    expect(msg).not.toBeNull();
    expect(msg?.type).toBe(1083);
  });

  it('encode is equivalent to toCmd', () => {
    const v = new SOCVersion(2700, '2.7.00', null, null, 'en_US');
    expect(encode(v)).toBe(v.toCmd());
  });
});

describe('parseJavaInt', () => {
  it('matches Java int range boundaries', () => {
    expect(parseJavaInt('2147483647')).toBe(2147483647);
    expect(parseJavaInt('-2147483648')).toBe(-2147483648);
    expect(parseJavaInt('2147483648')).toBeNull();
    expect(parseJavaInt('-2147483649')).toBeNull();
  });

  it('rejects lenient JavaScript parseInt inputs', () => {
    expect(parseJavaInt('1083abc')).toBeNull();
    expect(parseJavaInt(' 1083')).toBeNull();
    expect(parseJavaInt('1e3')).toBeNull();
  });
});
