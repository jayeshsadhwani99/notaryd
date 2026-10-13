'use client';

import { FormEvent, useState } from 'react';
import { ErrorAlert } from '@/components/feedback/error-alert';
import { Field } from '@/components/forms/field';
import { AppDialog } from '@/components/modal/app-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

export function ExploreDialog({ projectId, open, onOpenChange }: { projectId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const created = await api<{ runId: string }>(`/projects/${projectId}/explore`, {
        method: 'POST',
        body: JSON.stringify({ branch: form.get('branch'), focusPrompt: form.get('focusPrompt') }),
      });
      window.location.href = `/projects/${projectId}/runs/${created.runId}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start');
      setBusy(false);
    }
  }

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title="Start a run" description="A focus prompt narrows which routes get mapped.">
      <form className="grid gap-3" onSubmit={onSubmit}>
        <Field label="Branch" htmlFor="branch"><Input id="branch" name="branch" placeholder="main" /></Field>
        <Field label="Focus" htmlFor="focusPrompt"><Input id="focusPrompt" name="focusPrompt" placeholder="only checkout and refunds" /></Field>
        <ErrorAlert message={error} />
        <Button type="submit" disabled={busy}>{busy ? 'Starting…' : 'Start exploration'}</Button>
      </form>
    </AppDialog>
  );
}
