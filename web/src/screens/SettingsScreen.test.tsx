// Tests for SettingsScreen: it renders the labeled controls inside
// settings-body and wiring each control updates settingsStore + the document
// root effects (data-theme / data-theme-cb / data-render-quality / --font-scale).

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useSettingsStore } from '../store/settingsStore';
import { useUiStore } from '../store/uiStore';
import { SettingsScreen } from './SettingsScreen';

const root = document.documentElement;

beforeEach(() => {
  useSettingsStore.getState().reset();
  useUiStore.getState().setSettingsOpen(true);
});

describe('SettingsScreen', () => {
  it('renders nothing when settings are closed', () => {
    useUiStore.getState().setSettingsOpen(false);
    render(<SettingsScreen />);
    expect(screen.queryByTestId('settings-body')).not.toBeInTheDocument();
  });

  it('renders all controls inside settings-body', () => {
    render(<SettingsScreen />);
    const body = screen.getByTestId('settings-body');
    expect(body).toBeInTheDocument();
    for (const id of [
      'settings-theme',
      'settings-colorblind',
      'settings-sound',
      'settings-quality',
      'settings-fontscale',
    ]) {
      expect(body).toContainElement(screen.getByTestId(id));
    }
  });

  it('changing theme select updates store + data-theme', () => {
    render(<SettingsScreen />);
    fireEvent.change(screen.getByTestId('settings-theme'), {
      target: { value: 'dark' },
    });
    expect(useSettingsStore.getState().theme).toBe('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
  });

  it('changing color-blind select updates store + data-theme-cb', () => {
    render(<SettingsScreen />);
    fireEvent.change(screen.getByTestId('settings-colorblind'), {
      target: { value: 'deuteranopia' },
    });
    expect(useSettingsStore.getState().colorBlindMode).toBe('deuteranopia');
    expect(root.getAttribute('data-theme-cb')).toBe('deuteranopia');
  });

  it('changing quality select updates store + data-render-quality', () => {
    render(<SettingsScreen />);
    fireEvent.change(screen.getByTestId('settings-quality'), {
      target: { value: 'low' },
    });
    expect(useSettingsStore.getState().renderQuality).toBe('low');
    expect(root.getAttribute('data-render-quality')).toBe('low');
  });

  it('moving font-scale slider updates store + --font-scale', () => {
    render(<SettingsScreen />);
    fireEvent.change(screen.getByTestId('settings-fontscale'), {
      target: { value: '1.3' },
    });
    expect(useSettingsStore.getState().fontScale).toBeCloseTo(1.3);
    expect(root.style.getPropertyValue('--font-scale')).toBe('1.3');
  });

  it('sound toggle disables the volume slider when off', () => {
    render(<SettingsScreen />);
    const volume = screen.getByTestId('settings-sound-volume');
    expect(volume).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('settings-sound-toggle'));
    expect(useSettingsStore.getState().soundEnabled).toBe(false);
    expect(screen.getByTestId('settings-sound-volume')).toBeDisabled();
  });

  it('reset button restores defaults', () => {
    render(<SettingsScreen />);
    fireEvent.change(screen.getByTestId('settings-theme'), {
      target: { value: 'dark' },
    });
    fireEvent.click(screen.getByTestId('settings-reset'));
    expect(useSettingsStore.getState().theme).toBe('system');
  });
});
