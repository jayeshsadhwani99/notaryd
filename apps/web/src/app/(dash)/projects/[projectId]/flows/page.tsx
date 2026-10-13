'use client';

import { useEffect, useState } from 'react';
import { FlowBoard } from '@/features/flows/flow-board';
import type { Flow } from '@/features/flows/flow-types';
import { api } from '@/lib/api';

export default function FlowsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const [projectId, setProjectId] = useState('');
  const [flows, setFlows] = useState<Flow[]>([]);
  const [error, setError] = useState('');

  function load(id: string) {
    api<{ flows: Flow[] }>(`/projects/${id}/flows`).then((data) => setFlows(data.flows)).catch((err) => setError(err.message));
  }

  useEffect(() => {
    params.then(({ projectId: id }) => { setProjectId(id); load(id); });
  }, [params]);

  if (!projectId) return null;
  return <FlowBoard projectId={projectId} flows={flows} error={error} onReload={() => load(projectId)} />;
}
