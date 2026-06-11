import { describe, it, expect } from 'vitest';
import {
  decode,
  encode,
  SOCJoinGame,
  SOCJoinGameAuth,
  SOCSitDown,
  SOCStartGame,
  SOCSetSeatLock,
  SOCLeaveGame,
  SOCGameMembers,
  SOCNewGameWithOptionsRequest,
  SeatLockState,
} from './index';

// Wire strings verified against the real Java classes (TAB = EMPTYSTR "\t").

describe('SOCJoinGame', () => {
  it('matches the Java wire string (empty pw -> EMPTYSTR, host EMPTYSTR)', () => {
    const msg = new SOCJoinGame('myname', '', '\t', 'mygame');
    expect(msg.toCmd()).toBe('1013|myname,\t,\t,mygame');
  });

  it('keeps a real password', () => {
    const msg = new SOCJoinGame('myname', 'secret', '\t', 'mygame');
    expect(msg.toCmd()).toBe('1013|myname,secret,\t,mygame');
  });

  it('normalizes EMPTYSTR/null password to "" in the constructor', () => {
    expect(new SOCJoinGame('n', '\t', '\t', 'g').password).toBe('');
    expect(new SOCJoinGame('n', null, '\t', 'g').password).toBe('');
  });

  it('decodes EMPTYSTR password back to ""', () => {
    const back = decode('1013|myname,\t,\t,mygame') as SOCJoinGame;
    expect(back).toBeInstanceOf(SOCJoinGame);
    expect(back.nickname).toBe('myname');
    expect(back.password).toBe('');
    expect(back.host).toBe('\t');
    expect(back.game).toBe('mygame');
  });

  it('round-trips', () => {
    for (const m of [
      new SOCJoinGame('-', '', '\t', 'g1'),
      new SOCJoinGame('bob', 'pw', '-', 'g2'),
    ]) {
      const back = decode(encode(m)) as SOCJoinGame;
      expect(back).toBeInstanceOf(SOCJoinGame);
      expect(back).toEqual(m);
    }
  });

  it('returns null when fewer than 4 fields (garbled)', () => {
    expect(decode('1013|a,b,c')).toBeNull();
  });
});

describe('SOCJoinGameAuth', () => {
  it('matches the Java wire string (no board dims)', () => {
    expect(new SOCJoinGameAuth('mygame').toCmd()).toBe('1021|mygame');
  });

  it('emits board height/width when set', () => {
    expect(new SOCJoinGameAuth('mygame', 20, 21).toCmd()).toBe(
      '1021|mygame,20,21',
    );
  });

  it('emits the S-marked layoutVS array', () => {
    // Verified shape from Java: "ga,20,21,S,-2,1,3,0".
    expect(new SOCJoinGameAuth('ga', 20, 21, [-2, 1, 3, 0]).toCmd()).toBe(
      '1021|ga,20,21,S,-2,1,3,0',
    );
  });

  it('throws when layoutVS length < 2', () => {
    expect(() => new SOCJoinGameAuth('ga', 20, 21, [1])).toThrow();
  });

  it('decodes the plain and dimensioned forms', () => {
    const a = decode('1021|mygame') as SOCJoinGameAuth;
    expect(a.game).toBe('mygame');
    expect(a.boardHeight).toBe(0);
    expect(a.layoutVS).toBeNull();

    const b = decode('1021|ga,20,21,S,-2,1,3,0') as SOCJoinGameAuth;
    expect(b.boardHeight).toBe(20);
    expect(b.boardWidth).toBe(21);
    expect(b.layoutVS).toEqual([-2, 1, 3, 0]);
  });

  it('returns null for an unrecognized optional marker', () => {
    expect(decode('1021|ga,20,21,X,1,2')).toBeNull();
  });

  it('round-trips', () => {
    for (const m of [
      new SOCJoinGameAuth('g'),
      new SOCJoinGameAuth('g', 20, 21),
      new SOCJoinGameAuth('g', 20, 21, [-2, 1]),
    ]) {
      const back = decode(encode(m)) as SOCJoinGameAuth;
      expect(back).toBeInstanceOf(SOCJoinGameAuth);
      expect(back.toCmd()).toBe(m.toCmd());
    }
  });
});

describe('SOCSitDown', () => {
  it('matches the Java wire string (lowercase boolean)', () => {
    expect(new SOCSitDown('mygame', 'bob', 2, true).toCmd()).toBe(
      '1012|mygame,bob,2,true',
    );
    expect(new SOCSitDown('mygame', 'droid 1', 0, false).toCmd()).toBe(
      '1012|mygame,droid 1,0,false',
    );
  });

  it('parses robotFlag only from the exact (case-insensitive) "true"', () => {
    expect((decode('1012|g,n,1,true') as SOCSitDown).robotFlag).toBe(true);
    expect((decode('1012|g,n,1,TRUE') as SOCSitDown).robotFlag).toBe(true);
    expect((decode('1012|g,n,1,false') as SOCSitDown).robotFlag).toBe(false);
    expect((decode('1012|g,n,1,yes') as SOCSitDown).robotFlag).toBe(false);
  });

  it('returns null when playerNumber is not an int', () => {
    expect(decode('1012|g,n,x,true')).toBeNull();
  });

  it('round-trips', () => {
    for (const m of [
      new SOCSitDown('g', 'p', 3, true),
      new SOCSitDown('g', '-', 0, false),
    ]) {
      const back = decode(encode(m)) as SOCSitDown;
      expect(back).toBeInstanceOf(SOCSitDown);
      expect(back).toEqual(m);
    }
  });
});

