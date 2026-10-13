'use client';

import type { Account } from '@/features/accounts/account-types';
import { StatusBadge } from '@/components/feedback/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export function AccountList({ accounts, onEdit }: { accounts: Account[]; onEdit: (account: Account) => void }) {
  return (
    <div className="grid gap-2">
      {accounts.map((account) => (
        <Card key={account.id} className="hover:ring-primary/40">
          <CardContent className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{account.label}</p>
              <p className="truncate text-xs text-muted-foreground">{account.role} · {account.email ?? 'no email'}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <StatusBadge value={account.loginMethod} />
              <StatusBadge value={account.dataMode} />
              <Button variant="outline" size="sm" aria-label={`Edit ${account.label}`} onClick={() => onEdit(account)}>Edit</Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
