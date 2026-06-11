// Render tests for the Phase-4 interaction UI on GameScreen: the trade panel
// (bank trade, propose offer, incoming offers), the dev-card panel (Buy + play
// buttons), the state-driven dialogs (monopoly, year-of-plenty, discard, victim
// chooser), and the game-over overlay. The store is seeded directly; the wire
// path + reducers are covered by gameInteractions.test.ts.

import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ToastProvider } from '../components';
import {
  DevCardAction,
  DevCardType,
  GameState,
  GameStatsType,
  PlayerElementAction,
  PlayerElementType,
  SOCChoosePlayerRequest,
  SOCDevCardAction,
  SOCGameStats,
  SOCMakeOffer,
  SOCPlayerElement,
  SOCSetTurn,
} from '../protocol';
import { resourceSet } from '../protocol';
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

/** Seat the local player at 0 + three bots, and give the local hand resources. */
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
  // Give the local player a stocked hand (4 ore so a 4:1 bank trade is enabled).
  for (const [type, n] of [
    [PlayerElementType.CLAY, 1],
    [PlayerElementType.ORE, 4],
    [PlayerElementType.SHEEP, 2],
    [PlayerElementType.WHEAT, 2],
    [PlayerElementType.WOOD, 1],
  ] as const) {
    s.applyPlayerElement(new SOCPlayerElement(GAME, 0, PlayerElementAction.SET, type, n));
  }
});

describe('trade panel', () => {
  it('renders the bank and propose-offer controls', () => {
    seedCurrentPlayer(0);
    useGameStore.getState().setGameState(GAME, GameState.PLAY1);
    renderGame();

    const panel = screen.getByTestId('trade-panel');
    expect(within(panel).getByTestId('bank-trade-give')).toBeInTheDocument();
    expect(within(panel).getByTestId('bank-trade-get')).toBeInTheDocument();
    expect(within(panel).getByTestId('bank-trade-submit')).toBeInTheDocument();
    expect(within(panel).getByTestId('offer-give')).toBeInTheDocument();
    expect(within(panel).getByTestId('offer-get')).toBeInTheDocument();
    expect(within(panel).getByTestId('offer-propose')).toBeInTheDocument();
  });

  it('shows an incoming offer with Accept/Reject buttons', () => {
    seedCurrentPlayer(3);
    useGameStore.getState().setGameState(GAME, GameState.PLAY1);
    useGameStore.getState().applyMakeOffer(
      new SOCMakeOffer(GAME, {
        from: 3,
        to: [true, false, false, false],
        give: resourceSet(0, 0, 0, 1, 0),
        get: resourceSet(0, 1, 0, 0, 0),
      }),
    );
    renderGame();
    expect(screen.getByTestId('offer-3')).toBeInTheDocument();
    expect(screen.getByTestId('accept-offer-3')).toBeInTheDocument();
    expect(screen.getByTestId('reject-offer-3')).toBeInTheDocument();
  });
});

describe('dev-card panel', () => {
  it('renders Buy + a Play button for a playable Knight', () => {
    seedCurrentPlayer(0);
    useGameStore.getState().setGameState(GAME, GameState.PLAY1);
    // An old (playable) Knight in the local inventory.
    useGameStore.getState().applyDevCardAction(
      new SOCDevCardAction(GAME, 0, DevCardAction.ADD_OLD, DevCardType.KNIGHT),
    );
    useGameStore.getState().applyDevCardCount(GAME, 20);
    renderGame();

    const panel = screen.getByTestId('devcard-panel');
    expect(within(panel).getByTestId('buy-devcard')).toBeInTheDocument();
    expect(within(panel).getByTestId('play-knight')).toBeInTheDocument();
    expect(within(panel).getByTestId('play-knight')).not.toBeDisabled();
  });

  it('disables Play for a brand-new (this-turn) card', () => {
    seedCurrentPlayer(0);
    useGameStore.getState().setGameState(GAME, GameState.PLAY1);
    useGameStore.getState().applyDevCardAction(
      new SOCDevCardAction(GAME, 0, DevCardAction.DRAW, DevCardType.MONO),
    );
    renderGame();
    expect(screen.getByTestId('play-monopoly')).toBeDisabled();
  });
});

describe('state-driven dialogs', () => {
  it('shows the monopoly picker in WAITING_FOR_MONOPOLY', () => {
    seedCurrentPlayer(0);
    useGameStore.getState().setGameState(GAME, GameState.WAITING_FOR_MONOPOLY);
    renderGame();
    expect(screen.getByTestId('monopoly-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('monopoly-sheep')).toBeInTheDocument();
  });

  it('shows the year-of-plenty picker in WAITING_FOR_DISCOVERY', () => {
    seedCurrentPlayer(0);
    useGameStore.getState().setGameState(GAME, GameState.WAITING_FOR_DISCOVERY);
    renderGame();
    expect(screen.getByTestId('pick-resources-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('pick-summary')).toHaveTextContent('of 2');
  });

  it('shows the discard dialog when this player must discard', () => {
    useGameStore.getState().setGameState(GAME, GameState.WAITING_FOR_DISCARDS);
    useGameStore.getState().applyDiscardRequest(GAME, 4);
    renderGame();
    expect(screen.getByTestId('discard-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('discard-summary')).toHaveTextContent('of 4');
    // Confirm starts disabled (0 selected of 4).
    expect(screen.getByTestId('discard-confirm')).toBeDisabled();
  });

  it('shows the victim chooser after a CHOOSEPLAYERREQUEST', () => {
    seedCurrentPlayer(0);
    // candidate victims: seats 1 and 2
    useGameStore.getState().applyChoosePlayerRequest(
      new SOCChoosePlayerRequest(GAME, [false, true, true, false]),
    );
    renderGame();
    expect(screen.getByTestId('rob-victim-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('rob-victim-1')).toBeInTheDocument();
    expect(screen.getByTestId('rob-victim-2')).toBeInTheDocument();
  });
});

describe('game over overlay', () => {
  it('names the winner and shows final scores', () => {
    seedCurrentPlayer(2);
    useGameStore.getState().setGameState(GAME, GameState.OVER);
    useGameStore.getState().applyGameStats(
      new SOCGameStats(GAME, GameStatsType.TYPE_PLAYERS, [3, 5, 10, 7], [false, true, true, true]),
    );
    renderGame();
    const overlay = screen.getByTestId('game-over');
    expect(within(overlay).getByTestId('game-over-winner')).toHaveTextContent('droid 2 wins!');
    expect(within(overlay).getByTestId('final-score-2')).toHaveTextContent('10 VP');
  });
});

/** Helper: set the current player so isMyTurn is computed for that seat. */
function seedCurrentPlayer(pn: number): void {
  useGameStore.getState().applySetTurn(new SOCSetTurn(GAME, pn));
}
