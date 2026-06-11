// Vitest render test for the game-over overlay (Phase 4).
//
// Asserts the overlay renders when the game state transitions to OVER (1000)
// and names the winner. Two paths are covered:
//   1. Winner derived from CURRENT_PLAYER at the OVER transition (the primary
//      path: SOCGameElements(CURRENT_PLAYER) then SOCGameState OVER, mirroring
//      doc/Message-Sequences-for-Game-Actions.md "Game over").
//   2. Final per-seat scores filled from SOCGameStats(TYPE_PLAYERS).
//
// The store is seeded directly; the wire decoders + reducers are covered by
// gameInteractions.test.ts, and the broader interaction UI by
// GameScreenInteractions.test.tsx. This file is the dedicated Phase-4
// game-over-overlay assertion.

import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ToastProvider } from '../components';
import {
  GameElementType,
  GameState,
  GameStatsType,
  SOCGameElements,
  SOCGameStats,
} from '../protocol';
import { useGameStore } from '../store/gameStore';
import { GameScreen } from './GameScreen';

const GAME = 'overgame';

function renderGame(): void {
  render(
    <ToastProvider>
      <GameScreen />
    </ToastProvider>,
  );
}

/** Seat the local player at 0 plus three bots in a fresh joined game. */
beforeEach(() => {
  const s = useGameStore.getState();
  s.setStatus('connected');
  s.resetLobby();
  s.setNickname('WebPlayer');
  s.joinGameAuth(GAME);
  s.applySitDown(GAME, 0, 'WebPlayer', false);
  s.applySitDown(GAME, 1, 'droid 1', true);
  s.applySitDown(GAME, 2, 'droid 2', true);
  s.applySitDown(GAME, 3, 'droid 3', true);
  // Move into active play so the OVER transition is a real state change.
  s.setGameState(GAME, GameState.PLAY1);
});

describe('game-over overlay', () => {
  it('renders for GAMESTATE OVER and names the CURRENT_PLAYER winner', () => {
    const s = useGameStore.getState();
    // The server sets CURRENT_PLAYER (here seat 2) just before GAMESTATE OVER;
    // the store takes the winner from currentPlayerNumber at that transition.
    s.applyGameElements(
      new SOCGameElements(GAME, [GameElementType.CURRENT_PLAYER], [2]),
    );
    s.setGameState(GAME, GameState.OVER);

    renderGame();

    const overlay = screen.getByTestId('game-over');
    expect(overlay).toBeInTheDocument();
    expect(within(overlay).getByTestId('game-over-winner')).toHaveTextContent(
      'droid 2 wins!',
    );
    // The winning seat's final-score row is flagged as the winner.
    const winnerRow = within(overlay).getByTestId('final-score-2');
    expect(winnerRow).toHaveAttribute('data-winner', 'true');
  });

  it('fills final per-seat scores from GAMESTATS (TYPE_PLAYERS)', () => {
    const s = useGameStore.getState();
    s.applyGameElements(
      new SOCGameElements(GAME, [GameElementType.CURRENT_PLAYER], [0]),
    );
    s.setGameState(GAME, GameState.OVER);
    s.applyGameStats(
      new SOCGameStats(
        GAME,
        GameStatsType.TYPE_PLAYERS,
        [10, 4, 6, 8],
        [false, true, true, true],
      ),
    );

    renderGame();

    const overlay = screen.getByTestId('game-over');
    expect(within(overlay).getByTestId('game-over-winner')).toHaveTextContent(
      'WebPlayer wins!',
    );
    // Final scores come from the GAMESTATS message, not derived VP.
    expect(within(overlay).getByTestId('final-score-0')).toHaveTextContent('10 VP');
    expect(within(overlay).getByTestId('final-score-3')).toHaveTextContent('8 VP');
  });

  it('does not render the overlay before the game is OVER', () => {
    renderGame();
    expect(screen.queryByTestId('game-over')).toBeNull();
  });
});
