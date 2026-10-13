'use client';

import { useEffect, useState } from 'react';
import { AuditFilters } from '@/features/audit/audit-filters';
import { AuditTable, type AuditEntry } from '@/features/audit/audit-table';
import { ErrorAlert } from '@/components/feedback/error-alert';
import { PageHeader } from '@/components/layout/page-header';
import { api } from '@/lib/api';

export default function AuditPage({ params }: { params: Promise<{ projectId: string }> }) {
  const [projectId, setProjectId] = useState('');
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [result, setResult] = useState('any');
  const [trigger, setTrigger] = useState('any');
  const [error, setError] = useState('');

  useEffect(() => {
    params.then(({ projectId: id }) => setProjectId(id));
  }, [params]);

  useEffect(() => {
    if (!projectId) return;
    const query = new URLSearchParams();
    if (result !== 'any') query.set('result', result);
    if (trigger !== 'any') query.set('trigger', trigger);
    const suffix = query.toString() ? `?${query}` : '';
    api<{ entries: AuditEntry[] }>(`/projects/${projectId}/audit${suffix}`)
      .then((data) => { setEntries(data.entries); setError(''); })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the audit log'));
  }, [projectId, result, trigger]);

  return (
    <>
      <PageHeader title="Audit log" description="Each row is a summary. Open it for the flow, environment, and payload." />
      <AuditFilters result={result} trigger={trigger} onResult={setResult} onTrigger={setTrigger} />
      <ErrorAlert message={error} />
      <AuditTable projectId={projectId} entries={entries} />
    </>
  );
}
