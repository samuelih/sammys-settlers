// Tests for the mid-game disconnect flow: when the WebSocket drops (status
// 'disconnected' / 'error') while a game is joined, Root keeps the (stale) game
// view and shows the "Connection lost" overlay with a Reconnect button (re-runs
// the connection against the saved host/port) and a "Back to connect screen"
// button (abandons the stale game so the connect screen shows).

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ToastProvider } from '../components';
import { SEP, SEP2 } from '../protocol';
import { connectStore, disconnectStore, useGameStore } from '../store/gameStore';
import { Root } from './Root';

const GAME = 'sea';

/** A controllable mock WebSocket installed as the global for connectStore(). */
class MockGlobalWS {
  static instances: MockGlobalWS[] = [];
  sent: string[] = [];
  readyState = 1;
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;

  constructor(readonly url: string) {
    MockGlobalWS.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.({});
  }

  open(): void {
    this.onopen?.({});
  }

  receive(raw: string): void {
    this.onmessage?.({ data: raw });
  }

  /** Simulate the server dropping the connection (not a caller-initiated close). */
  drop(): void {
    this.readyState = 3;
    this.onclose?.({});
  }
}

const originalWS = globalThis.WebSocket;

beforeEach(() => {
  MockGlobalWS.instances = [];
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = MockGlobalWS as unknown;
});

afterEach(() => {
  // disconnectStore updates the store while the tree may still be mounted
  // (RTL cleanup runs after this hook), so wrap it in act().
  act(() => {
    disconnectStore();
  });
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = originalWS;
});

function renderRoot(): void {
  render(
    <ToastProvider>
      <Root />
    </ToastProvider>,
  );
}

/** Connect (saving host/port), handshake, and seed a started joined game. */
function connectAndSeedStartedGame(host = 'localhost', port = 8888): MockGlobalWS {
  connectStore(host, port);
  const ws = MockGlobalWS.instances[MockGlobalWS.instances.length - 1];
  ws.open();
  ws.receive(`9998${SEP}2700${SEP2}2.7.00${SEP2}srv${SEP2}${SEP2}en_US`);
  const s = useGameStore.getState();
  s.setNickname('WebPlayer');
  s.joinGameAuth(GAME);
  s.applySitDown(GAME, 0, 'WebPlayer', false);
  s.setGameState(GAME, 15); // ROLL_OR_CARD: started
  return ws;
}

describe('DisconnectOverlay', () => {
  it('renders when the connection drops while a game is in progress', () => {
    const ws = connectAndSeedStartedGame();
    renderRoot();

    // Connected + started: in-game view, no overlay.
    expect(screen.getByTestId('game-started')).toBeInTheDocument();
    expect(screen.queryByTestId('disconnect-overlay')).not.toBeInTheDocument();

    // Server drops the socket -> status 'disconnected' with the game intact.
    act(() => {
      ws.drop();
    });

    expect(useGameStore.getState().status).toBe('disconnected');
    expect(screen.getByTestId('disconnect-overlay')).toBeInTheDocument();
    expect(screen.getByText('Connection lost')).toBeInTheDocument();
    expect(screen.getByTestId('reconnect-button')).toBeInTheDocument();
    expect(screen.getByTestId('back-to-connect')).toBeInTheDocument();
  });

  it('does not render while connected, nor when no game is joined', () => {
    const ws = connectAndSeedStartedGame();
    renderRoot();
    expect(screen.queryByTestId('disconnect-overlay')).not.toBeInTheDocument();

    // Drop with no joined game -> plain connect screen, no overlay.
    act(() => {
      useGameStore.getState().clearCurrentGame(GAME);
      ws.drop();
    });
    expect(screen.queryByTestId('disconnect-overlay')).not.toBeInTheDocument();
    expect(screen.getByTestId('connect-screen')).toBeInTheDocument();
  });

  it('Reconnect re-runs connect against the saved host/port and clears the stale game', async () => {
    const user = userEvent.setup();
    const ws = connectAndSeedStartedGame('example.test', 9999);
    renderRoot();

    act(() => {
      ws.drop();
    });
    expect(screen.getByTestId('disconnect-overlay')).toBeInTheDocument();

    await user.click(screen.getByTestId('reconnect-button'));

    // A fresh socket targets the saved address; the stale game was reset so a
    // successful reconnect lands in the lobby (not back in the dead game).
    const fresh = MockGlobalWS.instances[MockGlobalWS.instances.length - 1];
    expect(fresh).not.toBe(ws);
    expect(fresh.url).toBe('ws://example.test:9999');
    expect(useGameStore.getState().status).toBe('connecting');
    expect(useGameStore.getState().currentGame).toBeNull();
    // The nickname survives for the reconnected session.
    expect(useGameStore.getState().nickname).toBe('WebPlayer');

    // Completing the handshake lands on the lobby screen.
    act(() => {
      fresh.open();
      fresh.receive(`9998${SEP}2700${SEP2}2.7.00${SEP2}srv${SEP2}${SEP2}en_US`);
    });
    expect(screen.getByTestId('lobby-screen')).toBeInTheDocument();
  });

  it('"Back to connect screen" abandons the stale game and shows the connect screen', async () => {
    const user = userEvent.setup();
    const ws = connectAndSeedStartedGame();
    renderRoot();

    act(() => {
      ws.drop();
    });
    await user.click(screen.getByTestId('back-to-connect'));

    expect(useGameStore.getState().currentGame).toBeNull();
    expect(screen.queryByTestId('disconnect-overlay')).not.toBeInTheDocument();
    expect(screen.getByTestId('connect-screen')).toBeInTheDocument();
  });
});
