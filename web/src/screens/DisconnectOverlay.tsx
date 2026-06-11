import { Button, Dialog } from '../components';
import { reconnectStore, useGameStore } from '../store/gameStore';
import styles from './DisconnectOverlay.module.css';

/**
 * Modal overlay shown when the WebSocket drops (status 'disconnected'/'error')
 * while a game is joined. Offers:
 *   * Reconnect — re-runs the connection with the saved host/port (and the
 *     nickname kept in the store). On success the user lands back in the lobby;
 *     rejoining the interrupted game is out of scope.
 *   * Back to connect screen — abandons the stale game room so the Root router
 *     falls through to the ConnectScreen.
 *
 * Rendered by {@link Root} on top of the (stale) in-game view; it cannot be
 * dismissed except via its two actions.
 */
export function DisconnectOverlay(): JSX.Element | null {
  const cg = useGameStore((s) => s.currentGame);
  const error = useGameStore((s) => s.error);

  if (cg === null) {
    return null; // <--- Early return: no joined game to be cut off from ---
  }

  const onReconnect = (): void => {
    // connectStore() resets the lobby (clearing the stale game) and reconnects
    // to the saved host/port; the nickname survives in the store.
    reconnectStore();
  };

  const onBack = (): void => {
    // Drop the stale game so Root falls through to the ConnectScreen.
    useGameStore.getState().clearCurrentGame(cg.gameName);
  };

  const footer = (
    <>
      <Button variant="ghost" onClick={onBack} data-testid="back-to-connect">
        Back to connect screen
      </Button>
      <Button variant="primary" onClick={onReconnect} data-testid="reconnect-button">
        Reconnect
      </Button>
    </>
  );

  return (
    <Dialog
      open
      onClose={() => undefined}
      hideCloseButton
      closeOnOverlayClick={false}
      title="Connection lost"
      footer={footer}
    >
      <div className={styles.body} data-testid="disconnect-overlay">
        <p className={styles.text}>
          The connection to the server was lost while you were in{' '}
          <strong>{cg.gameName}</strong>.
        </p>
        {error != null && error !== '' && <p className={styles.detail}>{error}</p>}
        <p className={styles.text}>
          You can reconnect to the server (you&apos;ll return to the lobby) or go
          back to the connect screen.
        </p>
      </div>
    </Dialog>
  );
}
