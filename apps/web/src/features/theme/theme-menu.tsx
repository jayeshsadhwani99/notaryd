'use client';

import { Monitor, Moon, Sun } from 'lucide-react';
import { setThemeMode } from '@/features/theme/theme-slice';
import { themeModes, type ThemeMode } from '@/features/theme/theme-types';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

const icons = { system: Monitor, light: Sun, dark: Moon };

export function ThemeMenu() {
  const mode = useAppSelector((state) => state.theme.mode);
  const dispatch = useAppDispatch();
  return (
    <>
      {themeModes.map((item) => {
        const Icon = icons[item];
        const selected = mode === item;
        return (
          <DropdownMenuItem
            key={item}
            aria-checked={selected}
            aria-label={`${item} theme`}
            onSelect={() => dispatch(setThemeMode(item as ThemeMode))}
          >
            <Icon />
            <span className="capitalize">{item}</span>
            {selected ? <span className="ml-auto text-xs text-primary">On</span> : null}
          </DropdownMenuItem>
        );
      })}
    </>
  );
}
