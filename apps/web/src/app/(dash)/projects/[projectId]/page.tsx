'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ErrorAlert } from '@/components/feedback/error-alert';
import { StatusBadge } from '@/components/feedback/status-badge';
import { PageHeader } from '@/components/layout/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { OverviewActions } from '@/features/projects/overview-actions';
import { api } from '@/lib/api';

type Project = {
  name: string;
  mode: string;
  status: string;
  framework: string | null;
  targetUrl: string | null;
  localPath: string | null;
  repoUrl: string | null;
  focusPrompt: string | null;
};
type Payload = { project: Project; authPlan: { id: string; status: string } | null; counts: { flows: number; accounts: number } };

export default function ProjectOverview({ params }: { params: Promise<{ projectId: string }> }) {
  const [projectId, setProjectId] = useState('');
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    params.then(({ projectId: id }) => {
      setProjectId(id);
      api<Payload>(`/projects/${id}`).then(setData).catch((err) => setError(err.message));
    });
  }, [params, reloadKey]);

  if (!data) return error ? <ErrorAlert message={error} /> : <Skeleton className="h-24 w-full" />;
  const project = data.project;
  const proposed = data.authPlan?.status === 'proposed' ? data.authPlan.id : null;
  return (
    <>
      <PageHeader title={project.name} description={project.focusPrompt ?? 'No focus prompt yet.'} actions={<StatusBadge value={project.status} />} />
      <OverviewActions projectId={projectId} authPlanId={proposed} onDone={() => setReloadKey((value) => value + 1)} />
      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardHeader><CardTitle>Target</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">{project.targetUrl ?? project.localPath ?? project.repoUrl ?? 'Not set'}</CardContent></Card>
        <Card><CardHeader><CardTitle>Framework</CardTitle></CardHeader><CardContent className="text-sm">{project.framework ?? 'Unknown'}</CardContent></Card>
        <Card><CardHeader><CardTitle>Auth plan</CardTitle></CardHeader><CardContent className="text-sm capitalize text-muted-foreground">{data.authPlan?.status ?? 'No plan yet'}</CardContent></Card>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Link href={`/projects/${projectId}/accounts`} className="rounded-lg p-3 text-sm ring-1 ring-foreground/10 hover:bg-accent">{data.counts.accounts} accounts</Link>
        <Link href={`/projects/${projectId}/vault`} className="rounded-lg p-3 text-sm ring-1 ring-foreground/10 hover:bg-accent">Vault</Link>
        <Link href={`/projects/${projectId}/flows`} className="rounded-lg p-3 text-sm ring-1 ring-foreground/10 hover:bg-accent">{data.counts.flows} flows</Link>
      </div>
    </>
  );
}
