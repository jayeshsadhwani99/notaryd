'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { AccountDialog } from '@/features/accounts/account-dialog';
import { AccountList } from '@/features/accounts/account-list';
import type { Account } from '@/features/accounts/account-types';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorAlert } from '@/components/feedback/error-alert';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';

export default function AccountsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const [projectId, setProjectId] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);

  function load(id: string) {
    api<{ accounts: Account[] }>(`/projects/${id}/accounts`).then((data) => setAccounts(data.accounts)).catch((err) => setError(err.message));
  }

  useEffect(() => {
    params.then(({ projectId: id }) => { setProjectId(id); load(id); });
  }, [params]);

  return (
    <>
      <PageHeader
        title="Test accounts"
        description="Roles the explorer can sign in as."
        actions={<Button aria-label="Add an account" onClick={() => { setEditing(null); setOpen(true); }}><Plus /> Add account</Button>}
      />
      <ErrorAlert message={error} />
      {accounts.length === 0 ? <EmptyState title="No accounts" body="Add one before an exploration that needs a signed-in role." /> : null}
      <AccountList accounts={accounts} onEdit={(account) => { setEditing(account); setOpen(true); }} />
      {projectId ? (
        <AccountDialog projectId={projectId} account={editing} open={open} onOpenChange={setOpen} onSaved={() => load(projectId)} />
      ) : null}
    </>
  );
}
