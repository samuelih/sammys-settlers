// Tests for LobbyScreen's surfacing of server-side rejections. A non-OK
// SOCStatusMessage received while in the lobby (e.g. SV_NAME_IN_USE on a name
// collision when creating a game) is captured by the store as `error`; the
// lobby must show it once as a toast and then clear it so it doesn't persist or
// re-fire. Without this the user sees a silent dead end.

import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ToastProvider } from '../components';
import { useGameStore } from '../store/gameStore';
import { LobbyScreen } from './LobbyScreen';

function renderLobby(): void {
  render(
    <ToastProvider>
      <LobbyScreen />
    </ToastProvider>,
  );
}

beforeEach(() => {
  const s = useGameStore.getState();
  s.setStatus('disconnected');
  s.resetLobby();
  s.setNickname('WebPlayer');
});

afterEach(() => {
  useGameStore.getState().setError(undefined);
});

describe('LobbyScreen error surfacing', () => {
  it('shows a non-OK SOCStatusMessage error as a toast and clears it', async () => {
    renderLobby();
    expect(useGameStore.getState().error).toBeUndefined();

    act(() => {
      // The store sets `error` for any non-OK status value (e.g. SV_NAME_IN_USE).
      useGameStore.getState().setError('Someone with that nickname is already logged in.');
    });

    // The text appears in a toast (live region role="status").
    expect(
      await screen.findByText(
        'Someone with that nickname is already logged in.',
      ),
    ).toBeInTheDocument();

    // …and the store error is cleared so it doesn't persist / re-fire.
    await waitFor(() => {
      expect(useGameStore.getState().error).toBeUndefined();
    });
  });

  it('does not toast when there is no error', () => {
    // Mark the game list as loaded first: the loading row's Spinner also has
    // role="status" and would shadow this no-toast assertion.
    act(() => {
      useGameStore.getState().setGames([]);
    });
    renderLobby();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('LobbyScreen game-list loading state', () => {
  it('shows a loading row until the initial game list arrives', () => {
    renderLobby();
    // resetLobby leaves gamesLoaded false: no list yet, just the loading row.
    expect(screen.getByTestId('game-list-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('game-list-empty')).not.toBeInTheDocument();

    // The initial (empty) GAMESWITHOPTIONS arrives -> loading row is replaced
    // by the regular empty state.
    act(() => {
      useGameStore.getState().setGames([]);
    });
    expect(screen.queryByTestId('game-list-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('game-list-empty')).toBeInTheDocument();
  });

  it('shows the populated list once games arrive', () => {
    renderLobby();
    act(() => {
      useGameStore.getState().setGames([{ name: 'g1', options: '', started: false }]);
    });
    expect(screen.queryByTestId('game-list-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('game-list')).toBeInTheDocument();
  });
});
