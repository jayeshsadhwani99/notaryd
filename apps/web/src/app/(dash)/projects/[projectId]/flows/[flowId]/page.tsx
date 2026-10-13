'use client';

import { useEffect, useState } from 'react';
import { ErrorAlert } from '@/components/feedback/error-alert';
import { StatusBadge } from '@/components/feedback/status-badge';
import { PageHeader } from '@/components/layout/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { FlowActions } from '@/features/flows/flow-actions';
import { FlowEditDialog } from '@/features/flows/flow-edit-dialog';
import { StepDialog } from '@/features/flows/step-dialog';
import { StepList } from '@/features/flows/step-list';
import type { FlowDetail } from '@/features/flows/flow-types';
import { api } from '@/lib/api';

export default function FlowDetailPage({ params }: { params: Promise<{ projectId: string; flowId: string }> }) {
  const [ids, setIds] = useState({ projectId: '', flowId: '' });
  const [data, setData] = useState<FlowDetail | null>(null);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState<number | null>(null);
  const [editingFlow, setEditingFlow] = useState(false);

  function load(flowId: string) {
    api<FlowDetail>(`/flows/${flowId}`).then(setData).catch((err) => setError(err.message));
  }

  useEffect(() => {
    params.then(({ projectId, flowId }) => { setIds({ projectId, flowId }); load(flowId); });
  }, [params]);

  if (!data) return error ? <ErrorAlert message={error} /> : <Skeleton className="h-24 w-full" />;
  return (
    <>
      <PageHeader
        title={data.flow.name}
        description={data.flow.goal ?? undefined}
        actions={(
          <>
            <Button variant="outline" size="sm" aria-label="Edit flow" onClick={() => setEditingFlow(true)}>Edit</Button>
            <StatusBadge value={`v${data.flow.version}`} />
            <StatusBadge value={data.flow.status} />
            <StatusBadge value={data.flow.confidence} />
          </>
        )}
      />
      <FlowActions projectId={ids.projectId} flowId={ids.flowId} data={data} onReload={() => load(ids.flowId)} />
      <StepList data={data} onEdit={setEdit} />
      <FlowEditDialog
        flowId={ids.flowId}
        name={data.flow.name}
        goal={data.flow.goal}
        owners={data.flow.owners ?? []}
        open={editingFlow}
        onOpenChange={setEditingFlow}
        onSaved={() => load(ids.flowId)}
      />
      {edit !== null ? (
        <StepDialog flowId={ids.flowId} steps={data.steps} index={edit} open onOpenChange={(open) => { if (!open) setEdit(null); }} onSaved={() => load(ids.flowId)} />
      ) : null}
    </>
  );
}
