export type ProjectSummary = {
  id: string;
  name: string;
  mode: string;
  status: string;
  framework: string;
  icon: string;
  updatedAt: string;
};

export type ProjectsState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  items: ProjectSummary[];
  error: string;
};
