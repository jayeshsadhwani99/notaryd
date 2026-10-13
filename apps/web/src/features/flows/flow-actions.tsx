'use client';

import { useState } from 'react';
import { RerunDialog } from '@/features/flows/rerun-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorAlert } from '@/components/feedback/error-alert';
import type { FlowDetail } from '@/features/flows/flow-types';
import { api } from '@/lib/api';

export function FlowActions({
  projectId, flowId, data, onReload,
}: { projectId: string; flowId: string; data: FlowDetail; onReload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rerunOpen, setRerunOpen] = useState(false);

  async function baseline() {
    setBusy(true);
    setError('');
    try {
      await api(`/flows/${flowId}/baseline`, { method: 'POST' });
      onReload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept the baseline');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} aria-label="Re-run this flow" onClick={() => setRerunOpen(true)}>Re-run this flow</Button>
        <Button variant="secondary" disabled={busy} aria-label="Accept as baseline" onClick={baseline}>{busy ? 'Saving…' : 'Accept as baseline'}</Button>
      </div>
      <ErrorAlert message={error} />
      {data.flow.blocked_reason ? <ErrorAlert message={`Blocked: ${data.flow.blocked_reason}`} /> : null}
      <Card>
        <CardHeader><CardTitle>History</CardTitle></CardHeader>
        <CardContent className="grid gap-1 text-xs text-muted-foreground">
          {data.history.length === 0 ? <p>No audit entries for this flow yet.</p> : null}
          {data.history.map((entry) => (
            <p key={entry.id}>{new Date(entry.created_at).toLocaleString()} · {entry.action} · {entry.result || '—'} · {entry.actor_label}</p>
          ))}
        </CardContent>
      </Card>
      <RerunDialog projectId={projectId} flowId={flowId} flowName={data.flow.name} open={rerunOpen} onOpenChange={setRerunOpen} />
    </div>
  );
}
