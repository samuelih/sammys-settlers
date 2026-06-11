import { useState } from 'react';

import { Button, Panel } from '../components';
import { DEFAULT_HOST, DEFAULT_PORT } from '../net/GameConnection';
import { connectStore, useGameStore } from '../store/gameStore';
import styles from './ConnectScreen.module.css';

/**
 * Connection screen: host/port inputs and a Connect button. On submit it kicks
 * off connectStore(), which creates the GameConnection and wires it to the
 * store. Status/errors come straight from the store so the UI reflects the
 * live connection lifecycle (connecting -> connected, or error).
 */
export function ConnectScreen(): JSX.Element {
  const status = useGameStore((s) => s.status);
  const error = useGameStore((s) => s.error);

  const [host, setHost] = useState(DEFAULT_HOST);
  const [port, setPort] = useState(String(DEFAULT_PORT));

  const connecting = status === 'connecting';

  const onConnect = (): void => {
    const portNum = Number.parseInt(port, 10);
    connectStore(host.trim() || DEFAULT_HOST, Number.isInteger(portNum) ? portNum : DEFAULT_PORT);
  };

  const onSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    onConnect();
  };

  return (
    <div className={styles.wrap} data-testid="connect-screen">
      <Panel title="Connect to server" className={styles.panel}>
        <form className={styles.form} onSubmit={onSubmit}>
          <label className={styles.field}>
            <span className={styles.label}>Host</span>
            <input
              className={styles.input}
              type="text"
              name="host"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              data-testid="host-input"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Port</span>
            <input
              className={styles.input}
              type="text"
              inputMode="numeric"
              name="port"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              data-testid="port-input"
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <Button
            type="submit"
            variant="primary"
            disabled={connecting}
            data-testid="connect-button"
          >
            {connecting ? 'Connecting…' : 'Connect'}
          </Button>
        </form>

        <p className={styles.status} data-testid="connect-status" role="status">
          {statusText(status)}
        </p>
        {error != null && error !== '' && (
          <p className={styles.error} data-testid="connect-error" role="alert">
            {error}
          </p>
        )}
      </Panel>
    </div>
  );
}

/** Human-readable label for a connection status. */
function statusText(status: string): string {
  switch (status) {
    case 'connecting':
      return 'Connecting to server…';
    case 'connected':
      return 'Connected.';
    case 'error':
      return 'Connection error.';
    default:
      return 'Not connected.';
  }
}
