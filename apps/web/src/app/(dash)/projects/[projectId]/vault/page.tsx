'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { SecretDialog } from '@/features/vault/secret-dialog';
import { SecretEditDialog } from '@/features/vault/secret-edit-dialog';
import { SecretList, type SecretRow } from '@/features/vault/secret-list';
import { ErrorAlert } from '@/components/feedback/error-alert';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';

type Env = { name: string; productionConfirmedAt: string | null; secrets: SecretRow[] };

export default function VaultPage({ params }: { params: Promise<{ projectId: string }> }) {
  const [projectId, setProjectId] = useState('');
  const [envs, setEnvs] = useState<Env[]>([]);
  const [environment, setEnvironment] = useState('sandbox');
  const [shown, setShown] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const current = envs.find((item) => item.name === environment);

  function load(id: string) {
    api<{ environments: Env[] }>(`/projects/${id}/vault`).then((data) => setEnvs(data.environments)).catch((err) => setError(err.message));
  }

  useEffect(() => {
    params.then(({ projectId: id }) => { setProjectId(id); load(id); });
  }, [params]);

  async function reveal(key: string) {
    const result = await api<{ key: string; value: string }>(`/projects/${projectId}/vault/reveal`, {
      method: 'POST',
      body: JSON.stringify({ environment, key }),
    }).catch((err) => { setError(err.message); return null; });
    if (result) setShown((currentShown) => ({ ...currentShown, [result.key]: result.value }));
  }

  function hide(key: string) {
    setShown((currentShown) => {
      const next = { ...currentShown };
      delete next[key];
      return next;
    });
  }

  return (
    <>
      <PageHeader
        title="Vault"
        description="Environment variables for this app, encrypted. Notaryd injects them when it boots a sandbox."
        actions={(
          <>
            <Button variant="outline" aria-label="Add a variable" onClick={() => setEditing('new')}><Plus /> Add variable</Button>
            <Button aria-label="Paste a .env" onClick={() => setPasteOpen(true)}>Paste .env</Button>
          </>
        )}
      />
      <Tabs value={environment} onValueChange={(value) => { setEnvironment(value); setShown({}); }}>
        <TabsList>{['sandbox', 'staging', 'production'].map((env) => <TabsTrigger key={env} value={env} className="capitalize">{env}</TabsTrigger>)}</TabsList>
      </Tabs>
      <ErrorAlert message={error} />
      {environment === 'production' && current && !current.productionConfirmedAt ? (
        <Button variant="outline" aria-label="Confirm production secrets" onClick={() => api(`/projects/${projectId}/environments/production/confirm`, { method: 'POST' }).then(() => load(projectId)).catch((err) => setError(err.message))}>Confirm production before saving</Button>
      ) : null}
      <SecretList secrets={current?.secrets ?? []} shown={shown} onReveal={reveal} onHide={hide} onEdit={setEditing} />
      {projectId ? <SecretDialog projectId={projectId} environment={environment} open={pasteOpen} onOpenChange={setPasteOpen} onSaved={() => { setShown({}); load(projectId); }} /> : null}
      {projectId ? (
        <SecretEditDialog
          key={editing ?? 'closed'}
          projectId={projectId}
          environment={environment}
          secretKey={editing && editing !== 'new' ? editing : null}
          open={editing !== null}
          onOpenChange={(open) => { if (!open) setEditing(null); }}
          onSaved={(key) => { hide(key); load(projectId); }}
        />
      ) : null}
    </>
  );
}
