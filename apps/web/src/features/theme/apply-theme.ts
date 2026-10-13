import { themeStorageKey, type ThemeMode } from '@/features/theme/theme-types';

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode;
}

export function applyTheme(mode: ThemeMode) {
  document.documentElement.classList.toggle('dark', resolveTheme(mode) === 'dark');
  localStorage.setItem(themeStorageKey, mode);
}

export function readStoredTheme(): ThemeMode {
  const stored = localStorage.getItem(themeStorageKey);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'system';
}
