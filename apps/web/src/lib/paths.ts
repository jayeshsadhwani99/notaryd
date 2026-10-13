export function projectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([0-9a-f-]{36})(?:\/|$)/i);
  return match?.[1] ?? null;
}

export function sectionHref(projectId: string, pathname: string): string {
  if (pathname.includes('/runs/')) return `/projects/${projectId}/explore`;
  if (pathname.includes('/flows/')) return `/projects/${projectId}/flows`;
  const sections = ['/accounts', '/vault', '/explore', '/audit'];
  const match = sections.find((section) => pathname.includes(section));
  return match ? `/projects/${projectId}${match}` : `/projects/${projectId}`;
}
