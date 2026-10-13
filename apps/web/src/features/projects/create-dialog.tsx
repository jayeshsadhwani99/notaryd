'use client';

import { CreateProjectForm } from '@/features/projects/create-form';
import { AppDialog } from '@/components/modal/app-dialog';

export function CreateProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title="Add a project" description="A local path reviews code. A sandbox or URL is what the browser explores.">
      <CreateProjectForm onDone={() => onOpenChange(false)} />
    </AppDialog>
  );
}