describe('SOCStartGame', () => {
  it('matches the Java wire string with no game state', () => {
    expect(new SOCStartGame('mygame').toCmd()).toBe('1018|mygame');
    expect(new SOCStartGame('mygame', 0).toCmd()).toBe('1018|mygame');
  });

  it('emits the optional game state when > 0', () => {
    expect(new SOCStartGame('mygame', 5).toCmd()).toBe('1018|mygame,5');
  });

  it('normalizes negative/zero game state to omit the field', () => {
    expect(new SOCStartGame('mygame', -3).toCmd()).toBe('1018|mygame');
    expect(new SOCStartGame('mygame', -3).gameState).toBe(0);
  });

  it('decodes the optional game state', () => {
    expect((decode('1018|mygame') as SOCStartGame).gameState).toBe(0);
    expect((decode('1018|mygame,5') as SOCStartGame).gameState).toBe(5);
  });

  it('returns null for a non-int game state', () => {
    expect(decode('1018|mygame,xx')).toBeNull();
  });

  it('round-trips', () => {
    for (const m of [new SOCStartGame('g'), new SOCStartGame('g', 5)]) {
      const back = decode(encode(m)) as SOCStartGame;
      expect(back).toBeInstanceOf(SOCStartGame);
      expect(back).toEqual(m);
    }
  });
});

describe('SOCSetSeatLock', () => {
  it('matches the Java wire string for a single seat', () => {
    expect(
      SOCSetSeatLock.forSeat('g', 2, SeatLockState.LOCKED).toCmd(),
    ).toBe('1068|g,2,true');
    expect(
      SOCSetSeatLock.forSeat('g', 0, SeatLockState.UNLOCKED).toCmd(),
    ).toBe('1068|g,0,false');
    expect(
      SOCSetSeatLock.forSeat('g', 1, SeatLockState.CLEAR_ON_RESET).toCmd(),
    ).toBe('1068|g,1,clear');
  });

  it('matches the Java wire string for all seats (4 and 6)', () => {
    const four = SOCSetSeatLock.forAllSeats('g', [
      SeatLockState.UNLOCKED,
      SeatLockState.LOCKED,
      SeatLockState.CLEAR_ON_RESET,
      SeatLockState.UNLOCKED,
    ]);
    expect(four.toCmd()).toBe('1068|g,false,true,clear,false');

    const six = SOCSetSeatLock.forAllSeats('g', [
      SeatLockState.LOCKED,
      SeatLockState.LOCKED,
      SeatLockState.UNLOCKED,
      SeatLockState.UNLOCKED,
      SeatLockState.CLEAR_ON_RESET,
      SeatLockState.LOCKED,
    ]);
    expect(six.toCmd()).toBe('1068|g,true,true,false,false,clear,true');
  });

  it('throws when all-seats length is not 4 or 6', () => {
    expect(() =>
      SOCSetSeatLock.forAllSeats('g', [SeatLockState.LOCKED]),
    ).toThrow();
  });

  it('decodes the single-seat form (player number => digit branch)', () => {
    const m = decode('1068|g,2,true') as SOCSetSeatLock;
    expect(m.playerNumber).toBe(2);
    expect(m.state).toBe(SeatLockState.LOCKED);
    expect(m.states).toBeNull();
  });

  it('decodes the all-seats form (non-digit => states branch)', () => {
    const m = decode('1068|g,false,true,clear,false') as SOCSetSeatLock;
    expect(m.playerNumber).toBe(-1);
    expect(m.state).toBeNull();
    expect(m.states).toEqual([
      SeatLockState.UNLOCKED,
      SeatLockState.LOCKED,
      SeatLockState.CLEAR_ON_RESET,
      SeatLockState.UNLOCKED,
    ]);
  });

  it('returns null for an all-seats count that is not 4 or 6', () => {
    expect(decode('1068|g,true,false,clear')).toBeNull();
  });

  it('returns null for an unrecognized lock-state string', () => {
    expect(decode('1068|g,2,maybe')).toBeNull();
  });

  it('round-trips both forms', () => {
    const cases = [
      SOCSetSeatLock.forSeat('g', 3, SeatLockState.CLEAR_ON_RESET),
      SOCSetSeatLock.forAllSeats('g', [
        SeatLockState.LOCKED,
        SeatLockState.UNLOCKED,
        SeatLockState.CLEAR_ON_RESET,
        SeatLockState.LOCKED,
      ]),
    ];
    for (const m of cases) {
      const back = decode(encode(m)) as SOCSetSeatLock;
      expect(back).toBeInstanceOf(SOCSetSeatLock);
      expect(back.toCmd()).toBe(m.toCmd());
    }
  });
});

