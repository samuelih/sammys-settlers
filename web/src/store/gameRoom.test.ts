// Unit tests for the current-game (room) reducers added in Phase 2:
// joinGameAuth / setGameMembers / applySitDown / applySeatLock / setGameState /
// clearCurrentGame, plus the registry reducers and maxPlayers derivation.
// These are pure store actions — no network involved.

import { beforeEach, describe, expect, it } from 'vitest';

import {
  SeatLockState,
  SOCSetSeatLock,
  type GameOptionDescriptor,
} from '../protocol';
import {
  type GameInfo,
  isGameStarted,
  maxPlayersFromOptions,
  useGameStore,
} from './gameStore';

/** Reset the store before each test. */
beforeEach(() => {
  const s = useGameStore.getState();
  s.setStatus('disconnected');
  s.resetLobby();
  s.setNickname('WebPlayer');
});

function gi(name: string, options = '', started = false): GameInfo {
  return { name, options, started };
}

describe('maxPlayersFromOptions', () => {
  it('defaults to 4 when PL is absent', () => {
    expect(maxPlayersFromOptions('')).toBe(4);
    expect(maxPlayersFromOptions('BC=t4,VP=t13')).toBe(4);
  });

  it('reads PL=6 and PL=4', () => {
    expect(maxPlayersFromOptions('PL=6')).toBe(6);
    expect(maxPlayersFromOptions('BC=t4,PL=6')).toBe(6);
    expect(maxPlayersFromOptions('PL=4')).toBe(4);
  });

  it('treats PL=5 (PL>4) as a 6-seat game, matching the server', () => {
    // SOCGame sizes maxPlayers=6 whenever PL>4, not only PL===6.
    expect(maxPlayersFromOptions('PL=5')).toBe(6);
    expect(maxPlayersFromOptions('BC=t4,PL=5')).toBe(6);
  });

  it('treats a truthy PLB ("use 6-player board") as a 6-seat game', () => {
    expect(maxPlayersFromOptions('PLB=t')).toBe(6);
    expect(maxPlayersFromOptions('PL=4,PLB=t')).toBe(6);
    expect(maxPlayersFromOptions('PLB=y')).toBe(6);
    // A false / absent boolean char does not count.
    expect(maxPlayersFromOptions('PLB=f')).toBe(4);
    expect(maxPlayersFromOptions('PL=4,PLB=f')).toBe(4);
  });

  it('does not match a substring like NPL', () => {
    // The boundary anchor (start or comma) prevents matching inside other keys.
    expect(maxPlayersFromOptions('XPL=6')).toBe(4);
  });
});

describe('joinGameAuth', () => {
  it('creates a fresh 4-seat room by default', () => {
    useGameStore.getState().joinGameAuth('mygame');
    const cg = useGameStore.getState().currentGame;
    expect(cg).not.toBeNull();
    expect(cg?.gameName).toBe('mygame');
    expect(cg?.maxPlayers).toBe(4);
    expect(cg?.players).toEqual([null, null, null, null]);
    expect(cg?.seatLocks).toEqual([
      SeatLockState.UNLOCKED,
      SeatLockState.UNLOCKED,
      SeatLockState.UNLOCKED,
      SeatLockState.UNLOCKED,
    ]);
    expect(cg?.mySeat).toBe(-1);
    expect(cg?.iJoined).toBe(true);
    expect(cg?.gameState).toBe(0);
  });

  it('sizes seats from the matching lobby game options (PL=6)', () => {
    useGameStore.getState().setGames([gi('big', 'PL=6')]);
    useGameStore.getState().joinGameAuth('big');
    const cg = useGameStore.getState().currentGame;
    expect(cg?.maxPlayers).toBe(6);
    expect(cg?.players).toHaveLength(6);
    expect(cg?.options).toBe('PL=6');
  });

  it('strips the unjoinable marker from the game name', () => {
    useGameStore.getState().joinGameAuth('?locked');
    expect(useGameStore.getState().currentGame?.gameName).toBe('locked');
  });

  it('keeps accumulated seats if AUTH arrives for the same game again', () => {
    useGameStore.getState().joinGameAuth('g');
    useGameStore.getState().applySitDown('g', 1, 'droid 1', true);
    useGameStore.getState().joinGameAuth('g'); // second AUTH for same game
    const cg = useGameStore.getState().currentGame;
    expect(cg?.players[1]).toEqual({ name: 'droid 1', isRobot: true });
  });
});

