import { isGameStarted, useGameStore } from '../store/gameStore';
import { useUiStore } from '../store/uiStore';
import { ConnectScreen } from './ConnectScreen';
import { DisconnectOverlay } from './DisconnectOverlay';
import { GameRoom } from './GameRoom';
import { GameScreen } from './GameScreen';
import { LobbyScreen } from './LobbyScreen';
import { MapEditorScreen } from './MapEditorScreen';

/**
 * Top-level router. Picks the screen based on the connection status and the
 * joined-game room state:
 *   * not connected                       -> ConnectScreen (connecting/error too)
 *   * dropped (disconnected/error) while a game is joined
 *                                         -> the stale game view + a modal
 *                                            "Connection lost" overlay
 *   * connected, no game joined           -> LobbyScreen (version + game list)
 *   * connected, joined, not yet started  -> GameRoom (seats, sit/lock/start)
 *   * connected, joined, started          -> GameScreen (placeholder board view)
 *
 * The "connecting" and "error" states stay on ConnectScreen so the user can see
 * progress / retry; only a fully-established connection advances further.
 */
export function Root(): JSX.Element {
  const status = useGameStore((s) => s.status);
  const currentGame = useGameStore((s) => s.currentGame);
  const appView = useUiStore((s) => s.appView);

  // The map editor is a standalone tool, reachable regardless of connection.
  if (appView === 'mapEditor') {
    return <MapEditorScreen />;
  }

  if (status !== 'connected') {
    // The socket dropped while we were in a game: keep the (stale) game view
    // underneath and show the "Connection lost" overlay with Reconnect / back.
    // (A reconnect attempt resets the lobby first, clearing currentGame, so the
    // 'connecting' state falls through to ConnectScreen as before.)
    if (currentGame !== null && (status === 'disconnected' || status === 'error')) {
      return (
        <>
          {isGameStarted(currentGame) ? <GameScreen /> : <GameRoom />}
          <DisconnectOverlay />
        </>
      );
    }
    return <ConnectScreen />;
  }
  if (currentGame === null) {
    return <LobbyScreen />;
  }
  if (isGameStarted(currentGame)) {
    return <GameScreen />;
  }
  return <GameRoom />;
}
