import { Button } from '../components';
import { useUiStore } from '../store/uiStore';

/**
 * Standalone visual board/map editor (Phase 5).
 *
 * This is the shell; the editor canvas, palette, validation and import/export
 * are filled in by the map-editor module under web/src/map-editor/. The "Back"
 * action returns to the lobby/connect flow via the UI store's appView.
 */
export function MapEditorScreen(): JSX.Element {
  const setAppView = useUiStore((s) => s.setAppView);
  return (
    <div data-testid="map-editor-screen">
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
        <h2 style={{ margin: 0 }}>Map Editor</h2>
        <Button variant="ghost" size="sm" data-testid="map-editor-back" onClick={() => setAppView('lobby')}>
          ← Back
        </Button>
      </header>
      <p data-testid="map-editor-placeholder">The map editor is being set up.</p>
    </div>
  );
}
