// Tests for the GameRoom's Start-game pending state: after clicking Start, the
// button shows "Starting game…" and is disabled until the server's start
// broadcast advances the game (Root then swaps screens), and a server-side
// rejection (store error -> toast) re-enables it.

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { ToastProvider } from '../components';
import { useGameStore } from '../store/gameStore';
import { GameRoom } from './GameRoom';

const GAME = 'cap';

function renderRoom(): void {
  render(
    <ToastProvider>
      <GameRoom />
    </ToastProvider>,
  );
}

beforeEach(() => {
  const s = useGameStore.getState();
  s.setStatus('connected');
  s.resetLobby();
  s.setNickname('WebPlayer');
  s.joinGameAuth(GAME);
  s.applySitDown(GAME, 0, 'WebPlayer', false);
});

describe('GameRoom start pending state', () => {
  it('shows "Starting game…" and disables the button after clicking Start', async () => {
    const user = userEvent.setup();
    renderRoom();

    const start = screen.getByTestId('start-game');
    expect(start).toBeEnabled();
    expect(start).toHaveTextContent('Start game');

    await user.click(start);

    expect(start).toBeDisabled();
    expect(start).toHaveTextContent('Starting game…');
    expect(start).toHaveAttribute('data-pending', 'true');
  });

  it('re-enables Start when the server rejects the request (error toast)', async () => {
    const user = userEvent.setup();
    renderRoom();

    await user.click(screen.getByTestId('start-game'));
    expect(screen.getByTestId('start-game')).toBeDisabled();

    // A non-OK SOCStatusMessage lands in store.error; the room toasts it and
    // ends the pending state so the user can try again.
    act(() => {
      useGameStore.getState().setError('This game requires 2 players.');
    });

    await waitFor(() => {
      expect(screen.getByTestId('start-game')).toBeEnabled();
    });
    expect(screen.getByTestId('start-game')).toHaveTextContent('Start game');
  });
});
