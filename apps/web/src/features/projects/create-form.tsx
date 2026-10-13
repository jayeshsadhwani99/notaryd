'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { loadProjects } from '@/features/projects/projects-slice';
import { ErrorAlert } from '@/components/feedback/error-alert';
import { Field } from '@/components/forms/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { useAppDispatch } from '@/store/hooks';

export function CreateProjectForm({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'sandbox' | 'url'>('sandbox');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dispatch = useAppDispatch();
  const router = useRouter();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const created = await api<{ id: string }>('/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: form.get('name'), mode, repoUrl: form.get('repoUrl'), localPath: form.get('localPath'),
          appPath: form.get('appPath'), targetUrl: form.get('targetUrl'), defaultBranch: form.get('defaultBranch') || 'main',
          focusPrompt: form.get('focusPrompt'),
        }),
      });
      await dispatch(loadProjects());
      onDone();
      router.push(`/projects/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the project');
      setBusy(false);
    }
  }

  return (
    <form className="grid gap-3" onSubmit={onSubmit}>
      <Field label="Name" htmlFor="name"><Input id="name" name="name" required placeholder="Acme checkout" /></Field>
      <Field label="How it runs">
        <Select value={mode} onValueChange={(value) => setMode(value as 'sandbox' | 'url')}>
          <SelectTrigger className="w-full" aria-label="How it runs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="sandbox">Dedicated sandbox</SelectItem>
            <SelectItem value="url">Point at a URL</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Git URL" htmlFor="repoUrl"><Input id="repoUrl" name="repoUrl" placeholder="https://github.com/org/app" /></Field>
      <Field label="Or a local path" htmlFor="localPath"><Input id="localPath" name="localPath" placeholder="/absolute/path/to/app" /></Field>
      <Field label="App path" htmlFor="appPath"><Input id="appPath" name="appPath" placeholder="apps/web" /></Field>
      <Field label="Default branch" htmlFor="defaultBranch"><Input id="defaultBranch" name="defaultBranch" defaultValue="main" /></Field>
      {mode === 'url' ? <Field label="Target URL" htmlFor="targetUrl"><Input id="targetUrl" name="targetUrl" required placeholder="http://localhost:3001" /></Field> : null}
      <Field label="Focus prompt" htmlFor="focusPrompt"><Textarea id="focusPrompt" name="focusPrompt" placeholder="only map checkout and refunds" /></Field>
      <ErrorAlert message={error} />
      <Button type="submit" disabled={busy} aria-label="Create project">{busy ? 'Creating…' : 'Create project'}</Button>
    </form>
  );
}
