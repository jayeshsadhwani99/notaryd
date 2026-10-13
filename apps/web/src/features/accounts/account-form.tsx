'use client';

import { FormEvent, useState } from 'react';
import { AccountCredential } from '@/features/accounts/account-credential';
import type { Account } from '@/features/accounts/account-types';
import { ErrorAlert } from '@/components/feedback/error-alert';
import { Field } from '@/components/forms/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';

export function AccountForm({ projectId, account, onDone }: { projectId: string; account?: Account | null; onDone: () => void }) {
  const [loginMethod, setLoginMethod] = useState(account?.loginMethod ?? 'password');
  const [dataMode, setDataMode] = useState(account?.dataMode ?? 'persisted');
  const [credential, setCredential] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revealing, setRevealing] = useState(false);

  async function reveal() {
    if (!account) return;
    setRevealing(true);
    setError('');
    try {
      const result = await api<{ value: string }>(`/projects/${projectId}/accounts/${account.id}/reveal`, { method: 'POST' });
      setCredential(result.value);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reveal the credential');
    } finally {
      setRevealing(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    const body: Record<string, unknown> = {
      label: form.get('label'), role: form.get('role'), loginMethod, dataMode, email: form.get('email'),
    };
    if (credential) body.credential = credential;
    const path = account ? `/projects/${projectId}/accounts/${account.id}` : `/projects/${projectId}/accounts`;
    try {
      await api(path, { method: account ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the account');
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={onSubmit}>
      <Field label="Label" htmlFor="label"><Input id="label" name="label" required defaultValue={account?.label} placeholder="owner-a" /></Field>
      <Field label="Role" htmlFor="role"><Input id="role" name="role" required defaultValue={account?.role} placeholder="admin" /></Field>
      <Field label="Email" htmlFor="email"><Input id="email" name="email" type="email" defaultValue={account?.email ?? ''} placeholder="qa+admin@acme.test" autoComplete="off" /></Field>
      <Field label="Login">
        <Select value={loginMethod} onValueChange={setLoginMethod}>
          <SelectTrigger className="w-full" aria-label="Login method"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="password">Email + password</SelectItem>
            <SelectItem value="saved_session">Saved session JSON</SelectItem>
            <SelectItem value="logged_out">Logged out</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Data">
        <Select value={dataMode} onValueChange={setDataMode}>
          <SelectTrigger className="w-full" aria-label="Data mode"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="persisted">Persisted snapshot</SelectItem>
            <SelectItem value="clean_slate">Clean slate</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <AccountCredential value={credential} onChange={setCredential} canReveal={Boolean(account?.hasCredential)} revealing={revealing} onReveal={reveal} />
      <ErrorAlert message={error} />
      <Button type="submit" disabled={busy} aria-label={account ? 'Save account changes' : 'Save account'}>{busy ? 'Saving…' : account ? 'Save changes' : 'Save account'}</Button>
    </form>
  );
}
