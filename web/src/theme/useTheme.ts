import { useCallback } from 'react';

import { resolveTheme, useSettingsStore } from '../store/settingsStore';

// Theme hook. Thin adapter over the single source of truth in
// `store/settingsStore` (which persists the choice and reflects it onto the
// document root via `data-theme`, resolving `system` against the OS). Kept so
// the header theme toggle (AppFrame) has a simple light/dark API; the full
// theme/colorblind/sound/etc. controls live in SettingsScreen.

/** Concrete applied theme for the header toggle (no `system`). */
export type ThemeMode = 'light' | 'dark';

export function useTheme(): {
  /** The currently *applied* theme (`system` resolved to light/dark). */
  theme: ThemeMode;
  /** Flip between the applied light and dark themes. */
  toggleTheme: () => void;
} {
  const mode = useSettingsStore((s) => s.theme);
  const setMode = useSettingsStore((s) => s.setTheme);

  const theme = resolveTheme(mode);

  const toggleTheme = useCallback(
    () => setMode(theme === 'dark' ? 'light' : 'dark'),
    [setMode, theme],
  );

  return { theme, toggleTheme };
}
