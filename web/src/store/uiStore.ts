import { create } from 'zustand';

/** Top-level app views that sit alongside the connection/game flow. */
export type AppView = 'lobby' | 'mapEditor';

/**
 * Small UI-navigation store, kept separate from the game/connection store so
 * that in-game state churn doesn't re-render the shell and vice-versa. Holds the
 * top-level view (lobby vs the standalone map editor) and whether the Settings
 * panel is open.
 */
export interface UiStoreState {
  /** Current top-level view. The map editor is a standalone tool, usable even
   *  while disconnected; 'lobby' defers to the connection/game router. */
  appView: AppView;
  setAppView: (view: AppView) => void;
  /** Whether the Settings panel/modal is open. */
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  appView: 'lobby',
  setAppView: (appView) => set({ appView }),
  settingsOpen: false,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}));
