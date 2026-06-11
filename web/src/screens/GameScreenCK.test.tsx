// Render tests for the Cities & Knights GameScreen additions: the C&K panel
// (commodities, improvement tracks + metropolis badges, knights, barbarian
// track, progress-card hand), the compact per-opponent summaries, the
// barbarian-attack banner, the Trade Monopoly commodity picker, and the
// robber-or-pirate chooser. The store is seeded directly (the wire path is
// covered by gameCK.test.ts).

import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { ToastProvider } from '../components';
import {
  CKProgressCard,
  GameElementType,
  GameState,
  InventoryItemAction,
  PlayerElementAction,
  PlayerElementType,
  SOCGameElements,
  SOCInventoryItemAction,
  SOCPlayerElements,
  SOCSetSpecialItem,
  SpecialItemOp,
} from '../protocol';
import { useGameStore } from '../store/gameStore';
import { GameScreen } from './GameScreen';

const GAME = 'ck';
const CK_OPTS = '_SC_CK=t,_CK_IMP=t,_CK_KNI=t,_CK_PROG=t,_CK_BARB=t,_CK_METR=t,SBL=t,VP=t13';

function renderGame(): void {
  render(
    <ToastProvider>
      <GameScreen />
    </ToastProvider>,
  );
}

/** Make it the local player's turn in the given state. */
function myTurn(state: number): void {
  const s = useGameStore.getState();
  s.applyGameElements(new SOCGameElements(GAME, [GameElementType.CURRENT_PLAYER], [0]));
  s.setGameState(GAME, state);
}

/** SET the local player's CLAY..WOOD hand counts. */
function setResources(clay: number, ore: number, sheep: number, wheat: number, wood: number): void {
  useGameStore.getState().applyPlayerElements(
    new SOCPlayerElements(
      GAME,
      0,
      PlayerElementAction.SET,
      [
        PlayerElementType.CLAY,
        PlayerElementType.ORE,
        PlayerElementType.SHEEP,
        PlayerElementType.WHEAT,
        PlayerElementType.WOOD,
      ],
      [clay, ore, sheep, wheat, wood],
    ),
  );
}

beforeEach(() => {
  const s = useGameStore.getState();
  s.setStatus('connected');
  s.resetLobby();
  s.setNickname('WebPlayer');
  s.setGames([{ name: GAME, options: CK_OPTS, started: false }]);
  s.joinGameAuth(GAME);
  s.applySitDown(GAME, 0, 'WebPlayer', false);
  s.applySitDown(GAME, 1, 'droid 1', true);
  s.setGameState(GAME, GameState.ROLL_OR_CARD);
});

describe('CK panel visibility', () => {
  it('renders the C&K panel in a C&K game', () => {
    renderGame();
    expect(screen.getByTestId('ck-panel')).toBeInTheDocument();
  });

  it('does not render the C&K panel in a plain game', () => {
    const s = useGameStore.getState();
    s.clearCurrentGame(GAME);
    s.setGames([{ name: 'plain', options: 'BC=t4,PL=4', started: false }]);
    s.joinGameAuth('plain');
    s.applySitDown('plain', 0, 'WebPlayer', false);
    s.setGameState('plain', GameState.ROLL_OR_CARD);
    renderGame();
    expect(screen.queryByTestId('ck-panel')).toBeNull();
  });
});

describe('commodities row', () => {
  it('shows my cloth/coin/paper counts', () => {
    useGameStore.getState().applyPlayerElements(
      new SOCPlayerElements(
        GAME,
        0,
        PlayerElementAction.SET,
        [
          PlayerElementType.CK_CLOTH_COUNT,
          PlayerElementType.CK_COIN_COUNT,
          PlayerElementType.CK_PAPER_COUNT,
        ],
        [2, 1, 3],
      ),
    );
    renderGame();
    expect(screen.getByTestId('ck-commodity-cloth')).toHaveTextContent('2');
    expect(screen.getByTestId('ck-commodity-coin')).toHaveTextContent('1');
    expect(screen.getByTestId('ck-commodity-paper')).toHaveTextContent('3');
  });
});

