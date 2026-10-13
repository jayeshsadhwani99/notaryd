'use client';

import { FormEvent, useState } from 'react';
import { ErrorAlert } from '@/components/feedback/error-alert';
import { Field } from '@/components/forms/field';
import { AppDialog } from '@/components/modal/app-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

const namePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function SecretEditDialog({
  projectId, environment, secretKey, open, onOpenChange, onSaved,
}: {
  projectId: string;
  environment: string;
  secretKey: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (key: string) => void;
}) {
  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={secretKey ? `Edit ${secretKey}` : 'Add a variable'}
      description={`Saved encrypted for ${environment}. Other variables are left as they are.`}
    >
      <SecretEditForm key={secretKey ?? 'new'} projectId={projectId} environment={environment} secretKey={secretKey} onDone={onSaved} onClose={() => onOpenChange(false)} />
    </AppDialog>
  );
}

function SecretEditForm({
  projectId, environment, secretKey, onDone, onClose,
}: {
  projectId: string;
  environment: string;
  secretKey: string | null;
  onDone: (key: string) => void;
  onClose: () => void;
}) {
  const [keyName, setKeyName] = useState(secretKey ?? '');
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = (secretKey ?? keyName).trim();
    if (!namePattern.test(key)) { setError('Use a name like DATABASE_URL'); return; }
    if (!value) { setError('Enter a value'); return; }
    setBusy(true);
    setError('');
    try {
      await api(`/projects/${projectId}/vault`, { method: 'PUT', body: JSON.stringify({ environment, entries: [{ key, value }] }) });
      onClose();
      onDone(key);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the variable');
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={onSubmit}>
      <Field label="Name" htmlFor="secret-key">
        <Input id="secret-key" value={keyName} onChange={(event) => setKeyName(event.target.value)} readOnly={Boolean(secretKey)} required placeholder="DATABASE_URL" className="font-mono" autoComplete="off" />
      </Field>
      <Field label="Value" htmlFor="secret-value">
        <Input id="secret-value" type="password" value={value} onChange={(event) => setValue(event.target.value)} required placeholder="New value" autoComplete="off" />
      </Field>
      <ErrorAlert message={error} />
      <Button type="submit" disabled={busy} aria-label={secretKey ? 'Save variable' : 'Add variable'}>{busy ? 'Saving…' : 'Save'}</Button>
    </form>
  );
}
