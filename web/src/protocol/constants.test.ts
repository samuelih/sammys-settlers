import { describe, it, expect } from 'vitest';

import { EMPTYSTR, GAME_NONE, SEP, SEP2 } from './constants';

describe('protocol constants — wire-format tokens', () => {
  it('SEP / SEP2 / EMPTYSTR match the Java SOCMessage values', () => {
    expect(SEP).toBe('|'); // 0x7C
    expect(SEP2).toBe(','); // 0x2C
    expect(EMPTYSTR).toBe('\t'); // single TAB, 0x09
  });

  it('GAME_NONE is the single control char U+0016 (^V/SYN), not the empty string', () => {
    // Java: SOCMessage.GAME_NONE = "\026" (octal 026 == decimal 22 == 0x16),
    // length 1. An empty string would emit a blank/adjacent-separator field on
    // the wire and never match the server's "" in `name === GAME_NONE`.
    expect(GAME_NONE).toBe(String.fromCharCode(0x16));
    expect(GAME_NONE.length).toBe(1);
    expect(GAME_NONE.charCodeAt(0)).toBe(0x16);
    expect(GAME_NONE).not.toBe('');
  });
});
