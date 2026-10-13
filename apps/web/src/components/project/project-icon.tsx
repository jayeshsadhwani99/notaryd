import { Layers } from 'lucide-react';
import { isProjectIcon, projectIconMap } from '@/components/project/icon-names';
import { cn } from '@/lib/utils';

export function ProjectIcon({ name, className }: { name?: string | null; className?: string }) {
  const Icon = name && isProjectIcon(name) ? projectIconMap[name] : Layers;
  return (
    <span className={cn('grid size-7 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground', className)}>
      <Icon className="size-3.5" aria-hidden />
    </span>
  );
}
