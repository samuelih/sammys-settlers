import { describe, it, expect } from 'vitest';
import {
  decode,
  encode,
  SOCGames,
  SOCGamesWithOptions,
  SOCNewGame,
  SOCNewGameWithOptions,
  SOCDeleteGame,
} from './index';

// Wire strings captured from the real Java classes; see web/docs/protocol.md.

describe('SOCGames', () => {
  it('matches the Java wire string', () => {
    expect(new SOCGames(['g1', 'g2']).toCmd()).toBe('1019|g1,g2');
  });

  it('serializes an empty list as "1019|"', () => {
    expect(new SOCGames([]).toCmd()).toBe('1019|');
  });

  it('round-trips (including empty)', () => {
    for (const games of [['g1', 'g2'], []]) {
      const original = new SOCGames(games);
      const back = decode(encode(original));
      expect(back).toBeInstanceOf(SOCGames);
      expect((back as SOCGames).games).toEqual(games);
    }
  });
});

describe('SOCNewGame', () => {
  it('matches the Java wire string', () => {
    expect(new SOCNewGame('MyGame').toCmd()).toBe('1016|MyGame');
  });

  it('round-trips', () => {
    const original = new SOCNewGame('MyGame');
    const back = decode(encode(original));
    expect(back).toBeInstanceOf(SOCNewGame);
    expect(back).toEqual(original);
  });
});

describe('SOCDeleteGame', () => {
  it('matches the Java wire string', () => {
    expect(new SOCDeleteGame('MyGame').toCmd()).toBe('1015|MyGame');
  });

  it('round-trips', () => {
    const original = new SOCDeleteGame('MyGame');
    const back = decode(encode(original));
    expect(back).toBeInstanceOf(SOCDeleteGame);
    expect(back).toEqual(original);
  });
});

describe('SOCGamesWithOptions (multi-message)', () => {
  it('serializes an empty list as just "1083" (no SEP)', () => {
    expect(new SOCGamesWithOptions([]).toCmd()).toBe('1083');
  });

  it('matches the Java wire string for two games (SEP between every field)', () => {
    const msg = new SOCGamesWithOptions([
      { name: 'game1', optsStr: 'BC=t4' },
      { name: 'game2', optsStr: '-' },
    ]);
    expect(msg.toCmd()).toBe('1083|game1|BC=t4|game2|-');
  });

  it('decodes the two-game wire string into game/opts pairs', () => {
    const back = decode('1083|game1|BC=t4|game2|-') as SOCGamesWithOptions;
    expect(back).toBeInstanceOf(SOCGamesWithOptions);
    expect(back.games).toEqual([
      { name: 'game1', optsStr: 'BC=t4' },
      { name: 'game2', optsStr: '-' },
    ]);
    expect(back.getParams()).toEqual(['game1', 'BC=t4', 'game2', '-']);
  });

  it('decodes an empty "1083" (no SEP) into an empty list', () => {
    const back = decode('1083') as SOCGamesWithOptions;
    expect(back).toBeInstanceOf(SOCGamesWithOptions);
    expect(back.games).toEqual([]);
  });

  it('restores EMPTYSTR fields to "" on parse', () => {
    // A blank option string is sent as EMPTYSTR ("\t") on the wire.
    const msg = new SOCGamesWithOptions([{ name: 'g', optsStr: '' }]);
    expect(msg.toCmd()).toBe('1083|g|\t');
    const back = decode(msg.toCmd()) as SOCGamesWithOptions;
    expect(back.games).toEqual([{ name: 'g', optsStr: '' }]);
  });

  it('returns null for an odd number of params (garbled)', () => {
    expect(decode('1083|onlyname')).toBeNull();
  });

  it('round-trips (empty and non-empty)', () => {
    const cases: SOCGamesWithOptions[] = [
      new SOCGamesWithOptions([]),
      new SOCGamesWithOptions([
        { name: 'game1', optsStr: 'BC=t4' },
        { name: 'game2', optsStr: '-' },
      ]),
    ];
    for (const original of cases) {
      const back = decode(encode(original));
      expect(back).toBeInstanceOf(SOCGamesWithOptions);
      expect((back as SOCGamesWithOptions).games).toEqual(original.games);
    }
  });
});

describe('SOCNewGameWithOptions', () => {
  // Server emits "1079|game,minVers,opts" where opts is "-" for no options.
  // Java's parser keeps a leading "," on the parsed options field, so the
  // DECODED message is the stable representation (see message file header).

  it('matches the Java wire string when constructed with raw fields', () => {
    const msg = new SOCNewGameWithOptions('mygame', 2700, '-');
    expect(msg.toCmd()).toBe('1079|mygame,2700,-');
  });

  it('decodes the server no-options wire form, keeping the leading comma', () => {
    // Verified against Java: getOptionsString() == ",-" (NOT mapped to null).
    const back = decode('1079|mygame,2700,-') as SOCNewGameWithOptions;
    expect(back).toBeInstanceOf(SOCNewGameWithOptions);
    expect(back.game).toBe('mygame');
    expect(back.minVers).toBe(2700);
    expect(back.opts).toBe(',-');
  });

  it('decodes an options string, keeping the leading comma (Java parity)', () => {
    // Verified against Java: getOptionsString() == ",BC=t4,N7=f7".
    const back = decode('1079|mygame,2700,BC=t4,N7=f7') as SOCNewGameWithOptions;
    expect(back.game).toBe('mygame');
    expect(back.minVers).toBe(2700);
    expect(back.opts).toBe(',BC=t4,N7=f7');
  });

  it('re-encode grows the leading comma exactly like Java (not an identity)', () => {
    // Verified against the real Java class: re-parsing accumulates one leading
    // comma per round-trip. We reproduce this byte-for-byte rather than
    // "cleaning up", to stay faithful to the server protocol.
    const first = decode('1079|mygame,2700,BC=t4,N7=f7') as SOCNewGameWithOptions;
    expect(first.opts).toBe(',BC=t4,N7=f7');
    expect(encode(first)).toBe('1079|mygame,2700,,BC=t4,N7=f7'); // Java: same

    const second = decode(encode(first)) as SOCNewGameWithOptions;
    expect(second.opts).toBe(',,BC=t4,N7=f7'); // Java: same growth
    expect(encode(second)).toBe('1079|mygame,2700,,,BC=t4,N7=f7');
  });

  it('returns null when minVers is not an integer (garbled)', () => {
    expect(decode('1079|mygame,xx,-')).toBeNull();
  });
});
