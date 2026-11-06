import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { ThemeModeContext } from './theme-context';
import type { ThemeMode } from './theme-context';

function initialTheme(): ThemeMode {
  const prepaint = document.documentElement.dataset.theme;
  if (prepaint === 'dark' || prepaint === 'light') return prepaint;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
}

export default function ThemeController({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(initialTheme);
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-color-scheme: dark)');
    const change = () => {
      try {
        const stored = localStorage.getItem('pernova.theme');
        if (stored === 'light' || stored === 'dark') return;
      } catch {
        /* System preference still works without storage. */
      }
      const next = preference?.matches ? 'dark' : 'light';
      applyTheme(next);
      setMode(next);
    };
    preference?.addEventListener('change', change);
    return () => preference?.removeEventListener('change', change);
  }, []);
  const toggle = () => {
    const next = mode === 'light' ? 'dark' : 'light';
    applyTheme(next);
    try {
      localStorage.setItem('pernova.theme', next);
    } catch {
      /* The theme remains usable for this page session. */
    }
    setMode(next);
  };
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode,
          primary: { main: mode === 'dark' ? '#b5a0ff' : '#6952d8', dark: '#503cb1' },
          secondary: { main: mode === 'dark' ? '#70cfc5' : '#087d80' },
          background: {
            default: mode === 'dark' ? '#0d1527' : '#f6f7fb',
            paper: mode === 'dark' ? '#172139' : '#ffffff',
          },
          text: {
            primary: mode === 'dark' ? '#e5eaf7' : '#172441',
            secondary: mode === 'dark' ? '#acb9d1' : '#637089',
          },
          success: { main: mode === 'dark' ? '#76d3b5' : '#13745b' },
          warning: { main: mode === 'dark' ? '#e6bb76' : '#996016' },
          error: { main: mode === 'dark' ? '#f29cb2' : '#be3555' },
        },
        typography: {
          fontFamily: '"Inter", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif',
          button: { textTransform: 'none', fontWeight: 650 },
        },
        shape: { borderRadius: 12 },
        components: {
          MuiButton: { defaultProps: { disableElevation: true } },
          MuiTextField: { defaultProps: { size: 'small' } },
          MuiSelect: { defaultProps: { size: 'small' } },
          MuiTooltip: { defaultProps: { arrow: true } },
          MuiPaper: { defaultProps: { elevation: 0 } },
        },
      }),
    [mode],
  );
  return (
    <ThemeModeContext.Provider value={{ mode, toggle }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}
