'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AuditDetail } from '@/features/audit/audit-detail';
import type { AuditEntry } from '@/features/audit/audit-types';
import { StatusBadge } from '@/components/feedback/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export type { AuditEntry } from '@/features/audit/audit-types';

export function AuditTable({ projectId, entries }: { projectId: string; entries: AuditEntry[] }) {
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  return (
    <Card className="gap-0 py-0">
      <CardContent className="px-0">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[22%]">When</TableHead>
              <TableHead className="w-[18%]">Action</TableHead>
              <TableHead className="w-[22%]">Result</TableHead>
              <TableHead className="w-[12%]">Trigger</TableHead>
              <TableHead className="w-[14%]">Who</TableHead>
              <TableHead className="w-[12%]">Build</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.length === 0 ? <TableRow className="hover:bg-transparent"><TableCell colSpan={6} className="text-muted-foreground">No entries match.</TableCell></TableRow> : null}
            {entries.map((entry) => (
              <TableRow
                key={entry.id}
                tabIndex={0}
                className="cursor-pointer"
                aria-label={`Open ${entry.action}`}
                onClick={() => setSelected(entry)}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(entry); } }}
              >
                <TableCell className="whitespace-normal">{new Date(entry.created_at).toLocaleString()}</TableCell>
                <TableCell className="whitespace-normal">{entry.action}</TableCell>
                <TableCell><span className="flex flex-wrap gap-1">{entry.result ? <StatusBadge value={entry.result} /> : '—'}{entry.confidence ? <StatusBadge value={entry.confidence} /> : null}</span></TableCell>
                <TableCell className="capitalize">{entry.trigger || '—'}</TableCell>
                <TableCell className="truncate">{entry.actor_label || '—'}</TableCell>
                <TableCell className="font-mono text-xs">
                  {entry.commit_sha || (entry.run_id ? <Link href={`/projects/${projectId}/runs/${entry.run_id}`} aria-label="Open run evidence" className="hover:underline" onClick={(event) => event.stopPropagation()}>evidence</Link> : '—')}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <AuditDetail projectId={projectId} entry={selected} onOpenChange={(open) => { if (!open) setSelected(null); }} />
    </Card>
  );
}
