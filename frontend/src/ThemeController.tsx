import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import type {} from '@mui/x-data-grid/themeAugmentation';
import { ThemeModeContext } from './theme-context';
import type { ThemeMode } from './theme-context';

function storedTheme(): ThemeMode | null {
  try {
    const stored = localStorage.getItem('pernova.theme');
    return stored === 'dark' || stored === 'light' ? stored : null;
  } catch {
    return null;
  }
}

function initialTheme(): ThemeMode {
  const stored = storedTheme();
  if (stored) return stored;
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
  const explicitChoice = useRef(storedTheme());
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-color-scheme: dark)');
    const change = () => {
      if (explicitChoice.current) return;
      const next = preference?.matches ? 'dark' : 'light';
      applyTheme(next);
      setMode(next);
    };
    const synchronize = (event: StorageEvent) => {
      if (event.key !== 'pernova.theme' && event.key !== null) return;
      explicitChoice.current =
        event.newValue === 'dark' || event.newValue === 'light' ? event.newValue : null;
      const next = explicitChoice.current ?? (preference?.matches ? 'dark' : 'light');
      applyTheme(next);
      setMode(next);
    };
    preference?.addEventListener('change', change);
    window.addEventListener('storage', synchronize);
    return () => {
      preference?.removeEventListener('change', change);
      window.removeEventListener('storage', synchronize);
    };
  }, []);
  const toggle = () => {
    const next = mode === 'light' ? 'dark' : 'light';
    explicitChoice.current = next;
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
          MuiDataGrid: {
            styleOverrides: {
              root: {
                '&& .MuiTablePagination-selectLabel': { display: 'block' },
                '&& .MuiTablePagination-input': { display: 'inline-flex' },
                '& .MuiTablePagination-toolbar': { flexWrap: 'wrap' },
              },
            },
          },
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
