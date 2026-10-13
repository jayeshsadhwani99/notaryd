'use client';

import { AccountForm } from '@/features/accounts/account-form';
import type { Account } from '@/features/accounts/account-types';
import { AppDialog } from '@/components/modal/app-dialog';

export function AccountDialog({
  projectId,
  account,
  open,
  onOpenChange,
  onSaved,
}: {
  projectId: string;
  account: Account | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={account ? `Edit ${account.label}` : 'Add an account'}
      description="The password or session is encrypted. Reveal it here to view it. Leave it blank to keep the stored value."
    >
      <AccountForm key={account?.id ?? 'new'} projectId={projectId} account={account} onDone={() => { onOpenChange(false); onSaved(); }} />
    </AppDialog>
  );
}
