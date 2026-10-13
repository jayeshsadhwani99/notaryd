'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const results = ['any', 'passed', 'failed', 'blocked'];
const triggers = ['any', 'manual', 'pr', 'cron', 'agent'];

export function AuditFilters({
  result, trigger, onResult, onTrigger,
}: {
  result: string; trigger: string; onResult: (value: string) => void; onTrigger: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Select value={result} onValueChange={onResult}>
        <SelectTrigger className="w-40" aria-label="Filter by result"><SelectValue /></SelectTrigger>
        <SelectContent>{results.map((item) => <SelectItem key={item} value={item} className="capitalize">{item === 'any' ? 'Any result' : item}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={trigger} onValueChange={onTrigger}>
        <SelectTrigger className="w-40" aria-label="Filter by trigger"><SelectValue /></SelectTrigger>
        <SelectContent>{triggers.map((item) => <SelectItem key={item} value={item} className="capitalize">{item === 'any' ? 'Any trigger' : item === 'pr' ? 'Pull request' : item}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
