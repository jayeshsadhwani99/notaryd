export type SessionUser = { name: string; email: string; orgName: string };

export type SessionState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  user: SessionUser | null;
  error: string;
};
