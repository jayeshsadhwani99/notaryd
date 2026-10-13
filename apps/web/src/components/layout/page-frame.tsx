'use client';

import { motion } from 'framer-motion';
import { usePathname } from 'next/navigation';

export function PageFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className="flex w-full flex-col gap-4 p-4 md:p-5"
    >
      {children}
    </motion.div>
  );
}
