// Unit tests for the gameStore reducers: upsertGame / removeGame / setGames,
// plus setStatus / setServerVersion / setChannels. These are pure store
// actions — no network involved.

import { beforeEach, describe, expect, it } from 'vitest';

import { StatusValue } from '../protocol';
import {
  type GameInfo,
  gameInfoFromWithOptions,
  isOkStatusValue,
  useGameStore,
} from './gameStore';

/** Reset the store to a clean state before each test. */
beforeEach(() => {
  const s = useGameStore.getState();
  s.setStatus('disconnected');
  s.resetLobby();
});

function gi(name: string, options = '', started = false): GameInfo {
  return { name, options, started };
}

describe('gameStore connection reducers', () => {
  it('setStatus updates status', () => {
    useGameStore.getState().setStatus('connecting');
    expect(useGameStore.getState().status).toBe('connecting');
    useGameStore.getState().setStatus('connected');
    expect(useGameStore.getState().status).toBe('connected');
  });

  it('setStatus("error", detail) records the error', () => {
    useGameStore.getState().setStatus('error', 'boom');
    expect(useGameStore.getState().status).toBe('error');
    expect(useGameStore.getState().error).toBe('boom');
  });

  it('setServerVersion records number and string', () => {
    useGameStore.getState().setServerVersion(2700, '2.7.00');
    expect(useGameStore.getState().serverVersion).toBe(2700);
    expect(useGameStore.getState().serverVersionStr).toBe('2.7.00');
  });

  it('setChannels replaces the channel list', () => {
    useGameStore.getState().setChannels(['general', 'help']);
    expect(useGameStore.getState().channels).toEqual(['general', 'help']);
    useGameStore.getState().setChannels([]);
    expect(useGameStore.getState().channels).toEqual([]);
  });
});

describe('gameStore.setGames', () => {
  it('replaces the whole list', () => {
    useGameStore.getState().setGames([gi('a'), gi('b')]);
    expect(useGameStore.getState().games.map((g) => g.name)).toEqual(['a', 'b']);
    useGameStore.getState().setGames([gi('c')]);
    expect(useGameStore.getState().games.map((g) => g.name)).toEqual(['c']);
  });

  it('strips the unjoinable marker from names', () => {
    useGameStore.getState().setGames([gi('?locked'), gi('open')]);
    expect(useGameStore.getState().games.map((g) => g.name)).toEqual(['locked', 'open']);
  });
});

describe('gameStore.upsertGame', () => {
  it('inserts a new game', () => {
    useGameStore.getState().upsertGame(gi('newgame', 'BC=t4'));
    const games = useGameStore.getState().games;
    expect(games).toHaveLength(1);
    expect(games[0]).toEqual({ name: 'newgame', options: 'BC=t4', started: false });
  });

  it('strips the unjoinable marker from the inserted name', () => {
    useGameStore.getState().upsertGame(gi('?lockedgame'));
    expect(useGameStore.getState().games[0].name).toBe('lockedgame');
  });

  it('updates an existing game without losing known options', () => {
    useGameStore.getState().upsertGame(gi('g', 'N7=t7'));
    // A later NEWGAME (no options) must not clobber the known option string.
    useGameStore.getState().upsertGame(gi('g', ''));
    const games = useGameStore.getState().games;
    expect(games).toHaveLength(1);
    expect(games[0].options).toBe('N7=t7');
  });

  it('merges the started flag (sticky once true)', () => {
    useGameStore.getState().upsertGame(gi('g', '', true));
    useGameStore.getState().upsertGame(gi('g', '', false));
    expect(useGameStore.getState().games[0].started).toBe(true);
  });

  it('does not create duplicates for the same name', () => {
    useGameStore.getState().upsertGame(gi('dup'));
    useGameStore.getState().upsertGame(gi('dup', 'PL=t6'));
    const games = useGameStore.getState().games;
    expect(games).toHaveLength(1);
    expect(games[0].options).toBe('PL=t6');
  });
});

describe('gameInfoFromWithOptions', () => {
  it('maps the clean GAMESWITHOPTIONS no-options "-" to an empty summary', () => {
    expect(gameInfoFromWithOptions('g', '-')).toEqual({
      name: 'g',
      options: '',
      started: false,
    });
  });

  it('maps the NEWGAMEWITHOPTIONS leading-comma ",-" to an empty summary', () => {
    // SOCNewGameWithOptions decodes a no-options game to opts ",-" (leading
    // comma kept by nextToken(SEP)); it must NOT show ",-" in the lobby.
    expect(gameInfoFromWithOptions('g', ',-').options).toBe('');
  });

  it('strips a single leading comma from a real options string', () => {
    // ",BC=t4,N7=f7" -> "BC=t4,N7=f7" (no stray leading comma in the lobby).
    expect(gameInfoFromWithOptions('g', ',BC=t4,N7=f7').options).toBe('BC=t4,N7=f7');
  });

  it('leaves a clean options string unchanged', () => {
    expect(gameInfoFromWithOptions('g', 'BC=t4,N7=f7').options).toBe('BC=t4,N7=f7');
  });
});

describe('isOkStatusValue (STATUSMESSAGE OK/info vs error)', () => {
  it('treats SV_OK and the OK_* family as OK/info, not errors', () => {
    expect(isOkStatusValue(StatusValue.SV_OK)).toBe(true);
    expect(isOkStatusValue(StatusValue.SV_OK_SET_NICKNAME)).toBe(true);
    expect(isOkStatusValue(StatusValue.SV_OK_DEBUG_MODE_ON)).toBe(true);
  });

  it('treats genuine error codes as not-OK', () => {
    expect(isOkStatusValue(StatusValue.SV_NOT_OK_GENERIC)).toBe(false);
    expect(isOkStatusValue(StatusValue.SV_PW_WRONG)).toBe(false);
    expect(isOkStatusValue(StatusValue.SV_NAME_IN_USE)).toBe(false);
    expect(isOkStatusValue(StatusValue.SV_NEWGAME_ALREADY_EXISTS)).toBe(false);
    // Account-created codes are NOT collapsed to SV_OK by the Java client's
    // showStatus(..., sv == SV_OK, ...) call, so they are not "OK" here.
    expect(isOkStatusValue(StatusValue.SV_ACCT_CREATED_OK)).toBe(false);
  });
});

describe('gameStore.removeGame', () => {
  it('removes a game by name', () => {
    useGameStore.getState().setGames([gi('a'), gi('b'), gi('c')]);
    useGameStore.getState().removeGame('b');
    expect(useGameStore.getState().games.map((g) => g.name)).toEqual(['a', 'c']);
  });

  it('handles the unjoinable marker on the removed name', () => {
    useGameStore.getState().setGames([gi('locked')]);
    useGameStore.getState().removeGame('?locked');
    expect(useGameStore.getState().games).toHaveLength(0);
  });

  it('is a no-op for an unknown name', () => {
    useGameStore.getState().setGames([gi('a')]);
    useGameStore.getState().removeGame('nope');
    expect(useGameStore.getState().games.map((g) => g.name)).toEqual(['a']);
  });
});
