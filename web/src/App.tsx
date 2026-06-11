import { AppFrame, Button, ToastProvider } from './components';
import { Root } from './screens/Root';
import { SettingsScreen } from './screens/SettingsScreen';
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
      <AppFrame headerActions={headerActions}>
        <Root />
        <SettingsScreen />
      </AppFrame>
    </ToastProvider>
  );
}
