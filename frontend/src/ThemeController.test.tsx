import { fireEvent, render, screen } from '@testing-library/react';
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
});
