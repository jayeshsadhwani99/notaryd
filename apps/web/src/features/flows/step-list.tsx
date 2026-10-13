'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { FlowDetail } from '@/features/flows/flow-types';

export function StepList({ data, onEdit }: { data: FlowDetail; onEdit: (index: number) => void }) {
  return (
    <div className="grid gap-2">
      {data.steps.map((step, index) => {
        const shot = data.screenshots.find((item) => item.step_id === step.id);
        const link = [step.component, step.handler, ...(step.files ?? [])].filter(Boolean).join(' · ');
        return (
          <Card key={step.id}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle>Step {index + 1}</CardTitle>
                <Button variant="outline" size="sm" aria-label={`Edit step ${index + 1}`} onClick={() => onEdit(index)}>Edit</Button>
              </div>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <p className="font-medium capitalize">{step.action === 'request' ? `${step.value || 'GET'} ${step.url || ''}`.trim() : step.action}</p>
              <p className="text-xs text-muted-foreground">{step.action === 'request' ? step.handler || step.url || 'No target' : step.selector || step.url || 'No target'}</p>
              <p className="text-xs text-muted-foreground">{link || 'No code link yet'} · link {step.link_confidence}</p>
              {step.notes ? <p className="text-xs text-muted-foreground">{step.notes}</p> : null}
              {shot ? <img className="mt-2 max-h-64 w-full rounded-lg border object-contain object-top" alt={`Step ${index + 1}`} src={`/api/engine/evidence/${shot.id}`} /> : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
