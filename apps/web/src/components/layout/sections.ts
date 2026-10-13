import { Compass, GitBranch, KeyRound, LayoutDashboard, ScrollText, Users, type LucideIcon } from 'lucide-react';

export type Section = { label: string; segment: string; icon: LucideIcon };

export const sections: Section[] = [
  { label: 'Overview', segment: '', icon: LayoutDashboard },
  { label: 'Accounts', segment: '/accounts', icon: Users },
  { label: 'Vault', segment: '/vault', icon: KeyRound },
  { label: 'Explore', segment: '/explore', icon: Compass },
  { label: 'Flows', segment: '/flows', icon: GitBranch },
  { label: 'Audit', segment: '/audit', icon: ScrollText },
];

export function sectionActive(pathname: string, href: string, segment: string) {
  if (segment === '') return pathname === href;
  if (segment === '/explore') return pathname.startsWith(href) || pathname.includes('/runs/');
  return pathname.startsWith(href);
}
