'use client';

import Link from 'next/link';
import { StatusBadge } from '@/components/feedback/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import type { Flow } from '@/features/flows/flow-types';

export function FlowCard({
  projectId, flow, picked, onToggle, onEdit,
}: {
  projectId: string;
  flow: Flow;
  picked: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  const href = `/projects/${projectId}/flows/${flow.id}`;
  const owners = (flow.owners ?? []).map((owner) => `${owner.person} (${owner.role})`).join(', ');
  return (
    <Card className="h-full hover:ring-primary/40">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {flow.feature ? <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{flow.feature}</p> : null}
            <CardTitle><Link href={href} className="hover:text-primary">{flow.name}</Link></CardTitle>
          </div>
          <Checkbox checked={picked} onCheckedChange={onToggle} aria-label={`Select ${flow.name}`} />
        </div>
      </CardHeader>
      <CardContent className="grid gap-2">
        <p className="text-xs text-muted-foreground">{flow.goal}</p>
        <div className="flex flex-wrap gap-1">
          <StatusBadge value={flow.status} />
          <StatusBadge value={flow.confidence} />
          {flow.last_result ? <StatusBadge value={flow.last_result} /> : null}
        </div>
        <p className="text-xs text-muted-foreground">{owners || 'No owners yet'}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild><Link href={href} aria-label={`Open ${flow.name}`}>Open</Link></Button>
          <Button variant="outline" size="sm" aria-label={`Edit ${flow.name}`} onClick={onEdit}>Edit</Button>
        </div>
      </CardContent>
    </Card>
  );
}
