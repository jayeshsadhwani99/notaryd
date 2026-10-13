'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';
import { Skeleton } from '@/components/ui/skeleton';

export default function HomePage() {
  useEffect(() => {
    api('/auth/me')
      .then(() => {
        window.location.href = '/projects';
      })
      .catch(() => {
        window.location.href = '/login';
      });
  }, []);
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <div className="grid w-64 gap-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}