describe('improvement tracks', () => {
  it('enables Build only on my turn in PLAY1 with enough of the commodity', () => {
    // Trade at level 1 -> next level costs 2 cloth; I hold exactly 2.
    const s = useGameStore.getState();
    s.applySetSpecialItem(
      new SOCSetSpecialItem(GAME, SpecialItemOp.OP_SET_PICK, '_CK_IMP/T', -1, 0, 0, -1, 1),
    );
    s.applyPlayerElements(
      new SOCPlayerElements(GAME, 0, PlayerElementAction.SET, [PlayerElementType.CK_CLOTH_COUNT], [2]),
    );
    myTurn(GameState.PLAY1);
    renderGame();
    expect(screen.getByTestId('ck-build-trade')).toBeEnabled();
    // Politics needs 1 coin; I have none.
    expect(screen.getByTestId('ck-build-politics')).toBeDisabled();
    expect(screen.getByTestId('ck-build-science')).toBeDisabled();
  });

  it('disables Build outside PLAY1', () => {
    useGameStore.getState().applyPlayerElements(
      new SOCPlayerElements(GAME, 0, PlayerElementAction.SET, [PlayerElementType.CK_CLOTH_COUNT], [5]),
    );
    myTurn(GameState.ROLL_OR_CARD);
    renderGame();
    expect(screen.getByTestId('ck-build-trade')).toBeDisabled();
  });

  it('shows a metropolis badge with the owner name', () => {
    useGameStore.getState().applyCkMetropolis(GAME, 1, 1);
    renderGame();
    expect(screen.getByTestId('ck-metropolis-politics')).toHaveTextContent('droid 1');
    // And next to the owner's name in their player panel.
    expect(screen.getByTestId('ck-player-metropolis-1-1')).toHaveTextContent('Politics Metropolis');
  });
});

describe('knights', () => {
  function setKnights(lv1: number, lv2: number, lv3: number, a1: number, a2: number, a3: number): void {
    useGameStore.getState().applyPlayerElements(
      new SOCPlayerElements(
        GAME,
        0,
        PlayerElementAction.SET,
        [
          PlayerElementType.CK_KNIGHTS_LV1,
          PlayerElementType.CK_KNIGHTS_LV2,
          PlayerElementType.CK_KNIGHTS_LV3,
          PlayerElementType.CK_KNIGHTS_ACTIVE_LV1,
          PlayerElementType.CK_KNIGHTS_ACTIVE_LV2,
          PlayerElementType.CK_KNIGHTS_ACTIVE_LV3,
        ],
        [lv1, lv2, lv3, a1, a2, a3],
      ),
    );
  }

  it('shows counts by level with active totals', () => {
    setKnights(2, 1, 0, 1, 0, 0);
    renderGame();
    expect(screen.getByTestId('ck-knights')).toHaveTextContent('basic ×2 (active 1)');
    expect(screen.getByTestId('ck-knights')).toHaveTextContent('strong ×1 (active 0)');
    expect(screen.getByTestId('ck-knights')).toHaveTextContent('mighty ×0 (active 0)');
  });

  it('gates Buy (sheep+ore), Activate (wheat + an inactive knight), Promote', () => {
    setKnights(1, 0, 0, 0, 0, 0); // one inactive basic knight
    setResources(0, 1, 1, 1, 0); // 1 ore, 1 sheep, 1 wheat
    myTurn(GameState.PLAY1);
    renderGame();
    expect(screen.getByTestId('ck-knight-buy')).toBeEnabled();
    expect(screen.getByTestId('ck-knight-activate')).toBeEnabled();
    expect(screen.getByTestId('ck-knight-promote')).toBeEnabled();
  });

  it('disables Activate when all knights are active and Buy when unaffordable', () => {
    setKnights(1, 0, 0, 1, 0, 0); // the only knight is active
    setResources(0, 0, 0, 1, 0); // wheat only
    myTurn(GameState.PLAY1);
    renderGame();
    expect(screen.getByTestId('ck-knight-buy')).toBeDisabled(); // no sheep/ore
    expect(screen.getByTestId('ck-knight-activate')).toBeDisabled(); // none inactive
  });

  it('requires Politics >= 3 to promote a strong knight to mighty', () => {
    setKnights(0, 1, 0, 0, 0, 0); // only a strong knight to promote
    setResources(0, 1, 1, 0, 0);
    myTurn(GameState.PLAY1);
    renderGame();
    expect(screen.getByTestId('ck-knight-promote')).toBeDisabled();
  });
});

