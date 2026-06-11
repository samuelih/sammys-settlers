// SOCSetSeatLock — set the lock state of one seat, or all seats at once.
// Ported from src/main/java/soc/message/SOCSetSeatLock.java, using the
// SeatLockState enum from soc.game.SOCGame.
//
// Two wire forms:
//   (1) one seat:  SETSEATLOCK SEP game SEP2 playerNumber SEP2 state
//   (2) all seats: SETSEATLOCK SEP game SEP2 state SEP2 state SEP2 state SEP2 state [SEP2 state SEP2 state]
//
// Each `state` is a back-compat string: "true" (LOCKED), "false" (UNLOCKED), or
// "clear" (CLEAR_ON_RESET). On parse, the form is distinguished by whether the
// token after `game` starts with a digit (=> player number => single-seat form).
// The all-seats form must have 4 or 6 states (game's max player count).

import {
  MessageType,
  SEP,
  SEP2,
  SeatLockState,
  SeatLockWire,
  type SeatLockStateValue,
} from '../constants';
import { registerParser, type SOCMessage } from '../SOCMessage';

/** Parse one wire token to a {@link SeatLockState}, or null if not recognized. */
function parseLockState(tok: string): SeatLockStateValue | null {
  if (tok === 'true') {
    return SeatLockState.LOCKED;
  }
  if (tok === 'false') {
    return SeatLockState.UNLOCKED;
  }
  if (tok === 'clear') {
    return SeatLockState.CLEAR_ON_RESET;
  }
  return null;
}

/**
 * Seat-lock state change for one or all seats. Mirrors Java
 * {@code SOCSetSeatLock}. Exactly one of {@link state} / {@link states} is set.
 */
export class SOCSetSeatLock implements SOCMessage {
  readonly type = MessageType.SETSEATLOCK;

  /** Name of the game. */
  readonly game: string;

  /** Single-seat form: seat number, or -1 when this is the all-seats form. */
  readonly playerNumber: number;

  /** Single-seat form: the lock state, or null when all-seats form. */
  readonly state: SeatLockStateValue | null;

  /** All-seats form: lock state per seat (length 4 or 6), or null otherwise. */
  readonly states: readonly SeatLockStateValue[] | null;

  private constructor(
    game: string,
    playerNumber: number,
    state: SeatLockStateValue | null,
    states: readonly SeatLockStateValue[] | null,
  ) {
    this.game = game;
    this.playerNumber = playerNumber;
    this.state = state;
    this.states = states;
  }

  /**
   * Create a single-seat lock-state message.
   * @param game          game name
   * @param playerNumber  seat number
   * @param state         lock state
   */
  static forSeat(
    game: string,
    playerNumber: number,
    state: SeatLockStateValue,
  ): SOCSetSeatLock {
    return new SOCSetSeatLock(game, playerNumber, state, null);
  }

  /**
   * Create an all-seats lock-state message.
   * @param game    game name
   * @param states  lock state per seat; length must be 4 or 6
   * @throws Error if states.length is not 4 or 6 (Java parity)
   */
  static forAllSeats(
    game: string,
    states: readonly SeatLockStateValue[],
  ): SOCSetSeatLock {
    if (states.length !== 4 && states.length !== 6) {
      throw new Error('length');
    }
    return new SOCSetSeatLock(game, -1, null, states);
  }

  toCmd(): string {
    if (this.states === null) {
      // Single-seat form. state is non-null in this branch.
      const st = SeatLockWire[this.state as SeatLockStateValue];
      return (
        `${MessageType.SETSEATLOCK}${SEP}${this.game}` +
        `${SEP2}${this.playerNumber}${SEP2}${st}`
      );
    }
    // All-seats form.
    let cmd = `${MessageType.SETSEATLOCK}${SEP}${this.game}`;
    for (const st of this.states) {
      cmd += `${SEP2}${SeatLockWire[st]}`;
    }
    return cmd;
  }

  /**
   * Parse the data portion. Mirrors Java's parseDataStr: distinguishes the two
   * forms by whether the token after `game` starts with a digit.
   *
   * @returns the parsed message, or null if garbled
   */
  static parse(params: string): SOCSetSeatLock | null {
    const tok = params.split(SEP2).filter((t) => t.length > 0);
    if (tok.length < 2) {
      return null;
    }
    const game = tok[0];
    const first = tok[1];

    // Java: Character.isDigit(tok.charAt(0)) -> single-seat (player number) form.
    if (first.length > 0 && first[0] >= '0' && first[0] <= '9') {
      if (tok.length < 3) {
        return null;
      }
      if (!/^[+-]?\d+$/.test(first)) {
        return null;
      }
      const pn = Number.parseInt(first, 10);
      const ls = parseLockState(tok[2]);
      if (ls === null) {
        return null;
      }
      return SOCSetSeatLock.forSeat(game, pn, ls);
    }

    // All-seats form: tok[1..] are states; count must be 4 or 6.
    const stateToks = tok.slice(1);
    const np = stateToks.length;
    if (np !== 4 && np !== 6) {
      return null;
    }
    const sls: SeatLockStateValue[] = [];
    for (const t of stateToks) {
      const ls = parseLockState(t);
      if (ls === null) {
        return null;
      }
      sls.push(ls);
    }
    return SOCSetSeatLock.forAllSeats(game, sls);
  }
}

registerParser(MessageType.SETSEATLOCK, SOCSetSeatLock.parse);
