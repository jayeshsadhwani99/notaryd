'use client';

import { usePathname } from 'next/navigation';
import { BottomNav } from '@/components/layout/bottom-nav';
import { NavLinks } from '@/components/layout/nav-links';
import { PageFrame } from '@/components/layout/page-frame';
import { ProjectSwitcher } from '@/components/layout/project-switcher';
import { ShellData } from '@/components/layout/shell-data';
import { UserMenu } from '@/components/layout/user-menu';
import { projectIdFromPath } from '@/lib/paths';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const projectId = projectIdFromPath(pathname);
  return (
    <div className="min-h-screen bg-background md:flex">
      <ShellData />
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r bg-sidebar md:flex">
        <div className="p-2"><ProjectSwitcher projectId={projectId} pathname={pathname} /></div>
        <nav className="flex-1 overflow-y-auto px-2" aria-label="Project screens">
          {projectId ? <NavLinks projectId={projectId} pathname={pathname} /> : <p className="px-2 text-xs text-muted-foreground">Choose a project.</p>}
        </nav>
        <div className="border-t px-2 py-2"><UserMenu /></div>
      </aside>
      <div className="min-w-0 md:flex-1">
        <header className="sticky top-0 z-30 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b bg-sidebar px-3 py-2 md:hidden">
          <ProjectSwitcher projectId={projectId} pathname={pathname} />
          <UserMenu compact />
        </header>
        <main className="w-full pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
          <PageFrame>{children}</PageFrame>
        </main>
      </div>
      <BottomNav projectId={projectId} pathname={pathname} />
    </div>
  );
}
