// Render tests for the Phase-4 interaction UI on GameScreen: the trade panel
// (bank trade, propose offer, incoming offers), the dev-card panel (Buy + play
// buttons), the state-driven dialogs (monopoly, year-of-plenty, discard, victim
// chooser), and the game-over overlay. The store is seeded directly; the wire
// path + reducers are covered by gameInteractions.test.ts.

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { type BoardModel, FACING_NE, HEX_WATER, PIECE_SETTLEMENT } from '../board/types';
import { ToastProvider } from '../components';
import {
  DevCardAction,
  DevCardType,
  GameState,
  GameStatsType,
  PlayerElementAction,
  PlayerElementType,
  Resource,
  SOCAcceptOffer,
  SOCBankTrade,
  SOCChoosePlayerRequest,
  SOCDevCardAction,
  SOCDiceResultResources,
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

  it('keeps bank trade at 4:1 when the player does not own the visible port', () => {
    seedCurrentPlayer(0);
    seedBoardPort(3, false);
    useGameStore.getState().setGameState(GAME, GameState.PLAY1);
    renderGame();

    const panel = screen.getByTestId('trade-panel');
    expect(within(panel).getByTestId('owned-ports')).toHaveTextContent('No ports owned');
    expect(ratioLabels()).toEqual(['4:1 bank']);
    expect(within(panel).getByTestId('bank-trade-ratio')).toHaveValue('4');
  });

  it('unlocks a resource harbor only from a settlement on either port corner', () => {
    seedCurrentPlayer(0);
    seedBoardPort(3, true); // sheep 2:1 port
    useGameStore.getState().setGameState(GAME, GameState.PLAY1);
    renderGame();

    const panel = screen.getByTestId('trade-panel');
    fireEvent.change(within(panel).getByTestId('bank-trade-give'), {
      target: { value: String(Resource.SHEEP) },
    });

    expect(within(panel).getByTestId('owned-ports')).toHaveTextContent('Sheep 2:1');
    expect(ratioLabels()).toEqual(['2:1 Sheep port', '4:1 bank']);
    expect(within(panel).getByTestId('bank-trade-ratio')).toHaveValue('2');
    expect(within(panel).getByTestId('bank-trade-rule')).toHaveTextContent(
      'Use your Sheep harbor. Pay 2 sheep for 1 ore.',
    );
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
    expect(screen.getByTestId('trade-dock')).toHaveTextContent('droid 3 wants to trade');
    expect(screen.getByTestId('accept-offer-3')).toBeInTheDocument();
    expect(screen.getByTestId('reject-offer-3')).toBeInTheDocument();
  });

  it('quick asks prefill the player-trade composer', () => {
    seedCurrentPlayer(0);
    useGameStore.getState().setGameState(GAME, GameState.PLAY1);
    renderGame();

    fireEvent.click(screen.getByTestId('quick-ask-wood'));

    expect(within(screen.getByTestId('offer-get')).getByTestId('pick-wood-value')).toHaveTextContent('1');
    expect(within(screen.getByTestId('offer-give')).getByTestId('pick-ore-value')).toHaveTextContent('1');
  });

  it('shows bot-to-bot offers without invalid local actions', () => {
    seedCurrentPlayer(1);
    useGameStore.getState().setGameState(GAME, GameState.PLAY1);
    useGameStore.getState().applyMakeOffer(
      new SOCMakeOffer(GAME, {
        from: 1,
        to: [false, false, true, false],
        give: resourceSet(1, 0, 0, 0, 0),
        get: resourceSet(0, 0, 0, 0, 1),
      }),
    );
    renderGame();

    expect(screen.getByTestId('live-offer-1')).toHaveTextContent('droid 1');
    expect(screen.getByTestId('trade-activity')).toHaveTextContent('droid 1 offered a trade');
    expect(screen.queryByTestId('accept-offer-1')).not.toBeInTheDocument();
  });

  it('records declined and accepted trade activity clearly', () => {
    seedCurrentPlayer(0);
    useGameStore.getState().setGameState(GAME, GameState.PLAY1);
    useGameStore.getState().applyMakeOffer(
      new SOCMakeOffer(GAME, {
        from: 0,
        to: [false, true, true, false],
        give: resourceSet(0, 1, 0, 0, 0),
        get: resourceSet(0, 0, 1, 0, 0),
      }),
    );
    useGameStore.getState().applyRejectOffer(GAME, 1);
    useGameStore.getState().applyAcceptOffer(
      new SOCAcceptOffer(
        GAME,
        2,
        0,
        resourceSet(0, 1, 0, 0, 0),
        resourceSet(0, 0, 1, 0, 0),
      ),
    );

    renderGame();
    const activity = screen.getByTestId('trade-activity');
    expect(activity).toHaveTextContent('droid 1 declined');
    expect(activity).toHaveTextContent('droid 2 accepted');
    expect(screen.getByTestId('my-res-ore')).toHaveTextContent('3');
    expect(screen.getByTestId('my-res-sheep')).toHaveTextContent('3');
  });

  it('records successful bank trades in the trade activity feed', () => {
    seedCurrentPlayer(0);
    useGameStore.getState().setGameState(GAME, GameState.PLAY1);
    useGameStore.getState().applyBankTrade(
      new SOCBankTrade(GAME, resourceSet(0, 4, 0, 0, 0), resourceSet(1, 0, 0, 0, 0), 0),
    );
    renderGame();

    expect(screen.getByTestId('trade-activity')).toHaveTextContent('WebPlayer traded with the bank');
    expect(screen.getByTestId('game-log')).toHaveTextContent('WebPlayer traded 4 ore for 1 clay with the bank.');
    expect(screen.getByTestId('my-res-clay')).toHaveTextContent('2');
    expect(screen.getByTestId('my-res-ore')).toHaveTextContent('0');
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
    expect(screen.getByTestId('discard-have-ore')).toHaveTextContent('4');
    expect(screen.getByTestId('discard-have-sheep')).toHaveTextContent('2');
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
    expect(screen.getByTestId('rob-victim-1')).toHaveTextContent('0 cards');
  });
});

