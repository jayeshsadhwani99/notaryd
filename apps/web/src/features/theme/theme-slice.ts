import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ThemeMode } from '@/features/theme/theme-types';

type ThemeState = { mode: ThemeMode };

const themeSlice = createSlice({
  name: 'theme',
  initialState: { mode: 'system' } as ThemeState,
  reducers: {
    setThemeMode(state, action: PayloadAction<ThemeMode>) {
      state.mode = action.payload;
    },
  },
});

export const { setThemeMode } = themeSlice.actions;
export const themeReducer = themeSlice.reducer;
