'use client';

import { useRouter } from 'next/navigation';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { setProjectIcon } from '@/features/projects/projects-slice';
import { api } from '@/lib/api';
import { sectionHref } from '@/lib/paths';
import { IconPicker } from '@/components/project/icon-picker';
import { ProjectIcon } from '@/components/project/project-icon';
import type { ProjectIconName } from '@/components/project/icon-names';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

export function ProjectSwitcher({ projectId, pathname }: { projectId: string | null; pathname: string }) {
  const projects = useAppSelector((state) => state.projects.items);
  const current = projects.find((project) => project.id === projectId) ?? null;
  const dispatch = useAppDispatch();
  const router = useRouter();

  function openProject(id: string) {
    router.push(projectId ? sectionHref(id, pathname) : `/projects/${id}`);
  }

  async function changeIcon(icon: ProjectIconName) {
    if (!current) return;
    dispatch(setProjectIcon({ id: current.id, icon }));
    await api(`/projects/${current.id}`, { method: 'PATCH', body: JSON.stringify({ icon }) }).catch(() => undefined);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-md border bg-background px-2 text-left hover:bg-accent" aria-label="Switch project">
        <ProjectIcon name={current?.icon} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{current?.name ?? 'Projects'}</span>
        <ChevronsUpDown className="size-4 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]" align="start">
        <DropdownMenuLabel>Projects</DropdownMenuLabel>
        {projects.length === 0 ? <DropdownMenuItem disabled>No projects yet</DropdownMenuItem> : null}
        {projects.map((project) => (
          <DropdownMenuItem key={project.id} aria-label={project.name} onSelect={() => openProject(project.id)}>
            <ProjectIcon name={project.icon} />
            <span className="min-w-0 flex-1 truncate">{project.name}</span>
            {project.id === current?.id ? <Check className="size-4" aria-hidden /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem aria-label="All projects" onSelect={() => router.push('/projects')}>All projects</DropdownMenuItem>
        <DropdownMenuItem aria-label="New project" onSelect={() => router.push('/projects?new=1')}>
          <Plus /> New project
        </DropdownMenuItem>
        {current ? (
          <>
            <DropdownMenuSeparator />
            <div className="px-1.5 py-1.5"><IconPicker value={current.icon} onChange={changeIcon} /></div>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
