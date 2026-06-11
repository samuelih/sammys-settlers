import { useGameStore } from '../store/gameStore';
import { ConnectScreen } from './ConnectScreen';
import { LobbyScreen } from './LobbyScreen';

/**
 * Top-level router. Picks the screen based on the connection status:
 *   * connected            -> LobbyScreen (server version + game list)
 *   * otherwise (disconnected / connecting / error) -> ConnectScreen
 *
 * The "connecting" and "error" states stay on ConnectScreen so the user can see
 * progress / retry; only a fully-established connection advances to the lobby.
 */
export function Root(): JSX.Element {
  const status = useGameStore((s) => s.status);

  if (status === 'connected') {
    return <LobbyScreen />;
  }
  return <ConnectScreen />;
}
