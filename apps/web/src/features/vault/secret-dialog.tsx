'use client';

import { FormEvent, useState } from 'react';
import { ErrorAlert } from '@/components/feedback/error-alert';
import { Field } from '@/components/forms/field';
import { AppDialog } from '@/components/modal/app-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';

export function SecretDialog({
  projectId, environment, open, onOpenChange, onSaved,
}: {
  projectId: string; environment: string; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formEl = event.currentTarget;
    setBusy(true);
    setError('');
    try {
      await api(`/projects/${projectId}/vault`, {
        method: 'PUT',
        body: JSON.stringify({ environment, dotenv: new FormData(formEl).get('dotenv') }),
      });
      formEl.reset();
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save secrets');
      setBusy(false);
    }
  }

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title="Paste a .env" description={`Only the keys in this paste are written for ${environment}. A key that already exists is updated. Every other key stays as it is.`}>
      <form className="grid gap-3" onSubmit={onSubmit}>
        <Field label="KEY=value lines" htmlFor="dotenv">
          <Textarea id="dotenv" name="dotenv" className="min-h-32 font-mono text-xs" placeholder={'DATABASE_URL=\nNEXTAUTH_SECRET='} />
        </Field>
        <ErrorAlert message={error} />
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save secrets'}</Button>
      </form>
    </AppDialog>
  );
}
