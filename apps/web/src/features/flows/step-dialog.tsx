'use client';

import { FormEvent, useState } from 'react';
import { ErrorAlert } from '@/components/feedback/error-alert';
import { Field } from '@/components/forms/field';
import { AppDialog } from '@/components/modal/app-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { stepPayload, type Step } from '@/features/flows/flow-types';
import { api } from '@/lib/api';

export function StepDialog({
  flowId, steps, index, open, onOpenChange, onSaved,
}: {
  flowId: string; steps: Step[]; index: number; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void;
}) {
  const step = steps[index];
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (!step) return null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = steps.map((item, i) => i === index ? {
      ...item,
      action: String(form.get('action') || item.action),
      account_role: String(form.get('accountRole') || '') || null,
      url: String(form.get('url') || '') || null,
      selector: String(form.get('selector') || '') || null,
      value: String(form.get('value') || '') || null,
      notes: String(form.get('notes') || '') || null,
    } : item);
    setBusy(true);
    setError('');
    try {
      await api(`/flows/${flowId}/steps`, { method: 'PUT', body: JSON.stringify({ steps: stepPayload(next) }) });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the step');
      setBusy(false);
    }
  }

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title={`Edit step ${index + 1}`} description="Code links stay attached to this step.">
      <form className="grid gap-3" onSubmit={onSubmit} key={step.id}>
        <Field label="Action" htmlFor="action"><Input id="action" name="action" defaultValue={step.action} required /></Field>
        <Field label="Account role" htmlFor="accountRole"><Input id="accountRole" name="accountRole" defaultValue={step.account_role ?? ''} /></Field>
        <Field label="URL" htmlFor="url"><Input id="url" name="url" defaultValue={step.url ?? ''} /></Field>
        <Field label="Value" htmlFor="value"><Input id="value" name="value" defaultValue={step.value ?? ''} placeholder="POST for a request step" /></Field>
        <Field label="Selector" htmlFor="selector"><Input id="selector" name="selector" defaultValue={step.selector ?? ''} /></Field>
        <Field label="Notes" htmlFor="notes"><Textarea id="notes" name="notes" defaultValue={step.notes ?? ''} /></Field>
        <ErrorAlert message={error} />
        <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save step'}</Button>
      </form>
    </AppDialog>
  );
}
