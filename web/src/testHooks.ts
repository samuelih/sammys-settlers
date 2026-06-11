// Test-only window hooks for end-to-end (Playwright) driving.
//
// The Phase-4 interaction E2E test (web/e2e/interactions.spec.ts) needs to send
// JSettlers debug chat-commands (e.g. "rsrcs: 4 0 0 0 0 #0", "dev: 9 #0") to the
// live Java server while connected as the "debug" user, and to read a snapshot
// of the in-game store for assertions. These commands have no place in the
// normal UI, so they are exposed here as a small, clearly-namespaced bridge on
// `window.__jsettlers`.
//
// This is inert for ordinary users: it only forwards to the already-public
// `sendDebug()` store action and returns a read-only state snapshot. It is wired
// in from main.tsx via installTestHooks(); no production code path depends on it.

import { getConnection, sendDebug, useGameStore } from './store/gameStore';

/** The shape of the test bridge installed on `window.__jsettlers`. */
export interface JSettlersTestHooks {
  /**
   * Send a debug chat-command as a SOCGameTextMsg in the joined game. Requires
   * the local nickname to be "debug" and the server to run with
   * `-Djsettlers.allow.debug=Y`. Returns false if not currently in a game.
   */
  sendDebug: (text: string) => boolean;
  /** True once a GameConnection has been created (connect was attempted). */
  hasConnection: () => boolean;
  /**
   * A shallow snapshot of the current-game store slice the E2E test asserts on
   * (resources, dev-card deck count, robber hex, game state, etc.). Null when no
   * game is joined.
   */
  gameSnapshot: () => GameSnapshot | null;
}

/** A read-only snapshot of in-game state for E2E assertions. */
export interface GameSnapshot {
  gameName: string;
  gameState: number;
  mySeat: number;
  currentPlayerNumber: number;
  /** Local player's per-resource hand counts, indexed by name. */
  myResources: Record<string, number> | null;
  /** Number of dev cards left in the deck. */
  deckDevCardCount: number;
  /** Total dev cards in the local player's inventory. */
  myInventorySize: number;
  /** Robber hex coordinate (0 = unplaced). */
  robberHex: number;
  /** Cities & Knights state, or null when this isn't a C&K game. */
  ck: CKSnapshot | null;
}

/** Read-only Cities & Knights slice of a {@link GameSnapshot}. */
export interface CKSnapshot {
  /** Local player's commodity counts. */
  commodities: { cloth: number; coin: number; paper: number };
  /** Local player's knight counts by level (total + active). */
  knights: {
    level1: { total: number; active: number };
    level2: { total: number; active: number };
    level3: { total: number; active: number };
  };
  /** Local player's improvement-track levels (0..5). */
  improvements: { trade: number; politics: number; science: number };
  /** Game-level barbarian strength counter (0..7). */
  barbarianStrength: number;
  /** Metropolis owner seat per track (Trade/Politics/Science), -1 = unclaimed. */
  metropolisOwners: number[];
  /** Local player's progress-card hand as itypes (11..19). */
  progressHand: number[];
}

/**
 * Install the `window.__jsettlers` test bridge. Safe to call once at startup;
 * idempotent (re-assigns the same object). No-op if `window` is unavailable.
 */
export function installTestHooks(): void {
  if (typeof window === 'undefined') {
    return; // <--- Early return: no DOM (SSR / unit env) ---
  }

  const hooks: JSettlersTestHooks = {
    sendDebug: (text: string): boolean => {
      const cg = useGameStore.getState().currentGame;
      if (cg === null) {
        return false;
      }
      sendDebug(text);
      return true;
    },
    hasConnection: (): boolean => getConnection() !== null,
    gameSnapshot: (): GameSnapshot | null => {
      const cg = useGameStore.getState().currentGame;
      if (cg === null) {
        return null;
      }
      const myView = cg.mySeat >= 0 ? cg.playerViews[cg.mySeat] : null;
      const myInv = cg.myInventory;
      const invSize =
        sumBag(myInv.playable) + sumBag(myInv.newCards) + sumBag(myInv.vpCards);
      const myCk = myView != null ? myView.ck : null;
      const ck: CKSnapshot | null = cg.isCKGame
        ? {
            commodities:
              myCk != null
                ? { ...myCk.commodities }
                : { cloth: 0, coin: 0, paper: 0 },
            knights: {
              level1: {
                total: myCk?.knights.lv1 ?? 0,
                active: myCk?.knights.activeLv1 ?? 0,
              },
              level2: {
                total: myCk?.knights.lv2 ?? 0,
                active: myCk?.knights.activeLv2 ?? 0,
              },
              level3: {
                total: myCk?.knights.lv3 ?? 0,
                active: myCk?.knights.activeLv3 ?? 0,
              },
            },
            improvements:
              myCk != null
                ? { ...myCk.improvements }
                : { trade: 0, politics: 0, science: 0 },
            barbarianStrength: cg.ckBarbarianStrength,
            metropolisOwners: [...cg.ckMetropolisOwners],
            progressHand: [...cg.myProgressHand],
          }
        : null;
      return {
        gameName: cg.gameName,
        gameState: cg.gameState,
        mySeat: cg.mySeat,
        currentPlayerNumber: cg.currentPlayerNumber,
        myResources: myView != null ? { ...myView.resources } : null,
        deckDevCardCount: cg.deckDevCardCount,
        myInventorySize: invSize,
        robberHex: cg.board != null ? cg.board.robberHex : 0,
        ck,
      };
    },
  };

  (window as unknown as { __jsettlers?: JSettlersTestHooks }).__jsettlers = hooks;
}

/** Sum the counts in a dev-card bag. */
function sumBag(bag: Record<number, number>): number {
  let n = 0;
  for (const v of Object.values(bag)) {
    n += v;
  }
  return n;
}
