import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/feedback/empty-state';

export function RunShot({ shotId, live }: { shotId?: string; live: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle>{live ? 'Latest page' : 'Screenshot'}</CardTitle></CardHeader>
      <CardContent>
        {shotId ? (
          <img className="max-h-96 w-full rounded-lg border object-contain object-top" alt="Latest page" src={`/api/engine/evidence/${shotId}`} />
        ) : (
          <EmptyState title="No screenshot yet" body={live ? 'Refreshing every few seconds.' : 'Code-only runs still produce a flow map.'} />
        )}
      </CardContent>
    </Card>
  );
}
