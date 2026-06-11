// SOCGameState round-trip + parse tests, verified against the Java wire form
// GAMESTATE sep game sep2 state (e.g. "1025|mygame,5").

import { describe, it, expect } from 'vitest';

import { decode, encode, SOCGameState } from './index';
import { GameState } from './constants';

describe('SOCGameState', () => {
  it('matches the Java wire string', () => {
    expect(new SOCGameState('mygame', GameState.NEW).toCmd()).toBe(
      '1025|mygame,0',
    );
    expect(new SOCGameState('mygame', GameState.START1A).toCmd()).toBe(
      '1025|mygame,5',
    );
  });

  it('round-trips encode -> decode -> encode', () => {
    const msg = new SOCGameState('ga', 20);
    const wire = encode(msg);
    const back = decode(wire) as SOCGameState;
    expect(back).toBeInstanceOf(SOCGameState);
    expect(back.game).toBe('ga');
    expect(back.state).toBe(20);
    expect(encode(back)).toBe(wire);
  });

  it('decodes a server frame', () => {
    const back = decode('1025|capgame,5') as SOCGameState;
    expect(back.game).toBe('capgame');
    expect(back.state).toBe(5);
  });

  it('returns null on a non-integer state (garbled)', () => {
    expect(decode('1025|ga,notanint')).toBeNull();
  });

  it('returns null when the state token is missing', () => {
    expect(decode('1025|ga')).toBeNull();
  });
});
