'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { loadProjects } from '@/features/projects/projects-slice';
import { loadSession } from '@/features/session/session-slice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

export function ShellData() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const sessionStatus = useAppSelector((state) => state.session.status);
  const sessionError = useAppSelector((state) => state.session.error);

  useEffect(() => {
    dispatch(loadSession());
    dispatch(loadProjects());
  }, [dispatch]);

  useEffect(() => {
    if (sessionStatus === 'error' && sessionError === 'Unauthorized') router.replace('/login');
  }, [router, sessionError, sessionStatus]);

  return null;
}
