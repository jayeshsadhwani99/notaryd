'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Play } from 'lucide-react';
import { ExploreDialog } from '@/features/explore/explore-dialog';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorAlert } from '@/components/feedback/error-alert';
import { StatusBadge } from '@/components/feedback/status-badge';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';

type Run = { id: string; kind: string; status: string; trigger: string; created_at: string };

export default function ExplorePage({ params }: { params: Promise<{ projectId: string }> }) {
  const [projectId, setProjectId] = useState('');
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    params.then(({ projectId: id }) => {
      setProjectId(id);
      api<{ runs: Run[] }>(`/projects/${id}/runs`).then((data) => setRuns(data.runs)).catch((err) => setError(err.message));
    });
  }, [params]);

  return (
    <>
      <PageHeader title="Runs" description="Map the app, then replay the flows a diff touches." actions={<Button aria-label="Start a run" onClick={() => setOpen(true)}><Play /> Start a run</Button>} />
      <ErrorAlert message={error} />
      {runs.length === 0 ? <EmptyState title="No runs yet" body="Start an exploration after the code review and auth plan." /> : null}
      <div className="grid gap-2">
        {runs.map((run) => (
          <Link key={run.id} href={`/projects/${projectId}/runs/${run.id}`} aria-label={`${run.kind} ${run.status}`} className="block rounded-lg">
            <Card className="hover:ring-primary/40">
              <CardContent className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium capitalize">{run.kind}</p>
                  <p className="text-xs text-muted-foreground">{run.trigger} · {new Date(run.created_at).toLocaleString()}</p>
                </div>
                <StatusBadge value={run.status} />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      {projectId ? <ExploreDialog projectId={projectId} open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
