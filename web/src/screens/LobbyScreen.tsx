import { Panel } from '../components';
import { useGameStore } from '../store/gameStore';
import styles from './LobbyScreen.module.css';

/**
 * Lobby screen: shows the server version and the current list of games. Joining
 * and creating games is a later phase — this screen only renders the live list
 * the server pushes (NEWGAME/DELETEGAME/GAMESWITHOPTIONS update the store).
 */
export function LobbyScreen(): JSX.Element {
  const serverVersion = useGameStore((s) => s.serverVersion);
  const serverVersionStr = useGameStore((s) => s.serverVersionStr);
  const games = useGameStore((s) => s.games);

  const versionLabel =
    serverVersionStr != null
      ? serverVersionStr
      : serverVersion != null
        ? String(serverVersion)
        : 'unknown';

  return (
    <div className={styles.wrap} data-testid="lobby-screen">
      <p className={styles.serverLine}>
        Server version:{' '}
        <span className={styles.version} data-testid="server-version">
          {versionLabel}
        </span>
      </p>

      <Panel title={`Games (${games.length})`} flushBody>
        {games.length === 0 ? (
          <p className={styles.empty} data-testid="game-list-empty">
            No games yet. Create one to get started.
          </p>
        ) : (
          <ul className={styles.list} data-testid="game-list">
            {games.map((g) => (
              <li key={g.name} className={styles.item} data-testid="game-item">
                <span className={styles.name}>{g.name}</span>
                {g.options !== '' && (
                  <span className={styles.options} data-testid="game-options">
                    {g.options}
                  </span>
                )}
                {g.started && (
                  <span className={styles.started} data-testid="game-started">
                    in progress
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
