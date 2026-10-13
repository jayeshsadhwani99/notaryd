import { Badge } from '@/components/ui/badge';

const good = new Set(['verified', 'passed', 'succeeded', 'ready', 'approved', 'high', 'done']);
const bad = new Set(['failing', 'failed', 'low', 'error']);

export function StatusBadge({ value }: { value?: string | null }) {
  if (!value) return <Badge variant="outline">unknown</Badge>;
  const key = value.toLowerCase();
  const variant = bad.has(key) ? 'destructive' : good.has(key) ? 'default' : 'secondary';
  return <Badge variant={variant} className="capitalize">{value.replaceAll('_', ' ')}</Badge>;
}
