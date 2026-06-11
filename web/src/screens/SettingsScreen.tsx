import { useId } from 'react';

import { Button, Dialog } from '../components';
import {
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  useSettingsStore,
} from '../store/settingsStore';
import type {
  ColorBlindMode,
  RenderQuality,
  ThemeMode,
} from '../store/settingsStore';
import { useUiStore } from '../store/uiStore';
import { playSound } from '../util/sound';
import styles from './SettingsScreen.module.css';

const THEME_OPTIONS: ReadonlyArray<{ value: ThemeMode; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const COLORBLIND_OPTIONS: ReadonlyArray<{
  value: ColorBlindMode;
  label: string;
}> = [
  { value: 'none', label: 'None' },
  { value: 'deuteranopia', label: 'Deuteranopia (red-green)' },
  { value: 'protanopia', label: 'Protanopia (red-green)' },
  { value: 'tritanopia', label: 'Tritanopia (blue-yellow)' },
];

const QUALITY_OPTIONS: ReadonlyArray<{ value: RenderQuality; label: string }> =
  [
    { value: 'high', label: 'High (shadows + animation)' },
    { value: 'low', label: 'Low (faster, flat)' },
  ];

/**
 * Settings panel (Phase 4): theme, color-blind palette, sound, board rendering
 * quality, and font scale. Each control is bound to {@link useSettingsStore},
 * which persists the choice and applies the real document-level effect. Self-
 * hides when {@code settingsOpen} is false.
 */
export function SettingsScreen(): JSX.Element | null {
  const open = useUiStore((s) => s.settingsOpen);
  const setOpen = useUiStore((s) => s.setSettingsOpen);

  const theme = useSettingsStore((s) => s.theme);
  const colorBlindMode = useSettingsStore((s) => s.colorBlindMode);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const soundVolume = useSettingsStore((s) => s.soundVolume);
  const renderQuality = useSettingsStore((s) => s.renderQuality);
  const fontScale = useSettingsStore((s) => s.fontScale);

  const setTheme = useSettingsStore((s) => s.setTheme);
  const setColorBlindMode = useSettingsStore((s) => s.setColorBlindMode);
  const setSoundEnabled = useSettingsStore((s) => s.setSoundEnabled);
  const setSoundVolume = useSettingsStore((s) => s.setSoundVolume);
  const setRenderQuality = useSettingsStore((s) => s.setRenderQuality);
  const setFontScale = useSettingsStore((s) => s.setFontScale);
  const reset = useSettingsStore((s) => s.reset);

  const themeId = useId();
  const cbId = useId();
  const soundToggleId = useId();
  const volumeId = useId();
  const qualityId = useId();
  const fontId = useId();

  if (!open) {
    return null; // <--- Early return: settings closed ---
  }

  return (
    <Dialog
      open
      title="Settings"
      onClose={() => setOpen(false)}
      footer={
        <div className={styles.footerActions}>
          <Button
            variant="ghost"
            size="sm"
            data-testid="settings-reset"
            onClick={() => reset()}
          >
            Reset to defaults
          </Button>
        </div>
      }
    >
      <div className={styles.body} data-testid="settings-body">
        {/* ---- Theme --------------------------------------------------- */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor={themeId}>
            Theme
          </label>
          <select
            id={themeId}
            className={styles.select}
            data-testid="settings-theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemeMode)}
          >
            {THEME_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* ---- Color-blind palette ------------------------------------- */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor={cbId}>
            Color-blind palette
          </label>
          <select
            id={cbId}
            className={styles.select}
            data-testid="settings-colorblind"
            value={colorBlindMode}
            onChange={(e) =>
              setColorBlindMode(e.target.value as ColorBlindMode)
            }
          >
            {COLORBLIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className={styles.hint}>
            Remaps player and resource colors for distinguishability.
          </span>
        </div>

        {/* ---- Sound --------------------------------------------------- */}
        <div className={styles.field} data-testid="settings-sound">
          <span className={styles.label}>Sound</span>
          <div className={styles.inline}>
            <label className={styles.toggle} htmlFor={soundToggleId}>
              <input
                id={soundToggleId}
                type="checkbox"
                data-testid="settings-sound-toggle"
                checked={soundEnabled}
                onChange={(e) => {
                  setSoundEnabled(e.target.checked);
                  if (e.target.checked) {
                    // Audible confirmation that sound is back on.
                    playSound('click');
                  }
                }}
              />
              <span>{soundEnabled ? 'On' : 'Off'}</span>
            </label>
          </div>
          <div className={styles.inline}>
            <label className={styles.hint} htmlFor={volumeId}>
              Volume
            </label>
            <input
              id={volumeId}
              className={styles.slider}
              type="range"
              data-testid="settings-sound-volume"
              min={0}
              max={1}
              step={0.05}
              value={soundVolume}
              disabled={!soundEnabled}
              onChange={(e) => setSoundVolume(e.target.valueAsNumber)}
            />
            <span className={styles.value}>
              {Math.round(soundVolume * 100)}%
            </span>
          </div>
        </div>

        {/* ---- Rendering quality --------------------------------------- */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor={qualityId}>
            Rendering quality
          </label>
          <select
            id={qualityId}
            className={styles.select}
            data-testid="settings-quality"
            value={renderQuality}
            onChange={(e) => setRenderQuality(e.target.value as RenderQuality)}
          >
            {QUALITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* ---- Font scale ---------------------------------------------- */}
        <div className={styles.field}>
          <label className={styles.label} htmlFor={fontId}>
            Font size
          </label>
          <div className={styles.inline}>
            <input
              id={fontId}
              className={styles.slider}
              type="range"
              data-testid="settings-fontscale"
              min={FONT_SCALE_MIN}
              max={FONT_SCALE_MAX}
              step={0.05}
              value={fontScale}
              onChange={(e) => setFontScale(e.target.valueAsNumber)}
            />
            <span className={styles.value}>
              {Math.round(fontScale * 100)}%
            </span>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
