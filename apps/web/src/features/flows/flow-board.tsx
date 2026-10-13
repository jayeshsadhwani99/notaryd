'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { FlowCard } from '@/features/flows/flow-card';
import { FlowEditDialog } from '@/features/flows/flow-edit-dialog';
import { VerifyDialog } from '@/features/flows/verify-dialog';
import type { Flow } from '@/features/flows/flow-types';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorAlert } from '@/components/feedback/error-alert';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';

export function FlowBoard({
  projectId, flows, error, onReload,
}: { projectId: string; flows: Flow[]; error: string; onReload: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [editing, setEditing] = useState<Flow | null>(null);

  function toggle(id: string) {
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  return (
    <>
      <PageHeader
        title="Flows"
        description="Open a flow to edit its steps. Re-run asks for a prompt before it starts."
        actions={<Button aria-label="Verify flows" onClick={() => setVerifyOpen(true)}><Play /> Verify</Button>}
      />
      <ErrorAlert message={error} />
      {flows.length === 0 ? <EmptyState title="No flows yet" body="Run an exploration to build the map." /> : null}
      <div className="flex flex-wrap gap-3">
        {flows.map((flow) => (
          <div key={flow.id} className="w-full sm:w-72">
            <FlowCard projectId={projectId} flow={flow} picked={picked.includes(flow.id)} onToggle={() => toggle(flow.id)} onEdit={() => setEditing(flow)} />
          </div>
        ))}
      </div>
      <VerifyDialog projectId={projectId} picked={picked} open={verifyOpen} onOpenChange={setVerifyOpen} />
      {editing ? (
        <FlowEditDialog
          flowId={editing.id}
          name={editing.name}
          goal={editing.goal}
          owners={editing.owners ?? []}
          open
          onOpenChange={(open) => { if (!open) setEditing(null); }}
          onSaved={onReload}
        />
      ) : null}
    </>
  );
}