describe('ships and dice production', () => {
  it('shows the ship build action in sea-board games', () => {
    seedCurrentPlayer(0);
    markSeaGame();
    useGameStore.getState().setGameState(GAME, GameState.PLAY1);
    renderGame();

    expect(screen.getByTestId('build-ship')).toBeInTheDocument();
    expect(screen.getByTestId('build-ship')).not.toBeDisabled();
  });

  it('shows resource gains from a dice result', () => {
    seedCurrentPlayer(0);
    useGameStore.getState().applyDiceResultResources(
      new SOCDiceResultResources(GAME, [
        { playerNumber: 0, total: 11, resources: [{ type: Resource.WOOD, amount: 2 }] },
        { playerNumber: 2, total: 3, resources: [{ type: Resource.WHEAT, amount: 1 }] },
      ]),
    );
    renderGame();

    expect(screen.getByTestId('resource-gain-burst')).toHaveTextContent('Production');
    expect(screen.getByTestId('resource-gain-0')).toHaveTextContent('You');
    expect(screen.getByTestId('resource-gain-2')).toHaveTextContent('droid 2');
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

/** Seed one board port and optionally a local settlement on one of its corners. */
function seedBoardPort(ptype: number, owned: boolean): void {
  const edge = 0x0303;
  const board: BoardModel = {
    encoding: 3,
    width: 0x08,
    height: 0x08,
    hexes: [],
    ports: [{ edge, ptype, facing: FACING_NE }],
    robberHex: 0,
    pirateHex: 0,
  };
  useGameStore.setState((s) => {
    if (s.currentGame === null) {
      return {};
    }
    return {
      currentGame: {
        ...s.currentGame,
        board,
        pieces: owned ? [{ ptype: PIECE_SETTLEMENT, coord: 0x0203, playerNumber: 0 }] : [],
      },
    };
  });
}

/** Mark the joined game as a sea-board game so ship controls are visible. */
function markSeaGame(): void {
  const board: BoardModel = {
    encoding: 3,
    width: 0x08,
    height: 0x08,
    hexes: [{ coord: 0x0303, row: 0x03, col: 0x03, hexType: HEX_WATER, diceNum: 0 }],
    ports: [],
    robberHex: 0,
    pirateHex: 0x0303,
  };
  useGameStore.setState((s) => {
    if (s.currentGame === null) {
      return {};
    }
    return {
      currentGame: {
        ...s.currentGame,
        options: 'SBL=t',
        board,
      },
    };
  });
}

/** Current bank-rate option labels. */
function ratioLabels(): string[] {
  const select = screen.getByTestId('bank-trade-ratio') as HTMLSelectElement;
  return Array.from(select.options).map((opt) => opt.textContent ?? '');
}
