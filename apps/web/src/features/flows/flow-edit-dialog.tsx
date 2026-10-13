'use client';

import { FormEvent, useState } from 'react';
import { ErrorAlert } from '@/components/feedback/error-alert';
import { Field } from '@/components/forms/field';
import { AppDialog } from '@/components/modal/app-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';

export function FlowEditDialog({
  flowId, name, goal, owners, open, onOpenChange, onSaved,
}: {
  flowId: string;
  name: string;
  goal: string | null;
  owners: { person: string; role: string }[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title="Edit flow" description="Name, goal, and owners. Steps stay on the flow page.">
      <FlowEditForm key={flowId} flowId={flowId} name={name} goal={goal} owners={owners} onClose={() => onOpenChange(false)} onSaved={onSaved} />
    </AppDialog>
  );
}

function FlowEditForm({
  flowId, name, goal, owners, onClose, onSaved,
}: {
  flowId: string;
  name: string;
  goal: string | null;
  owners: { person: string; role: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api(`/flows/${flowId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.get('name'),
          goal: form.get('goal'),
          owners: parseOwners(String(form.get('owners') || '')),
        }),
      });
      onClose();
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the flow');
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={onSubmit}>
      <Field label="Name" htmlFor="flow-name"><Input id="flow-name" name="name" required defaultValue={name} /></Field>
      <Field label="Goal" htmlFor="flow-goal"><Textarea id="flow-goal" name="goal" defaultValue={goal ?? ''} /></Field>
      <Field label="Owners" htmlFor="flow-owners"><Textarea id="flow-owners" name="owners" defaultValue={owners.map((owner) => `${owner.person} ${owner.role}`).join('\n')} placeholder={'@jayesh admin'} /></Field>
      <ErrorAlert message={error} />
      <Button type="submit" disabled={busy} aria-label="Save flow">{busy ? 'Saving…' : 'Save flow'}</Button>
    </form>
  );
}

function parseOwners(text: string) {
  return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const [person, ...rest] = line.split(/\s+/);
    return { person, role: rest.join(' ') || 'owner' };
  });
}
