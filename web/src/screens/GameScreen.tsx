import { Panel } from '../components';
import { useGameStore } from '../store/gameStore';
import styles from './GameScreen.module.css';

/**
 * Placeholder "game started" view. A later phase builds the SVG board and the
 * full in-game UI here; for now it confirms the game started and summarizes the
 * seated players and the local player's seat. Shown by {@link Root} when the
 * joined game's state has advanced past NEW (setup/play has begun).
 */
export function GameScreen(): JSX.Element | null {
  const cg = useGameStore((s) => s.currentGame);
  if (cg === null) {
    return null; // <--- Early return: no joined game ---
  }

  const seated = cg.players
    .map((p, seat) => ({ p, seat }))
    .filter((e) => e.p !== null);

  return (
    <div className={styles.wrap} data-testid="game-started">
      <h2 className={styles.title}>{cg.gameName} — game started</h2>
      <p className={styles.seatLine} data-testid="game-started-seat">
        {cg.mySeat >= 0
          ? `You are seated at seat ${cg.mySeat + 1}.`
          : 'You are observing this game.'}
      </p>

      <Panel title={`Players (${seated.length})`} flushBody>
        <ul className={styles.players} data-testid="game-started-players">
          {seated.map(({ p, seat }) => (
            <li
              key={seat}
              className={styles.player}
              data-testid={`game-started-player-${seat}`}
              data-robot={p !== null && p.isRobot ? 'true' : 'false'}
            >
              <span className={styles.seatNum}>Seat {seat + 1}</span>
              <span className={styles.playerName}>
                {p !== null ? p.name : ''}
                {p !== null && p.isRobot && (
                  <span className={styles.botTag}> (bot)</span>
                )}
                {cg.mySeat === seat && (
                  <span className={styles.youTag}> (you)</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <p className={styles.note}>
        The board and turn UI arrive in a later phase.
      </p>
    </div>
  );
}
