'use client';

import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { ThemeMenu } from '@/features/theme/theme-menu';
import { clearSession } from '@/features/session/session-slice';
import { api } from '@/lib/api';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

export function UserMenu({ compact = false }: { compact?: boolean }) {
  const user = useAppSelector((state) => state.session.user);
  const status = useAppSelector((state) => state.session.status);
  const dispatch = useAppDispatch();
  const router = useRouter();
  if (!user) return <Skeleton className="size-7 rounded-full" aria-label={status === 'error' ? 'Signed out' : 'Loading account'} />;
  const initials = user.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn('flex cursor-pointer items-center gap-2 rounded-md py-1.5 text-left hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent', compact ? 'px-1' : 'w-full px-2')} aria-label={user.name}>
        <Avatar size="sm"><AvatarFallback>{initials}</AvatarFallback></Avatar>
        {compact ? null : (
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{user.orgName}</span>
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={compact ? 'end' : 'start'} className="w-52">
        <DropdownMenuLabel className="font-normal">
          <span className="block text-sm">{user.name}</span>
          <span className="block text-xs text-muted-foreground">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <ThemeMenu />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          aria-label="Sign out"
          onSelect={() => api('/auth/logout', { method: 'POST' }).then(() => {
            dispatch(clearSession());
            router.replace('/login');
          })}
        >
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
