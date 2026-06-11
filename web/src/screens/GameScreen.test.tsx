// Render tests for the live in-game GameScreen: board, per-seat player panels
// (with current-player highlight), turn/state banner, dice display, the local
// hand breakdown, and the game log. The store is seeded directly (the wire path
// is covered by gameInGame.test.ts).

import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ToastProvider } from '../components';
import {
  GameElementType,
  PlayerElementAction,
  PlayerElementType,
  SOCDiceResult,
  SOCGameElements,
  SOCPlayerElement,
  SOCPutPiece,
} from '../protocol';
import { PIECE_SETTLEMENT } from '../board/types';
import { useGameStore } from '../store/gameStore';
import { GameScreen } from './GameScreen';

const GAME = 'sea';

function renderGame(): void {
  render(
    <ToastProvider>
      <GameScreen />
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
  s.applySitDown(GAME, 1, 'droid 1', true);
  s.setGameState(GAME, 15); // ROLL_OR_CARD
  // No board is set: the screen shows a "Loading board…" placeholder, which is
  // sufficient for these panel/banner/dice/log assertions. The board-decode path
  // is covered by gameInGame.test.ts and BoardSVG.test.tsx.
});

describe('GameScreen', () => {
  it('renders a player panel per seat with name, color swatch, and resource total', () => {
    useGameStore.getState().applyPlayerElement(
      new SOCPlayerElement(GAME, 1, PlayerElementAction.SET, PlayerElementType.RESOURCE_COUNT, 4),
    );
    renderGame();

    const panel0 = screen.getByTestId('player-panel-0');
    expect(within(panel0).getByTestId('player-name-0')).toHaveTextContent('WebPlayer');
    expect(within(panel0).getByTestId('player-swatch-0')).toBeInTheDocument();

    const panel1 = screen.getByTestId('player-panel-1');
    expect(within(panel1).getByTestId('player-name-1')).toHaveTextContent('droid 1');
    expect(within(panel1).getByTestId('player-name-1')).toHaveTextContent('(bot)');
    expect(within(panel1).getByTestId('player-resources-1')).toHaveTextContent('4');
  });

  it('highlights the current player via data-current', () => {
    useGameStore.getState().applyGameElements(
      new SOCGameElements(GAME, [GameElementType.CURRENT_PLAYER], [1]),
    );
    renderGame();
    expect(screen.getByTestId('player-panel-1')).toHaveAttribute('data-current', 'true');
    expect(screen.getByTestId('player-panel-0')).toHaveAttribute('data-current', 'false');
  });

  it('shows the turn banner with the current player name and a state label', () => {
    useGameStore.getState().applyGameElements(
      new SOCGameElements(GAME, [GameElementType.CURRENT_PLAYER], [1]),
    );
    renderGame();
    const banner = screen.getByTestId('turn-banner');
    expect(banner).toHaveTextContent('droid 1');
    expect(banner).toHaveTextContent('Roll dice or play a card');
  });

  it('shows the dice display with the last roll total', () => {
    useGameStore.getState().applyDiceResult(new SOCDiceResult(GAME, 9));
    renderGame();
    expect(screen.getByTestId('dice-total')).toHaveTextContent('9');
  });

  it('shows a placeholder dice display before any roll', () => {
    renderGame();
    const dice = screen.getByTestId('dice-display');
    expect(dice).toHaveAttribute('data-total', '');
  });

  it('shows the local player per-resource breakdown', () => {
    useGameStore.getState().applyPlayerElement(
      new SOCPlayerElement(GAME, 0, PlayerElementAction.SET, PlayerElementType.WHEAT, 2),
    );
    renderGame();
    const mine = screen.getByTestId('my-resources');
    expect(within(mine).getByTestId('my-res-wheat')).toHaveTextContent('2');
  });

  it('updates the VP shown after placing a settlement', () => {
    useGameStore.getState().applyPutPiece(new SOCPutPiece(GAME, 0, PIECE_SETTLEMENT, 0x0204));
    renderGame();
    expect(screen.getByTestId('player-vp-0')).toHaveTextContent('1 VP');
  });

  it('renders the game log with appended lines', () => {
    useGameStore.getState().appendGameLog(GAME, 'It is your turn.');
    renderGame();
    expect(screen.getByTestId('game-log')).toHaveTextContent('It is your turn.');
  });
});
