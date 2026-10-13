'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ErrorAlert } from '@/components/feedback/error-alert';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

export function OverviewActions({
  projectId,
  authPlanId,
  onDone,
}: {
  projectId: string;
  authPlanId: string | null;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const router = useRouter();

  async function run(path: string, label: string) {
    setBusy(label);
    setError('');
    try {
      const result = await api<{ runId?: string }>(path, { method: 'POST', body: '{}' });
      if (result.runId) router.push(`/projects/${projectId}/runs/${result.runId}`);
      else onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not run that action');
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!!busy} aria-label="Review code" onClick={() => run(`/projects/${projectId}/review`, 'Review')}>{busy === 'Review' ? 'Reviewing…' : 'Review code'}</Button>
        {authPlanId ? (
          <Button variant="outline" disabled={!!busy} aria-label="Approve auth plan" onClick={() => run(`/projects/${projectId}/auth-plan/approve`, 'Approve')}>{busy === 'Approve' ? 'Approving…' : 'Approve auth plan'}</Button>
        ) : null}
      </div>
      <ErrorAlert message={error} />
    </div>
  );
}
