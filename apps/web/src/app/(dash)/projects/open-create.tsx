'use client';

import { useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

export function OpenCreate({ onOpen }: { onOpen: () => void }) {
  const flag = useSearchParams().get('new');
  const seen = useRef<string | null>(null);

  useEffect(() => {
    if (flag === '1' && seen.current !== '1') {
      seen.current = '1';
      onOpen();
    }
    if (flag !== '1') seen.current = null;
  }, [flag, onOpen]);

  return null;
}
