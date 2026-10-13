'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { AuthFrame } from '@/components/auth-frame';
import { Field } from '@/components/forms/field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';

export default function SignupPage() {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          name: form.get('name'),
          orgName: form.get('orgName'),
          email: form.get('email'),
          password: form.get('password'),
        }),
      });
      window.location.href = '/projects';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the account');
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      title="Start with one project."
      lede="Connect a Next.js repo, approve an auth plan, then explore it. The first setup can take a while. Later runs only replay what changed."
      footnote="Passwords stay in Notaryd. They are not sent to the model."
      cardTitle="Create a team"
      cardDescription="You will be the admin of this workspace."
    >
      <form className="grid gap-4" onSubmit={onSubmit}>
        <Field label="Your name" htmlFor="name">
          <Input id="name" name="name" required autoComplete="name" />
        </Field>
        <Field label="Team name" htmlFor="orgName">
          <Input id="orgName" name="orgName" required />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" minLength={10} required autoComplete="new-password" />
        </Field>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </Button>
        <p className="text-sm text-muted-foreground">
          Already have one?{' '}
          <Link href="/login" className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthFrame>
  );
}
