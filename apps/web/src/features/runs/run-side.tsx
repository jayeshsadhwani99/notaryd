import { StatusBadge } from '@/components/feedback/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { RunView } from '@/features/runs/run-types';

export function RunSide({ data }: { data: RunView }) {
  const steps = data.run.progress?.bootSteps ?? [];
  return (
    <div className="grid gap-2">
      {data.run.focus_prompt ? (
        <Card>
          <CardHeader><CardTitle>Prompt</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{data.run.focus_prompt}</p></CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader><CardTitle>Stuck on</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {data.blockers.length === 0 ? <p className="text-muted-foreground">Nothing blocked.</p> : null}
          {data.blockers.map((blocker) => <p key={blocker.id}><span className="font-medium capitalize">{blocker.kind}</span> — {blocker.message}</p>)}
          {steps.map((step) => <p key={step.name} className="font-mono text-xs">{step.status} · {step.name}{step.detail ? ` — ${step.detail}` : ''}</p>)}
        </CardContent>
      </Card>
      {data.flows.length > 0 ? (
        <Card>
          <CardHeader><CardTitle>Flows in this run</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            {data.flows.map((flow) => (
              <div key={flow.flow_id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{flow.name}</span>
                <StatusBadge value={flow.result} />
                <StatusBadge value={flow.confidence} />
                {flow.healed ? <span className="text-xs text-muted-foreground">self-healed</span> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
