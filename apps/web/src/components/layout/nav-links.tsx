'use client';

import Link from 'next/link';
import { sectionActive, sections } from '@/components/layout/sections';
import { cn } from '@/lib/utils';

export function NavLinks({ projectId, pathname, mobile = false }: { projectId: string; pathname: string; mobile?: boolean }) {
  return (
    <div className={mobile ? 'grid grid-cols-6' : 'flex flex-col gap-0.5'}>
      {sections.map((section) => {
        const href = `/projects/${projectId}${section.segment}`;
        const active = sectionActive(pathname, href, section.segment);
        return (
          <Link
            key={section.label}
            href={href}
            aria-label={section.label}
            aria-current={active ? 'page' : undefined}
            className={cn(
              mobile
                ? 'flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium hover:text-foreground'
                : 'flex h-8 items-center gap-2 rounded-md px-2 text-sm font-medium hover:bg-sidebar-accent',
              active ? 'bg-sidebar-accent text-foreground' : 'text-muted-foreground',
              mobile && active ? 'bg-transparent text-primary' : '',
            )}
          >
            <section.icon className={mobile ? 'size-4' : 'size-4'} aria-hidden />
            {section.label}
          </Link>
        );
      })}
    </div>
  );
}