describe('setGameMembers', () => {
  it('replaces the member list for the joined game', () => {
    useGameStore.getState().joinGameAuth('g');
    useGameStore.getState().setGameMembers('g', ['WebPlayer', 'droid 1']);
    expect(useGameStore.getState().currentGame?.members).toEqual([
      'WebPlayer',
      'droid 1',
    ]);
  });

  it('ignores members for a different game', () => {
    useGameStore.getState().joinGameAuth('g');
    useGameStore.getState().setGameMembers('other', ['x']);
    expect(useGameStore.getState().currentGame?.members).toEqual([]);
  });
});

describe('applySitDown', () => {
  it('seats a player and sets mySeat for the local nickname', () => {
    useGameStore.getState().joinGameAuth('g');
    useGameStore.getState().applySitDown('g', 0, 'WebPlayer', false);
    const cg = useGameStore.getState().currentGame;
    expect(cg?.players[0]).toEqual({ name: 'WebPlayer', isRobot: false });
    expect(cg?.mySeat).toBe(0);
  });

  it('seats a bot without changing mySeat', () => {
    useGameStore.getState().joinGameAuth('g');
    useGameStore.getState().applySitDown('g', 0, 'WebPlayer', false);
    useGameStore.getState().applySitDown('g', 1, 'droid 1', true);
    const cg = useGameStore.getState().currentGame;
    expect(cg?.players[1]).toEqual({ name: 'droid 1', isRobot: true });
    expect(cg?.mySeat).toBe(0);
  });

  it('ignores an out-of-range seat number', () => {
    useGameStore.getState().joinGameAuth('g'); // 4 seats
    useGameStore.getState().applySitDown('g', 9, 'x', false);
    expect(useGameStore.getState().currentGame?.players).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('ignores sit-downs for a non-joined game', () => {
    useGameStore.getState().joinGameAuth('g');
    useGameStore.getState().applySitDown('other', 0, 'x', false);
    expect(useGameStore.getState().currentGame?.players[0]).toBeNull();
  });
});

describe('applySeatLock', () => {
  it('applies a single-seat lock', () => {
    useGameStore.getState().joinGameAuth('g');
    useGameStore
      .getState()
      .applySeatLock(SOCSetSeatLock.forSeat('g', 2, SeatLockState.LOCKED));
    expect(useGameStore.getState().currentGame?.seatLocks[2]).toBe(
      SeatLockState.LOCKED,
    );
  });

  it('applies an all-seats lock array (the server\'s join greeting form)', () => {
    useGameStore.getState().joinGameAuth('g');
    useGameStore.getState().applySeatLock(
      SOCSetSeatLock.forAllSeats('g', [
        SeatLockState.UNLOCKED,
        SeatLockState.LOCKED,
        SeatLockState.CLEAR_ON_RESET,
        SeatLockState.UNLOCKED,
      ]),
    );
    expect(useGameStore.getState().currentGame?.seatLocks).toEqual([
      SeatLockState.UNLOCKED,
      SeatLockState.LOCKED,
      SeatLockState.CLEAR_ON_RESET,
      SeatLockState.UNLOCKED,
    ]);
  });

  it('ignores locks for a different game', () => {
    useGameStore.getState().joinGameAuth('g');
    useGameStore
      .getState()
      .applySeatLock(SOCSetSeatLock.forSeat('other', 0, SeatLockState.LOCKED));
    expect(useGameStore.getState().currentGame?.seatLocks[0]).toBe(
      SeatLockState.UNLOCKED,
    );
  });

  it('grows the room to 6 seats when a 6-seat all-seats greeting arrives', () => {
    // The room was sized to 4 (no options); the server's authoritative all-seats
    // greeting reveals 6 seats. The room must resize so seats 4/5 exist (and
    // their later bots/locks land), not be truncated to 4.
    useGameStore.getState().joinGameAuth('g'); // 4 seats by default
    useGameStore.getState().applySitDown('g', 0, 'WebPlayer', false);
    useGameStore.getState().applySeatLock(
      SOCSetSeatLock.forAllSeats('g', [
        SeatLockState.UNLOCKED,
        SeatLockState.UNLOCKED,
        SeatLockState.LOCKED,
        SeatLockState.UNLOCKED,
        SeatLockState.UNLOCKED,
        SeatLockState.UNLOCKED,
      ]),
    );
    const cg = useGameStore.getState().currentGame;
    expect(cg?.maxPlayers).toBe(6);
    expect(cg?.players).toHaveLength(6);
    expect(cg?.seatLocks).toHaveLength(6);
    // Existing seating is preserved; new seats are vacant.
    expect(cg?.players[0]).toEqual({ name: 'WebPlayer', isRobot: false });
    expect(cg?.players[4]).toBeNull();
    expect(cg?.players[5]).toBeNull();
    expect(cg?.seatLocks[2]).toBe(SeatLockState.LOCKED);
    // A bot can now sit in a seat that previously did not exist.
    useGameStore.getState().applySitDown('g', 5, 'droid 9', true);
    expect(useGameStore.getState().currentGame?.players[5]).toEqual({
      name: 'droid 9',
      isRobot: true,
    });
  });
});

describe('setGameState / isGameStarted', () => {
  it('advances the game state for the joined game', () => {
    useGameStore.getState().joinGameAuth('g');
    expect(isGameStarted(useGameStore.getState().currentGame)).toBe(false);
    useGameStore.getState().setGameState('g', 5); // START1A
    expect(useGameStore.getState().currentGame?.gameState).toBe(5);
    expect(isGameStarted(useGameStore.getState().currentGame)).toBe(true);
  });

  it('a NEW (0) / READY (1) state is not "started"', () => {
    useGameStore.getState().joinGameAuth('g');
    useGameStore.getState().setGameState('g', 1); // READY
    expect(isGameStarted(useGameStore.getState().currentGame)).toBe(false);
  });

  it('ignores state for a non-joined game', () => {
    useGameStore.getState().joinGameAuth('g');
    useGameStore.getState().setGameState('other', 5);
    expect(useGameStore.getState().currentGame?.gameState).toBe(0);
  });
});

describe('clearCurrentGame', () => {
  it('clears the room only for the matching game', () => {
    useGameStore.getState().joinGameAuth('g');
    useGameStore.getState().clearCurrentGame('other');
    expect(useGameStore.getState().currentGame).not.toBeNull();
    useGameStore.getState().clearCurrentGame('g');
    expect(useGameStore.getState().currentGame).toBeNull();
  });
});

describe('option / scenario registries', () => {
  function opt(key: string): GameOptionDescriptor {
    return { key, optType: 'int', desc: key };
  }

  it('upsertOption merges by key, setOptionsLoaded flips the flag', () => {
    useGameStore.getState().upsertOption(opt('PL'));
    useGameStore.getState().upsertOption(opt('VP'));
    expect(Object.keys(useGameStore.getState().knownOptions).sort()).toEqual([
      'PL',
      'VP',
    ]);
    expect(useGameStore.getState().optionsLoaded).toBe(false);
    useGameStore.getState().setOptionsLoaded(true);
    expect(useGameStore.getState().optionsLoaded).toBe(true);
  });

  it('upsertScenario merges by key', () => {
    useGameStore.getState().upsertScenario({
      key: 'SC_NSHO',
      minVersion: 2000,
      lastModVersion: 2000,
      opts: 'PL=4',
      title: 'New Shores',
      longDesc: null,
    });
    expect(useGameStore.getState().scenarios['SC_NSHO'].title).toBe(
      'New Shores',
    );
  });
});

describe('full practice-vs-bots room sequence (reducers only)', () => {
  it('create -> sit seat 0 -> bots fill 1..3 -> start', () => {
    const s = useGameStore.getState();
    // create + auto-join (4 players)
    s.setGames([gi('cap', 'PL=4')]);
    s.joinGameAuth('cap');
    s.applySeatLock(
      SOCSetSeatLock.forAllSeats('cap', [
        SeatLockState.UNLOCKED,
        SeatLockState.UNLOCKED,
        SeatLockState.UNLOCKED,
        SeatLockState.UNLOCKED,
      ]),
    );
    s.setGameMembers('cap', ['WebPlayer']);
    // human sits seat 0
    s.applySitDown('cap', 0, 'WebPlayer', false);
    expect(useGameStore.getState().currentGame?.mySeat).toBe(0);
    // server fills 3 bots
    s.applySitDown('cap', 1, 'droid 2', true);
    s.applySitDown('cap', 2, 'droid 1', true);
    s.applySitDown('cap', 3, 'robot 6', true);
    // start
    s.setGameState('cap', 5);

    const cg = useGameStore.getState().currentGame;
    expect(cg).not.toBeNull();
    const seated = cg?.players.filter((p) => p !== null) ?? [];
    expect(seated).toHaveLength(4);
    const bots = seated.filter((p) => p !== null && p.isRobot).length;
    expect(bots).toBe(3);
    expect(isGameStarted(cg)).toBe(true);
  });
});
