'use client';

import { Provider } from 'react-redux';
import { Toaster } from '@/components/ui/sonner';
import { ThemeSync } from '@/features/theme/theme-sync';
import { store } from '@/store/store';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <ThemeSync />
      {children}
      <Toaster />
    </Provider>
  );
}
