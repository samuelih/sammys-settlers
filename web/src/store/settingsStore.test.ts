// Unit tests for settingsStore: pure reducers (clamping, defaults, reset) and
// that toggling theme / color-blind / quality / font-scale reflects onto the
// document root attributes + CSS var. No network, no React.

import { beforeEach, describe, expect, it } from 'vitest';

import { isSoundEnabled } from '../util/sound';
import {
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  clampFontScale,
  resolveTheme,
  useSettingsStore,
} from './settingsStore';

const root = document.documentElement;

/** Reset to defaults (also re-applies effects) before each test. */
beforeEach(() => {
  useSettingsStore.getState().reset();
});

describe('settingsStore reducers', () => {
  it('starts from sane defaults', () => {
    useSettingsStore.getState().reset();
    const s = useSettingsStore.getState();
    expect(s.theme).toBe('system');
    expect(s.colorBlindMode).toBe('none');
    expect(s.soundEnabled).toBe(true);
    expect(s.soundVolume).toBe(0.5);
    expect(s.renderQuality).toBe('high');
    expect(s.fontScale).toBe(1);
  });

  it('setTheme / setColorBlindMode / setRenderQuality update state', () => {
    const s = useSettingsStore.getState();
    s.setTheme('dark');
    s.setColorBlindMode('protanopia');
    s.setRenderQuality('low');
    const next = useSettingsStore.getState();
    expect(next.theme).toBe('dark');
    expect(next.colorBlindMode).toBe('protanopia');
    expect(next.renderQuality).toBe('low');
  });

  it('clamps sound volume to [0, 1]', () => {
    const s = useSettingsStore.getState();
    s.setSoundVolume(5);
    expect(useSettingsStore.getState().soundVolume).toBe(1);
    s.setSoundVolume(-2);
    expect(useSettingsStore.getState().soundVolume).toBe(0);
    s.setSoundVolume(0.3);
    expect(useSettingsStore.getState().soundVolume).toBeCloseTo(0.3);
  });

  it('clamps font scale to its range', () => {
    const s = useSettingsStore.getState();
    s.setFontScale(99);
    expect(useSettingsStore.getState().fontScale).toBe(FONT_SCALE_MAX);
    s.setFontScale(0);
    expect(useSettingsStore.getState().fontScale).toBe(FONT_SCALE_MIN);
  });

  it('toggling sound off forwards to the sound util', () => {
    useSettingsStore.getState().setSoundEnabled(false);
    expect(isSoundEnabled()).toBe(false);
    useSettingsStore.getState().setSoundEnabled(true);
    expect(isSoundEnabled()).toBe(true);
  });

  it('reset restores defaults after edits', () => {
    const s = useSettingsStore.getState();
    s.setTheme('dark');
    s.setRenderQuality('low');
    s.setFontScale(1.4);
    s.reset();
    const next = useSettingsStore.getState();
    expect(next.theme).toBe('system');
    expect(next.renderQuality).toBe('high');
    expect(next.fontScale).toBe(1);
  });
});

describe('clampFontScale / resolveTheme helpers', () => {
  it('clampFontScale handles NaN and bounds', () => {
    expect(clampFontScale(Number.NaN)).toBe(1);
    expect(clampFontScale(10)).toBe(FONT_SCALE_MAX);
    expect(clampFontScale(0)).toBe(FONT_SCALE_MIN);
    expect(clampFontScale(1.1)).toBeCloseTo(1.1);
  });

  it('resolveTheme passes explicit choices through', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
    // `system` resolves to light/dark depending on env; just assert it's one.
    expect(['light', 'dark']).toContain(resolveTheme('system'));
  });
});

describe('settingsStore document effects', () => {
  it('theme writes data-theme on the document root', () => {
    useSettingsStore.getState().setTheme('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    useSettingsStore.getState().setTheme('light');
    expect(root.getAttribute('data-theme')).toBe('light');
  });

  it('color-blind mode toggles data-theme-cb (removed when none)', () => {
    useSettingsStore.getState().setColorBlindMode('deuteranopia');
    expect(root.getAttribute('data-theme-cb')).toBe('deuteranopia');
    useSettingsStore.getState().setColorBlindMode('tritanopia');
    expect(root.getAttribute('data-theme-cb')).toBe('tritanopia');
    useSettingsStore.getState().setColorBlindMode('none');
    expect(root.hasAttribute('data-theme-cb')).toBe(false);
  });

  it('render quality writes data-render-quality', () => {
    useSettingsStore.getState().setRenderQuality('low');
    expect(root.getAttribute('data-render-quality')).toBe('low');
    useSettingsStore.getState().setRenderQuality('high');
    expect(root.getAttribute('data-render-quality')).toBe('high');
  });

  it('font scale writes the --font-scale CSS var', () => {
    useSettingsStore.getState().setFontScale(1.25);
    expect(root.style.getPropertyValue('--font-scale')).toBe('1.25');
  });
});
