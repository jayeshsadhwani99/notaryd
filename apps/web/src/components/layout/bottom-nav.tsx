'use client';

import Link from 'next/link';
import { LayoutDashboard, Plus } from 'lucide-react';
import { NavLinks } from '@/components/layout/nav-links';

export function BottomNav({ projectId, pathname }: { projectId: string | null; pathname: string }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden" aria-label="Project">
      {projectId ? (
        <NavLinks projectId={projectId} pathname={pathname} mobile />
      ) : (
        <div className="grid grid-cols-2">
          <Link href="/projects" aria-label="Projects" className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium hover:text-foreground">
            <LayoutDashboard className="size-4" aria-hidden />
            Projects
          </Link>
          <Link href="/projects?new=1" aria-label="New project" className="flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium text-muted-foreground hover:text-foreground">
            <Plus className="size-4" aria-hidden />
            New
          </Link>
        </div>
      )}
    </nav>
  );
}