describe('SOCLeaveGame', () => {
  it('matches the Java wire string', () => {
    expect(new SOCLeaveGame('bob', '-', 'mygame').toCmd()).toBe(
      '1011|bob,-,mygame',
    );
  });

  it('decodes the 3 fields', () => {
    const m = decode('1011|bob,-,mygame') as SOCLeaveGame;
    expect(m.nickname).toBe('bob');
    expect(m.host).toBe('-');
    expect(m.game).toBe('mygame');
  });

  it('returns null with fewer than 3 fields', () => {
    expect(decode('1011|bob,-')).toBeNull();
  });

  it('round-trips', () => {
    const m = new SOCLeaveGame('bob', '-', 'mygame');
    expect(decode(encode(m))).toEqual(m);
  });
});

describe('SOCGameMembers', () => {
  it('matches the Java wire string', () => {
    expect(
      new SOCGameMembers('ga', ['player0', 'droid 1', 'debug']).toCmd(),
    ).toBe('1017|ga,player0,droid 1,debug');
  });

  it('serializes an empty member list as just the game name', () => {
    expect(new SOCGameMembers('ga', []).toCmd()).toBe('1017|ga');
  });

  it('decodes the game + members', () => {
    const m = decode('1017|ga,player0,droid 1,debug') as SOCGameMembers;
    expect(m.game).toBe('ga');
    expect(m.members).toEqual(['player0', 'droid 1', 'debug']);
  });

  it('round-trips (incl empty)', () => {
    for (const m of [
      new SOCGameMembers('ga', ['a', 'b']),
      new SOCGameMembers('ga', []),
    ]) {
      const back = decode(encode(m)) as SOCGameMembers;
      expect(back).toBeInstanceOf(SOCGameMembers);
      expect(back).toEqual(m);
    }
  });
});

describe('SOCNewGameWithOptionsRequest', () => {
  // Verified against the real Java class:
  //   toCmd("myname","","\t","mygame","BC=t4,PL=4,VP=t13")
  //     -> 1078|myname,<TAB>,<TAB>,mygame,BC=t4,PL=4,VP=t13
  //   parsed optsStr keeps a leading "," (StringTokenizer artifact), so
  //   re-encode is 1078|myname,<TAB>,<TAB>,mygame,,BC=t4,PL=4,VP=t13.

  it('matches the Java outgoing wire string (clean optsStr, empty pw->EMPTYSTR)', () => {
    const m = new SOCNewGameWithOptionsRequest(
      'myname',
      '',
      '\t',
      'mygame',
      'BC=t4,PL=4,VP=t13',
    );
    expect(m.toCmd()).toBe('1078|myname,\t,\t,mygame,BC=t4,PL=4,VP=t13');
  });

  it('matches the Java no-options outgoing wire string', () => {
    const m = new SOCNewGameWithOptionsRequest(
      'myname',
      '',
      '\t',
      'mygame',
      '-',
    );
    expect(m.toCmd()).toBe('1078|myname,\t,\t,mygame,-');
  });

  it('decodes and keeps the leading comma on optsStr (Java parity)', () => {
    const m = decode(
      '1078|myname,\t,\t,mygame,BC=t4,PL=4,VP=t13',
    ) as SOCNewGameWithOptionsRequest;
    expect(m.nickname).toBe('myname');
    expect(m.password).toBe(''); // EMPTYSTR -> ""
    expect(m.host).toBe('\t');
    expect(m.game).toBe('mygame');
    expect(m.optsStr).toBe(',BC=t4,PL=4,VP=t13'); // Java: getOptionsString()
  });

  it('re-encode accumulates one leading comma per round-trip (Java parity)', () => {
    const first = decode(
      '1078|myname,\t,\t,mygame,BC=t4,PL=4',
    ) as SOCNewGameWithOptionsRequest;
    expect(first.optsStr).toBe(',BC=t4,PL=4');
    expect(encode(first)).toBe('1078|myname,\t,\t,mygame,,BC=t4,PL=4');

    const second = decode(encode(first)) as SOCNewGameWithOptionsRequest;
    expect(second.optsStr).toBe(',,BC=t4,PL=4');
  });

  it('decodes the no-options form keeping the leading comma', () => {
    const m = decode(
      '1078|myname,\t,\t,mygame,-',
    ) as SOCNewGameWithOptionsRequest;
    expect(m.optsStr).toBe(',-');
  });

  it('returns null with fewer than 5 fields', () => {
    expect(decode('1078|a,b,c,d')).toBeNull();
  });
});
