import { Dialog } from '../components';
import { useUiStore } from '../store/uiStore';

/**
 * Settings panel (Phase 4): themes, color-blind palette, sound, rendering
 * quality, font size. This is the shell modal; the controls are filled in by
 * Phase 4. It self-hides when {@code settingsOpen} is false.
 */
export function SettingsScreen(): JSX.Element | null {
  const open = useUiStore((s) => s.settingsOpen);
  const setOpen = useUiStore((s) => s.setSettingsOpen);
  if (!open) {
    return null; // <--- Early return: settings closed ---
  }
  return (
    <Dialog open title="Settings" onClose={() => setOpen(false)}>
      <div data-testid="settings-body">
        <p>Settings are being set up.</p>
      </div>
    </Dialog>
  );
}
