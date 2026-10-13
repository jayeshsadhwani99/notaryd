'use client';

import { useEffect, useState } from 'react';
import { ErrorAlert } from '@/components/feedback/error-alert';
import { StatusBadge } from '@/components/feedback/status-badge';
import { PageHeader } from '@/components/layout/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { RunShot } from '@/features/runs/run-shot';
import { RunSide } from '@/features/runs/run-side';
import type { RunView } from '@/features/runs/run-types';
import { api } from '@/lib/api';

export default function RunPage({ params }: { params: Promise<{ projectId: string; runId: string }> }) {
  const [runId, setRunId] = useState('');
  const [data, setData] = useState<RunView | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    params.then(({ runId: id }) => {
      if (stop) return;
      setRunId(id);
      const tick = () => {
        api<RunView>(`/runs/${id}`).then((next) => { if (!stop) setData(next); }).catch((err: Error) => { if (!stop) setError(err.message); });
      };
      tick();
      timer = setInterval(tick, 2000);
    });
    return () => {
      stop = true;
      if (timer) clearInterval(timer);
    };
  }, [params]);

  const live = data?.run.status === 'queued' || data?.run.status === 'running';
  const shot = data?.run.progress?.screenshotId || data?.evidence.find((item) => item.kind === 'screenshot')?.id;
  return (
    <>
      <PageHeader
        title={data?.run.progress?.message || data?.run.summary || (runId ? 'Waiting for the worker' : 'Loading')}
        actions={data ? <><StatusBadge value={data.run.kind} /><StatusBadge value={data.run.status} /></> : <Skeleton className="h-5 w-16" />}
      />
      <ErrorAlert message={error || data?.run.error || ''} />
      <div className="grid gap-3 lg:grid-cols-2">
        <RunShot shotId={shot} live={!!live} />
        {data ? <RunSide data={data} /> : <Skeleton className="h-40 w-full" />}
      </div>
    </>
  );
}
