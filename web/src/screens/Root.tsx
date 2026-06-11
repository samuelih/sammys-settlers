import { isGameStarted, useGameStore } from '../store/gameStore';
import { useUiStore } from '../store/uiStore';
import { ConnectScreen } from './ConnectScreen';
import { GameRoom } from './GameRoom';
import { GameScreen } from './GameScreen';
import { LobbyScreen } from './LobbyScreen';
import { MapEditorScreen } from './MapEditorScreen';

/**
 * Top-level router. Picks the screen based on the connection status and the
 * joined-game room state:
 *   * not connected                       -> ConnectScreen (connecting/error too)
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
