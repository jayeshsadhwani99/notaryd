'use client';

import Link from 'next/link';
import { StatusBadge } from '@/components/feedback/status-badge';
import { AppDialog } from '@/components/modal/app-dialog';
import type { AuditEntry } from '@/features/audit/audit-types';

export function AuditDetail({
  projectId, entry, onOpenChange,
}: { projectId: string; entry: AuditEntry | null; onOpenChange: (open: boolean) => void }) {
  if (!entry) return null;
  const payload = entry.payload ?? {};
  const rows = [
    ['Environment', entry.environment_name],
    ['Flow version', entry.flow_version == null ? null : `v${entry.flow_version}`],
    ['Commit', entry.commit_sha],
    ['Pull request', entry.pr_number == null ? null : `#${entry.pr_number}`],
  ].filter((row): row is [string, string] => Boolean(row[1]));
  return (
    <AppDialog open onOpenChange={onOpenChange} title={entry.action} description={new Date(entry.created_at).toLocaleString()}>
      <div className="grid gap-3 text-sm">
        <div className="flex flex-wrap gap-1">
          {entry.result ? <StatusBadge value={entry.result} /> : null}
          {entry.confidence ? <StatusBadge value={entry.confidence} /> : null}
          {entry.trigger ? <StatusBadge value={entry.trigger} /> : null}
        </div>
        <p className="text-muted-foreground">{entry.actor_label || 'No actor recorded'}</p>
        {rows.length > 0 ? (
          <dl className="grid gap-1">
            {rows.map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="font-mono text-xs">{value}</dd></div>)}
          </dl>
        ) : null}
        <div className="flex flex-wrap gap-3 text-xs">
          {entry.flow_id ? <Link className="hover:underline" href={`/projects/${projectId}/flows/${entry.flow_id}`}>Open flow</Link> : null}
          {entry.run_id ? <Link className="hover:underline" href={`/projects/${projectId}/runs/${entry.run_id}`}>Open run</Link> : null}
        </div>
        <Payload payload={payload} />
      </div>
    </AppDialog>
  );
}

function Payload({ payload }: { payload: Record<string, unknown> }) {
  const keys = Object.keys(payload);
  if (keys.length === 0) return <p className="text-xs text-muted-foreground">No extra detail.</p>;
  return (
    <dl className="grid gap-2 border-t pt-3">
      {keys.map((key) => (
        <div key={key}>
          <dt className="text-xs text-muted-foreground">{key}</dt>
          <dd className="font-mono text-xs break-all whitespace-pre-wrap">{formatValue(payload[key])}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatValue(value: unknown) {
  if (value == null || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value, null, 2);
}
