'use client';

import { Suspense, useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { OpenCreate } from '@/app/(dash)/projects/open-create';
import { Plus } from 'lucide-react';
import { CreateProjectDialog } from '@/features/projects/create-dialog';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorAlert } from '@/components/feedback/error-alert';
import { StatusBadge } from '@/components/feedback/status-badge';
import { PageHeader } from '@/components/layout/page-header';
import { ProjectIcon } from '@/components/project/project-icon';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAppSelector } from '@/store/hooks';

export default function ProjectsPage() {
  const projects = useAppSelector((state) => state.projects.items);
  const status = useAppSelector((state) => state.projects.status);
  const error = useAppSelector((state) => state.projects.error);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const showCreate = useCallback(() => setOpen(true), []);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) router.replace('/projects', { scroll: false });
  }

  return (
    <>
      <PageHeader
        title="Projects"
        description="Each project is one app, one vault, and one set of flows."
        actions={<Button aria-label="Add a project" onClick={showCreate}><Plus /> Add a project</Button>}
      />
      <ErrorAlert message={error} />
      {status === 'loading' && projects.length === 0 ? <Skeleton className="h-16 w-full" /> : null}
      {status !== 'loading' && projects.length === 0 ? <EmptyState title="No projects yet" body="Add one to review its routes and map its flows." /> : null}
      <div className="grid gap-2">
        {projects.map((project) => (
          <Link key={project.id} href={`/projects/${project.id}`} aria-label={project.name} className="block rounded-lg">
            <Card className="hover:ring-primary/40">
              <CardContent className="flex items-center gap-3">
                <ProjectIcon name={project.icon} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{project.name}</span>
                  <span className="text-xs text-muted-foreground">{project.framework ?? 'Unknown framework'} · {project.mode}</span>
                </span>
                <StatusBadge value={project.status} />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <Suspense fallback={null}><OpenCreate onOpen={showCreate} /></Suspense>
      <CreateProjectDialog open={open} onOpenChange={onOpenChange} />
    </>
  );
}