describe('barbarian track + attack banner', () => {
  it('shows the strength as a data attribute', () => {
    useGameStore.getState().applyGameElements(
      new SOCGameElements(GAME, [GameElementType.CK_BARBARIAN_STRENGTH], [4]),
    );
    renderGame();
    expect(screen.getByTestId('ck-barbarian')).toHaveAttribute('data-strength', '4');
  });

  it('shows a transient banner after an attack result', () => {
    useGameStore.getState().applyCkBarbarianAttack(GAME, 5, 6);
    renderGame();
    const banner = screen.getByTestId('ck-barbarian-banner');
    expect(banner).toHaveTextContent('Strength 5 vs defense 6');
    expect(banner).toHaveAttribute('data-defenders-won', 'true');
  });
});

describe('progress-card hand', () => {
  function draw(itype: number): void {
    useGameStore.getState().applyInventoryItemAction(
      new SOCInventoryItemAction(GAME, 0, InventoryItemAction.ADD_PLAYABLE, itype),
    );
  }

  it('renders a chip per card with its name and a Play button', () => {
    draw(CKProgressCard.WARLORD);
    draw(CKProgressCard.TRADE_MONOPOLY);
    myTurn(GameState.ROLL_OR_CARD);
    renderGame();
    expect(screen.getByTestId(`ck-progress-${CKProgressCard.WARLORD}`)).toHaveTextContent('Warlord');
    // Warlord is playable in ROLL_OR_CARD; Trade Monopoly only in PLAY1.
    expect(screen.getByTestId(`ck-progress-play-${CKProgressCard.WARLORD}`)).toBeEnabled();
    expect(screen.getByTestId(`ck-progress-play-${CKProgressCard.TRADE_MONOPOLY}`)).toBeDisabled();
  });

  it('enables monopolies in PLAY1 and disables everything off-turn', () => {
    draw(CKProgressCard.TRADE_MONOPOLY);
    myTurn(GameState.PLAY1);
    renderGame();
    expect(screen.getByTestId(`ck-progress-play-${CKProgressCard.TRADE_MONOPOLY}`)).toBeEnabled();
  });

  it('disables Play when it is not my turn', () => {
    draw(CKProgressCard.WARLORD);
    const s = useGameStore.getState();
    s.applyGameElements(new SOCGameElements(GAME, [GameElementType.CURRENT_PLAYER], [1]));
    s.setGameState(GAME, GameState.PLAY1);
    renderGame();
    expect(screen.getByTestId(`ck-progress-play-${CKProgressCard.WARLORD}`)).toBeDisabled();
  });
});

