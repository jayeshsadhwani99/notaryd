'use client';

import { FormEvent, useState } from 'react';
import { ErrorAlert } from '@/components/feedback/error-alert';
import { Field } from '@/components/forms/field';
import { AppDialog } from '@/components/modal/app-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';

export function VerifyDialog({
  projectId, picked, open, onOpenChange,
}: { projectId: string; picked: string[]; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [affectedOnly, setAffectedOnly] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const created = await api<{ runId: string }>(`/projects/${projectId}/verify`, {
        method: 'POST',
        body: JSON.stringify({
          branch: form.get('branch') || undefined,
          commit: form.get('commit') || undefined,
          focusPrompt: String(form.get('prompt') || ''),
          affectedOnly: picked.length > 0 ? false : affectedOnly,
          flowIds: picked.length > 0 ? picked : undefined,
        }),
      });
      window.location.href = `/projects/${projectId}/runs/${created.runId}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start verification');
      setBusy(false);
    }
  }

  const label = picked.length > 0 ? `Verify ${picked.length} selected` : 'Verify affected flows';
  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title="Verify" description={picked.length > 0 ? 'Selected flows ignore the diff filter.' : 'Replay only the flows this diff touches.'}>
      <form className="grid gap-3" onSubmit={onSubmit}>
        <Field label="Branch" htmlFor="branch"><Input id="branch" name="branch" placeholder="main" /></Field>
        <Field label="Commit" htmlFor="commit"><Input id="commit" name="commit" placeholder="optional sha" /></Field>
        <Field label="Prompt" htmlFor="verify-prompt"><Textarea id="verify-prompt" name="prompt" placeholder="What this run should pay attention to" /></Field>
        <div className="flex items-center gap-2">
          <Checkbox id="affectedOnly" checked={affectedOnly} disabled={picked.length > 0} onCheckedChange={(checked) => setAffectedOnly(checked === true)} />
          <Label htmlFor="affectedOnly">Only flows this diff touches</Label>
        </div>
        <ErrorAlert message={error} />
        <Button type="submit" disabled={busy}>{busy ? 'Starting…' : label}</Button>
      </form>
    </AppDialog>
  );
}
