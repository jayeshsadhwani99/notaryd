'use client';

import { FormEvent, useState } from 'react';
import { ErrorAlert } from '@/components/feedback/error-alert';
import { Field } from '@/components/forms/field';
import { AppDialog } from '@/components/modal/app-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';

export function RerunDialog({
  projectId, flowId, flowName, open, onOpenChange,
}: {
  projectId: string;
  flowId: string;
  flowName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const prompt = String(new FormData(event.currentTarget).get('prompt') || '');
    setBusy(true);
    setError('');
    try {
      const created = await api<{ runId: string }>(`/projects/${projectId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ flowIds: [flowId], affectedOnly: false, focusPrompt: prompt }),
      });
      window.location.href = `/projects/${projectId}/runs/${created.runId}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the run');
      setBusy(false);
    }
  }

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title={`Re-run ${flowName}`} description="Say what this run should pay attention to. The replay still follows the saved steps.">
      <form className="grid gap-3" onSubmit={onSubmit}>
        <Field label="Prompt" htmlFor="rerun-prompt">
          <Textarea id="rerun-prompt" name="prompt" placeholder="The coupon field moved under the total" />
        </Field>
        <ErrorAlert message={error} />
        <Button type="submit" disabled={busy} aria-label="Start rerun">{busy ? 'Starting…' : 'Start run'}</Button>
      </form>
    </AppDialog>
  );
}