describe('other players\' C&K summaries', () => {
  it('shows commodities, knights, improvements, hidden hand, and VP cards', () => {
    const s = useGameStore.getState();
    s.applyPlayerElements(
      new SOCPlayerElements(
        GAME,
        1,
        PlayerElementAction.SET,
        [PlayerElementType.CK_CLOTH_COUNT, PlayerElementType.CK_KNIGHTS_LV1, PlayerElementType.CK_KNIGHTS_ACTIVE_LV1],
        [2, 3, 1],
      ),
    );
    // Hidden draw announced as ADD_PLAYABLE itype 0.
    s.applyInventoryItemAction(new SOCInventoryItemAction(GAME, 1, InventoryItemAction.ADD_PLAYABLE, 0));
    // Revealed VP progress card (Constitution).
    s.applyInventoryItemAction(
      new SOCInventoryItemAction(GAME, 1, InventoryItemAction.ADD_OTHER, CKProgressCard.CONSTITUTION, {
        kept: true,
        vp: true,
        canCancel: false,
      }),
    );
    renderGame();
    const summary = screen.getByTestId('ck-player-1');
    expect(within(summary).getByTestId('ck-player-commodities-1')).toHaveTextContent('Cloth 2');
    expect(within(summary).getByTestId('ck-player-knights-1')).toHaveTextContent('Knights 3 (active 1)');
    expect(within(summary).getByTestId('ck-player-hand-1')).toHaveTextContent('Progress 1');
    expect(within(summary).getByTestId('ck-player-vpcards-1')).toHaveTextContent('Constitution');
  });
});

describe('monopoly pickers (WAITING_FOR_MONOPOLY)', () => {
  function playMonopolyCard(itype: number): void {
    const s = useGameStore.getState();
    s.applyInventoryItemAction(
      new SOCInventoryItemAction(GAME, 0, InventoryItemAction.ADD_PLAYABLE, itype),
    );
    s.applyInventoryItemAction(
      new SOCInventoryItemAction(GAME, 0, InventoryItemAction.PLAYED, itype),
    );
  }

  it('shows the commodity picker for Trade Monopoly (itype 12)', () => {
    myTurn(GameState.PLAY1);
    playMonopolyCard(CKProgressCard.TRADE_MONOPOLY);
    useGameStore.getState().setGameState(GAME, GameState.WAITING_FOR_MONOPOLY);
    renderGame();
    const dlg = screen.getByTestId('ck-commodity-pick');
    expect(within(dlg).getByTestId('ck-pick-cloth')).toBeInTheDocument();
    expect(within(dlg).getByTestId('ck-pick-coin')).toBeInTheDocument();
    expect(within(dlg).getByTestId('ck-pick-paper')).toBeInTheDocument();
    expect(screen.queryByTestId('monopoly-dialog')).toBeNull();
  });

  it('shows the resource picker for Resource Monopoly (itype 11)', () => {
    myTurn(GameState.PLAY1);
    playMonopolyCard(CKProgressCard.RESOURCE_MONOPOLY);
    useGameStore.getState().setGameState(GAME, GameState.WAITING_FOR_MONOPOLY);
    renderGame();
    expect(screen.getByTestId('monopoly-dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('ck-commodity-pick')).toBeNull();
  });

  it('shows the resource picker for the plain dev-card Monopoly (no pending C&K card)', () => {
    myTurn(GameState.WAITING_FOR_MONOPOLY);
    renderGame();
    expect(screen.getByTestId('monopoly-dialog')).toBeInTheDocument();
    expect(screen.queryByTestId('ck-commodity-pick')).toBeNull();
  });
});

describe('robber-or-pirate chooser (WAITING_FOR_ROBBER_OR_PIRATE)', () => {
  it('offers Move-robber / Move-pirate on my turn in state 54', () => {
    myTurn(GameState.WAITING_FOR_ROBBER_OR_PIRATE);
    renderGame();
    const dlg = screen.getByTestId('robber-or-pirate-dialog');
    expect(within(dlg).getByTestId('choose-robber')).toBeInTheDocument();
    expect(within(dlg).getByTestId('choose-pirate')).toBeInTheDocument();
  });

  it('does not render when it is not my turn', () => {
    const s = useGameStore.getState();
    s.applyGameElements(new SOCGameElements(GAME, [GameElementType.CURRENT_PLAYER], [1]));
    s.setGameState(GAME, GameState.WAITING_FOR_ROBBER_OR_PIRATE);
    renderGame();
    expect(screen.queryByTestId('robber-or-pirate-dialog')).toBeNull();
  });
});
