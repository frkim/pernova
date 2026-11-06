import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';
import ThemeController from './ThemeController';
import { useThemeMode } from './theme-context';

function ThemeTestControl() {
  const { mode, toggle } = useThemeMode();
  return <button onClick={toggle}>Thème {mode}</button>;
}

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('accessible persistent presentation theme', () => {
  it('uses the system preference before paint unless a stored choice overrides it', () => {
    const source = readFileSync(resolve('public', 'theme.js'), 'utf8');
    const element = { dataset: { theme: '' }, style: { colorScheme: '' } };
    const storage = { getItem: vi.fn().mockReturnValue(null) };
    const context = {
      localStorage: storage,
      window: { matchMedia: () => ({ matches: true }) },
      document: { documentElement: element },
    };
    runInNewContext(source, context);
    expect(element.dataset.theme).toBe('dark');
    storage.getItem.mockReturnValue('light');
    runInNewContext(source, context);
    expect(element.dataset.theme).toBe('light');
  });

  it('toggles both CSS and MUI mode and persists the explicit preference', () => {
    document.documentElement.dataset.theme = 'light';
    render(
      <ThemeController>
        <ThemeTestControl />
      </ThemeController>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Thème light' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('pernova.theme')).toBe('dark');
    expect(screen.getByRole('button', { name: 'Thème dark' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Thème dark' }));
    expect(localStorage.getItem('pernova.theme')).toBe('light');
  });

  it('uses the OS preference even if storage is blocked before first paint', () => {
    const source = readFileSync(resolve('public', 'theme.js'), 'utf8');
    const element = { dataset: { theme: '' }, style: { colorScheme: '' } };
    runInNewContext(source, {
      localStorage: {
        getItem: () => {
          throw new Error('Storage unavailable');
        },
      },
      window: { matchMedia: () => ({ matches: true }) },
      document: { documentElement: element },
    });
    expect(element.dataset.theme).toBe('dark');
    expect(element.style.colorScheme).toBe('dark');
  });

  it('follows OS changes until a user chooses a theme, even when persistence fails', () => {
    let change: (() => void) | undefined;
    const preference = {
      matches: false,
      addEventListener: vi.fn((_, listener: () => void) => {
        change = listener;
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('matchMedia', () => preference);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    const { unmount } = render(
      <ThemeController>
        <ThemeTestControl />
      </ThemeController>,
    );
    preference.matches = true;
    act(() => change?.());
    expect(screen.getByRole('button', { name: 'Thème dark' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Thème dark' }));
    act(() => change?.());
    expect(screen.getByRole('button', { name: 'Thème light' })).toBeVisible();
    unmount();
    expect(preference.removeEventListener).toHaveBeenCalledWith('change', change);
  });

  it('synchronizes another tab’s preference and follows the OS after it is cleared', () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    localStorage.setItem('pernova.theme', 'light');
    render(
      <ThemeController>
        <ThemeTestControl />
      </ThemeController>,
    );
    expect(screen.getByRole('button', { name: 'Thème light' })).toBeVisible();
    fireEvent(window, new StorageEvent('storage', { key: 'pernova.theme', newValue: 'dark' }));
    expect(screen.getByRole('button', { name: 'Thème dark' })).toBeVisible();
    fireEvent(window, new StorageEvent('storage', { key: 'pernova.theme', newValue: 'light' }));
    fireEvent(window, new StorageEvent('storage', { key: 'pernova.theme', newValue: null }));
    expect(screen.getByRole('button', { name: 'Thème dark' })).toBeVisible();
  });
});
