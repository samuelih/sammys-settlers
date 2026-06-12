import { useEffect } from 'react';

import { AppFrame, Button, ToastProvider } from './components';
import { Root } from './screens/Root';
import { SettingsScreen } from './screens/SettingsScreen';
import { isGameStarted, useGameStore } from './store/gameStore';
import { useSettingsStore } from './store/settingsStore';
import { useUiStore } from './store/uiStore';

/**
 * Thin application shell.
 *
 * Renders the design-system <AppFrame> (header + theme toggle) around the
 * <Root> router. The header carries top-level navigation: open the standalone
 * Map Editor, and open the Settings panel. The Settings modal overlays any view.
 */
export default function App(): JSX.Element {
  const appView = useUiStore((s) => s.appView);
  const setAppView = useUiStore((s) => s.setAppView);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const themeMode = useSettingsStore((s) => s.theme);
  const applyEffects = useSettingsStore((s) => s.applyEffects);

  // A started game owns the whole viewport (immersive "table" view); the
  // GameScreen carries its own rail with settings/theme/leave controls.
  const inStartedGame = useGameStore(
    (s) => s.currentGame !== null && isGameStarted(s.currentGame),
  );
  const immersive = inStartedGame && appView !== 'mapEditor';

  // Re-apply persisted settings to the document on mount (after rehydration),
  // and keep the `system` theme in sync with the OS color-scheme preference.
  useEffect(() => {
    applyEffects();
    if (themeMode !== 'system' || !window.matchMedia) {
      return;
    }
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (): void => applyEffects();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [applyEffects, themeMode]);

  const headerActions = (
    <>
      <Button
        variant="ghost"
        size="sm"
        data-testid="nav-map-editor"
        aria-pressed={appView === 'mapEditor'}
        onClick={() => setAppView(appView === 'mapEditor' ? 'lobby' : 'mapEditor')}
      >
        Map Editor
      </Button>
      <Button
        variant="ghost"
        size="sm"
        data-testid="nav-settings"
        onClick={() => setSettingsOpen(true)}
      >
        Settings
      </Button>
    </>
  );

  return (
    <ToastProvider>
      <AppFrame headerActions={headerActions} immersive={immersive}>
        <Root />
        <SettingsScreen />
      </AppFrame>
    </ToastProvider>
  );
}
