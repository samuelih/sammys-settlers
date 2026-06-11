import { useEffect, useMemo, useState } from 'react';

import { Button, Panel, useToast } from '../components';
import { NewGameDialog, type NewGameScenario } from '../components/newgame';
import type { GameOptionDescriptor } from '../protocol';
import {
  createGame,
  joinGame as joinGameAction,
  requestGameOptions,
  useGameStore,
} from '../store/gameStore';
import styles from './LobbyScreen.module.css';

/**
 * Build the ordered list of option descriptors to show in the New Game dialog
 * from the known-options registry. Internal / hidden options (keys starting
 * with "_") are filtered out, matching the Swing client's New Game UI which
 * only shows user-facing options.
 */
function dialogOptions(
  known: Record<string, GameOptionDescriptor>,
): GameOptionDescriptor[] {
  return Object.values(known)
    .filter(
      (o) =>
        !o.key.startsWith('_') &&
        o.key !== 'SC' &&
        // The server returns type UNKNOWN for options whose descriptors are
        // unchanged since this client version (it only sends localized desc
        // text). Such options can't be rendered/serialized, so skip them.
        o.optType !== 'unknown',
    )
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/**
 * Lobby screen: shows the server version and the current list of games, a
 * "New Game" button that opens the {@link NewGameDialog} (populated from the
 * option registry), and a Join control per game. Creating/joining a game sends
 * the matching protocol message; the store advances to the game room once the
 * server replies with SOCJoinGameAuth.
 */
export function LobbyScreen(): JSX.Element {
  const serverVersion = useGameStore((s) => s.serverVersion);
  const serverVersionStr = useGameStore((s) => s.serverVersionStr);
  const games = useGameStore((s) => s.games);
  const knownOptions = useGameStore((s) => s.knownOptions);
  const scenarios = useGameStore((s) => s.scenarios);
  const nickname = useGameStore((s) => s.nickname);
  const error = useGameStore((s) => s.error);
  const setError = useGameStore((s) => s.setError);
  const { showToast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);

  // Surface server-side rejections received while in the lobby (SOCStatusMessage
  // non-OK svalues: name-in-use, new-game already exists / name rejected / too
  // many created, unknown/too-new option, etc.). The store captures the text in
  // `error`; show it once as a toast, then clear it so it doesn't persist or
  // re-fire. Without this a name collision on create is a silent dead end (no
  // JOINGAMEAUTH arrives, so the lobby never advances).
  useEffect(() => {
    if (error != null && error !== '') {
      showToast(error, { variant: 'danger' });
      setError(undefined);
    }
  }, [error, showToast, setError]);

  const versionLabel =
    serverVersionStr != null
      ? serverVersionStr
      : serverVersion != null
        ? String(serverVersion)
        : 'unknown';

  const optionList = useMemo(() => dialogOptions(knownOptions), [knownOptions]);
  const scenarioList = useMemo<NewGameScenario[]>(() => {
    const list: NewGameScenario[] = [{ key: '', desc: 'No scenario' }];
    for (const sc of Object.values(scenarios)) {
      list.push({ key: sc.key, desc: sc.title });
    }
    return list;
  }, [scenarios]);

  const openDialog = (): void => {
    // Lazily fetch option descriptors the first time the dialog opens.
    requestGameOptions();
    setDialogOpen(true);
  };

  const handleCreate = (
    name: string,
    nick: string,
    chosen: GameOptionDescriptor[],
    scenarioKey?: string,
  ): void => {
    if (name === '') {
      showToast('Enter a game name.', { variant: 'warning' });
      return;
    }
    createGame(name, nick, chosen, scenarioKey);
    setDialogOpen(false);
    showToast(`Creating game "${name}"…`, { variant: 'info' });
  };

  const handleJoin = (gameName: string): void => {
    joinGameAction(gameName, nickname);
  };

  return (
    <div className={styles.wrap} data-testid="lobby-screen">
      <div className={styles.toolbar}>
        <p className={styles.serverLine}>
          Server version:{' '}
          <span className={styles.version} data-testid="server-version">
            {versionLabel}
          </span>
        </p>
        <Button
          variant="primary"
          onClick={openDialog}
          data-testid="new-game-button"
        >
          New Game
        </Button>
      </div>

      <Panel title={`Games (${games.length})`} flushBody>
        {games.length === 0 ? (
          <p className={styles.empty} data-testid="game-list-empty">
            No games yet. Create one to get started.
          </p>
        ) : (
          <ul className={styles.list} data-testid="game-list">
            {games.map((g) => (
              <li key={g.name} className={styles.item} data-testid="game-item">
                <span className={styles.name} data-testid="game-item-name">
                  {g.name}
                </span>
                {g.options !== '' && (
                  <span className={styles.options} data-testid="game-options">
                    {g.options}
                  </span>
                )}
                {g.started ? (
                  <span className={styles.started} data-testid="game-started">
                    in progress
                  </span>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    className={styles.joinButton}
                    onClick={() => handleJoin(g.name)}
                    data-testid={`join-${g.name}`}
                  >
                    Join
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {dialogOpen && (
        <NewGameDialog
          open={dialogOpen}
          options={optionList}
          scenarios={scenarioList.length > 1 ? scenarioList : undefined}
          onCreate={handleCreate}
          onCancel={() => setDialogOpen(false)}
        />
      )}
    </div>
  );
}
