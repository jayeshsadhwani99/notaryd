'use client';

import { isProjectIcon, projectIconMap, projectIconNames, type ProjectIconName } from '@/components/project/icon-names';
import { cn } from '@/lib/utils';

export function IconPicker({ value, onChange }: { value: string; onChange: (icon: ProjectIconName) => void }) {
  return (
    <div className="flex flex-wrap gap-1" role="group" aria-label="Project icon">
      {projectIconNames.map((icon) => {
        const Icon = projectIconMap[icon];
        const selected = isProjectIcon(value) && icon === value;
        return (
          <button
            key={icon}
            type="button"
            aria-label={icon}
            aria-pressed={selected}
            onClick={() => onChange(icon)}
            className={cn(
              'grid size-7 cursor-pointer place-items-center rounded-md hover:bg-accent',
              selected ? 'bg-accent text-accent-foreground ring-1 ring-primary' : 'text-foreground',
            )}
          >
            <Icon className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
