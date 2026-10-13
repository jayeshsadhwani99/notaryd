import { configureStore } from '@reduxjs/toolkit';
import { projectsReducer } from '@/features/projects/projects-slice';
import { sessionReducer } from '@/features/session/session-slice';
import { themeReducer } from '@/features/theme/theme-slice';

export const store = configureStore({
  reducer: {
    theme: themeReducer,
    session: sessionReducer,
    projects: projectsReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
