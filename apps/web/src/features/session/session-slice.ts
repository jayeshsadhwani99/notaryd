import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api } from '@/lib/api';
import type { SessionState, SessionUser } from '@/features/session/session-types';

export const loadSession = createAsyncThunk('session/load', async () => {
  const data = await api<{ user: SessionUser }>('/auth/me');
  return data.user;
});

const initialState: SessionState = { status: 'idle', user: null, error: '' };

const sessionSlice = createSlice({
  name: 'session',
  initialState,
  reducers: {
    clearSession(state) {
      state.user = null;
      state.status = 'idle';
    },
  },
  extraReducers(builder) {
    builder
      .addCase(loadSession.pending, (state) => {
        state.status = 'loading';
        state.error = '';
      })
      .addCase(loadSession.fulfilled, (state, action) => {
        state.status = 'ready';
        state.user = action.payload;
      })
      .addCase(loadSession.rejected, (state, action) => {
        const unauthorized = action.error.name === 'Unauthorized';
        if (!unauthorized && state.user) {
          state.status = 'ready';
          return;
        }
        state.status = 'error';
        state.error = unauthorized ? 'Unauthorized' : action.error.message || 'Could not load the session';
        if (unauthorized) state.user = null;
      });
  },
});

export const { clearSession } = sessionSlice.actions;
export const sessionReducer = sessionSlice.reducer;
