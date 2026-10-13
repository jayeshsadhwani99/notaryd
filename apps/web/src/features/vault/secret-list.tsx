'use client';

import { EmptyState } from '@/components/feedback/empty-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export type SecretRow = { key: string; configured: boolean };

export function SecretList({
  secrets,
  shown,
  onReveal,
  onHide,
  onEdit,
}: {
  secrets: SecretRow[];
  shown: Record<string, string>;
  onReveal: (key: string) => void;
  onHide: (key: string) => void;
  onEdit: (key: string) => void;
}) {
  if (secrets.length === 0) return <EmptyState title="No variables" body="Add one, or paste a .env for this environment." />;
  return (
    <div className="grid gap-2">
      {secrets.map((secret) => {
        const visible = shown[secret.key];
        return (
          <Card key={secret.key}>
            <CardContent className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-sm">{secret.key}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{visible ?? (secret.configured ? '••••••••' : 'Missing')}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="outline" size="sm" aria-label={`${secret.configured ? 'Edit' : 'Set'} ${secret.key}`} onClick={() => onEdit(secret.key)}>
                  {secret.configured ? 'Edit' : 'Set'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`${visible === undefined ? 'Reveal' : 'Hide'} ${secret.key}`}
                  disabled={!secret.configured}
                  onClick={() => (visible === undefined ? onReveal(secret.key) : onHide(secret.key))}
                >
                  {visible === undefined ? 'Reveal' : 'Hide'}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
