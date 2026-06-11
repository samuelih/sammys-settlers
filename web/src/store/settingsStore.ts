import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { setSoundEnabled, setSoundVolume } from '../util/sound';

/**
 * User preferences store (Phase 4). Holds the cross-cutting display /
 * accessibility / sound settings that are independent of the in-game protocol,
 * persisted to localStorage so they survive reloads.
 *
 * Each setting is wired to a real document-level effect by {@link applyEffects},
 * which runs on rehydration and after every setter:
 *  - {@link ThemeMode}        -> `data-theme` on <html> (light/dark, resolving
 *                                `system` against the OS `prefers-color-scheme`).
 *  - {@link ColorBlindMode}   -> `data-theme-cb` on <html> (player/resource
 *                                palette remap; composes on top of the theme).
 *  - {@link RenderQuality}    -> `data-render-quality` on <html>; the board reads
 *                                it to drop shadows/animations at `low`.
 *  - {@link SettingsState.fontScale} -> `--font-scale` CSS var on <html>.
 *  - sound on/off + volume    -> forwarded to the WebAudio sound util.
 *
 * tokens.css owns the `data-theme` / `data-theme-cb` / `data-render-quality` /
 * `--font-scale` definitions; this store only sets the attributes/vars.
 */

/** Light, dark, or follow the OS `prefers-color-scheme`. */
export type ThemeMode = 'light' | 'dark' | 'system';

/**
 * Color-blind-safe palette selection. `none` leaves the default palette in
 * place; the others map to a `data-theme-cb` value defined in tokens.css.
 */
export type ColorBlindMode =
  | 'none'
  | 'deuteranopia'
  | 'protanopia'
  | 'tritanopia';

/** Board rendering quality; `low` disables shadows/animations for weak GPUs. */
export type RenderQuality = 'low' | 'high';

export interface SettingsState {
  /** Theme preference; `system` follows the OS at apply time. */
  theme: ThemeMode;
  /** Color-blind-safe palette, or `none`. */
  colorBlindMode: ColorBlindMode;
  /** Whether UI/game sound effects play. */
  soundEnabled: boolean;
  /** Master sound volume, 0..1. */
  soundVolume: number;
  /** Board rendering quality. */
  renderQuality: RenderQuality;
  /** Typography scale multiplier applied via the `--font-scale` CSS var. */
  fontScale: number;

  setTheme: (theme: ThemeMode) => void;
  setColorBlindMode: (mode: ColorBlindMode) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setSoundVolume: (volume: number) => void;
  setRenderQuality: (quality: RenderQuality) => void;
  setFontScale: (scale: number) => void;
  /** Reset every setting to its default and re-apply effects. */
  reset: () => void;
  /**
   * Reflect the current settings onto the document root + sound util. Safe to
   * call when there is no DOM (no-ops outside the browser).
   */
  applyEffects: () => void;
}

/** Allowed font-scale range (matches the slider in SettingsScreen). */
export const FONT_SCALE_MIN = 0.8;
export const FONT_SCALE_MAX = 1.6;

/** Map a {@link ColorBlindMode} to its `data-theme-cb` attribute, or null. */
function colorBlindAttr(mode: ColorBlindMode): string | null {
  return mode === 'none' ? null : mode;
}

/**
 * Resolve a {@link ThemeMode} to a concrete `light`/`dark` for the DOM,
 * consulting the OS preference for `system`. Falls back to `light` when
 * `matchMedia` is unavailable (jsdom / SSR).
 */
export function resolveTheme(theme: ThemeMode): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') {
    return theme; // <--- Early return: explicit choice, no OS lookup ---
  }
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return 'light';
}

/** Clamp the font scale into the supported range, ignoring NaN. */
export function clampFontScale(raw: number): number {
  if (Number.isNaN(raw)) {
    return 1; // <--- Early return: non-numeric input -> default scale ---
  }
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, raw));
}

const DEFAULTS = {
  theme: 'system' as ThemeMode,
  colorBlindMode: 'none' as ColorBlindMode,
  soundEnabled: true,
  soundVolume: 0.5,
  renderQuality: 'high' as RenderQuality,
  fontScale: 1,
};

/**
 * Apply the given settings to the document root and sound util. Extracted so
 * both setters and the persist `onRehydrateStorage` hook share one code path.
 * No-ops when there's no DOM.
 */
function applySettingsToDom(s: {
  theme: ThemeMode;
  colorBlindMode: ColorBlindMode;
  renderQuality: RenderQuality;
  fontScale: number;
  soundEnabled: boolean;
  soundVolume: number;
}): void {
  // Sound util has its own (no-op-on-server) guards.
  setSoundEnabled(s.soundEnabled);
  setSoundVolume(s.soundVolume);

  if (typeof document === 'undefined') {
    return; // <--- Early return: no DOM (SSR) ---
  }
  const root = document.documentElement;
  root.setAttribute('data-theme', resolveTheme(s.theme));

  const cb = colorBlindAttr(s.colorBlindMode);
  if (cb == null) {
    root.removeAttribute('data-theme-cb');
  } else {
    root.setAttribute('data-theme-cb', cb);
  }

  root.setAttribute('data-render-quality', s.renderQuality);
  root.style.setProperty('--font-scale', String(s.fontScale));
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => {
      /** Mutate state then re-apply DOM/sound effects in one shot. */
      const update = (patch: Partial<SettingsState>): void => {
        set(patch);
        applySettingsToDom(get());
      };
      return {
        ...DEFAULTS,

        setTheme: (theme) => update({ theme }),
        setColorBlindMode: (colorBlindMode) => update({ colorBlindMode }),
        setSoundEnabled: (soundEnabled) => update({ soundEnabled }),
        setSoundVolume: (soundVolume) =>
          update({ soundVolume: Math.min(1, Math.max(0, soundVolume)) }),
        setRenderQuality: (renderQuality) => update({ renderQuality }),
        setFontScale: (fontScale) =>
          update({ fontScale: clampFontScale(fontScale) }),
        reset: () => update({ ...DEFAULTS }),
        applyEffects: () => applySettingsToDom(get()),
      };
    },
    {
      name: 'jsettlers.settings',
      // Persist only data, not the action functions.
      partialize: (s) => ({
        theme: s.theme,
        colorBlindMode: s.colorBlindMode,
        soundEnabled: s.soundEnabled,
        soundVolume: s.soundVolume,
        renderQuality: s.renderQuality,
        fontScale: s.fontScale,
      }),
      // Re-apply effects once the persisted values are restored.
      onRehydrateStorage: () => (state) => {
        state?.applyEffects();
      },
    },
  ),
);

/**
 * Apply the current settings immediately on module load so the initial paint
 * (and tests that import the store directly) reflect saved preferences without
 * waiting for a component to mount.
 */
useSettingsStore.getState().applyEffects();
