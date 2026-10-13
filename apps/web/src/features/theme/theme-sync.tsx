'use client';

import { useEffect, useRef } from 'react';
import { applyTheme, readStoredTheme } from '@/features/theme/apply-theme';
import { setThemeMode } from '@/features/theme/theme-slice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

export function ThemeSync() {
  const dispatch = useAppDispatch();
  const mode = useAppSelector((state) => state.theme.mode);
  const ready = useRef(false);

  useEffect(() => {
    if (!ready.current) {
      ready.current = true;
      const stored = readStoredTheme();
      if (stored !== mode) {
        dispatch(setThemeMode(stored));
        return;
      }
    }
    applyTheme(mode);
    if (mode !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [dispatch, mode]);

  return null;
}
