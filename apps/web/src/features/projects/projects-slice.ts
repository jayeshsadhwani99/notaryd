import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { api } from '@/lib/api';
import type { ProjectSummary, ProjectsState } from '@/features/projects/project-types';

export const loadProjects = createAsyncThunk('projects/load', async () => {
  const data = await api<{ projects: ProjectSummary[] }>('/projects');
  return data.projects;
});

const initialState: ProjectsState = { status: 'idle', items: [], error: '' };

const projectsSlice = createSlice({
  name: 'projects',
  initialState,
  reducers: {
    setProjectIcon(state, action: PayloadAction<{ id: string; icon: string }>) {
      const project = state.items.find((item) => item.id === action.payload.id);
      if (project) project.icon = action.payload.icon;
    },
  },
  extraReducers(builder) {
    builder
      .addCase(loadProjects.pending, (state) => {
        state.status = 'loading';
        state.error = '';
      })
      .addCase(loadProjects.fulfilled, (state, action) => {
        state.status = 'ready';
        state.items = action.payload;
      })
      .addCase(loadProjects.rejected, (state, action) => {
        state.status = 'error';
        state.error = action.error.message || 'Could not load projects';
      });
  },
});

export const { setProjectIcon } = projectsSlice.actions;
export const projectsReducer = projectsSlice.reducer;
