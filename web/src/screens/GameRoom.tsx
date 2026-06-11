import { useEffect, useState } from 'react';

import { Button, Panel, useToast } from '../components';
import { SeatLockState } from '../protocol';
import type { CurrentGame } from '../store/gameStore';
import {
  leaveGame,
  setSeatLock,
  sitDown,
  startGame,
  useGameStore,
} from '../store/gameStore';
import styles from './GameRoom.module.css';

/**
 * One seat row in the game room. Shows the occupant (player or bot) or an
 * empty seat with a "Sit" button, plus a lock toggle that prevents a bot from
 * filling that seat when the game starts.
 */
function Seat({
  cg,
  seat,
}: {
  cg: CurrentGame;
  seat: number;
}): JSX.Element {
  const occupant = cg.players[seat];
  const lock = cg.seatLocks[seat];
  const locked = lock === SeatLockState.LOCKED;
  const isMine = cg.mySeat === seat;
  const canSit = occupant === null && cg.mySeat === -1;

  const onSit = (): void => sitDown(seat);
  const onToggleLock = (): void =>
    setSeatLock(
      seat,
      locked ? SeatLockState.UNLOCKED : SeatLockState.LOCKED,
    );

  return (
    <li
      className={`${styles.seat} ${isMine ? styles.seatMine : ''}`}
      data-testid={`seat-${seat}`}
      data-occupied={occupant !== null ? 'true' : 'false'}
    >
      <span className={styles.seatNum} data-color={`p${seat}`}>
        {seat + 1}
      </span>

      {occupant !== null ? (
        <span
          className={styles.occupant}
          data-testid={`seat-occupant-${seat}`}
          data-robot={occupant.isRobot ? 'true' : 'false'}
        >
          {occupant.name}
          {occupant.isRobot && <span className={styles.botTag}> (bot)</span>}
          {isMine && <span className={styles.youTag}> (you)</span>}
        </span>
      ) : (
        <span className={styles.empty} data-testid={`seat-empty-${seat}`}>
          Empty seat
        </span>
      )}

      <span className={styles.seatActions}>
        {occupant === null && canSit && (
          <Button
            variant="primary"
            size="sm"
            onClick={onSit}
            data-testid={`sit-${seat}`}
          >
            Sit
          </Button>
        )}
        {occupant === null && (
          <Button
            variant={locked ? 'danger' : 'ghost'}
            size="sm"
            onClick={onToggleLock}
            aria-pressed={locked}
            data-testid={`lock-${seat}`}
          >
            {locked ? 'Locked' : 'Lock'}
          </Button>
        )}
      </span>
    </li>
  );
}

/**
 * Game room for a joined-but-not-started game. Renders one seat per player,
 * lets the local client sit, lock/unlock vacant seats, start the game, or
 * leave. Once started, {@link Root} swaps this for the started view.
 *
 * The "practice vs bots" path: create a 4-player game, click Sit on seat 0,
 * leave the other seats unlocked, then Start — the server fills the three
 * unlocked empty seats with bots.
 */
export function GameRoom(): JSX.Element | null {
  const cg = useGameStore((s) => s.currentGame);
  const error = useGameStore((s) => s.error);
  const setError = useGameStore((s) => s.setError);
  const { showToast } = useToast();

  // Pending state after clicking Start: the button shows "Starting game…" until
  // the server's start broadcast advances the game state (Root then swaps to
  // the started view and unmounts this room).
  const [starting, setStarting] = useState(false);

  // Surface server-side rejections received while in the room (e.g. SOCStatusMessage
  // non-OK svalues from a sit/start request). Show once, then clear so it does not
  // persist or re-fire. A rejection also ends the Start pending state so the
  // button is usable again. Hooks must run before the early return below.
  useEffect(() => {
    if (error != null && error !== '') {
      showToast(error, { variant: 'danger' });
      setError(undefined);
      setStarting(false);
    }
  }, [error, showToast, setError]);

  if (cg === null) {
    return null; // <--- Early return: no joined game ---
  }

  const seated = cg.players.filter((p) => p !== null);
  const humans = seated.filter((p) => p !== null && !p.isRobot).length;
  const bots = seated.filter((p) => p !== null && p.isRobot).length;
  const iAmSeated = cg.mySeat >= 0;

  const onStart = (): void => {
    setStarting(true);
    startGame();
  };
  const onLeave = (): void => leaveGame();

  return (
    <div className={styles.wrap} data-testid="game-room">
      <div className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.eyebrow}>Game room</span>
          <h2 className={styles.title} data-testid="game-room-name">
            {cg.gameName}
          </h2>
          <p className={styles.summary} data-testid="game-room-summary">
            {humans} player{humans === 1 ? '' : 's'}, {bots} bot
            {bots === 1 ? '' : 's'} · {cg.maxPlayers} seats
            {cg.options !== '' && (
              <>
                {' · '}
                <span className={styles.options} data-testid="game-room-options">
                  {cg.options}
                </span>
              </>
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className={styles.leave}
          onClick={onLeave}
          data-testid="leave-game"
        >
          Leave
        </Button>
      </div>

      <Panel title="Seats" flushBody>
        <ul className={styles.seats} data-testid="seat-list">
          {cg.players.map((_, seat) => (
            <Seat key={seat} cg={cg} seat={seat} />
          ))}
        </ul>
      </Panel>

      <div className={styles.actions}>
        <Button
          variant="primary"
          size="lg"
          onClick={onStart}
          disabled={!iAmSeated || starting}
          data-pending={starting ? 'true' : 'false'}
          data-testid="start-game"
        >
          {starting ? 'Starting game…' : 'Start game'}
        </Button>
        {!iAmSeated && (
          <span className={styles.hint} data-testid="start-hint">
            Sit down at a seat to start the game.
          </span>
        )}
      </div>
    </div>
  );
}
