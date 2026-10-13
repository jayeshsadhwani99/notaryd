import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { themeBootScript } from '@/features/theme/theme-boot';
import { StoreProvider } from '@/store/provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Notaryd',
  description: 'Proof that a flow worked, on a build, with a screenshot of every step.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="notaryd-theme" strategy="beforeInteractive">
          {themeBootScript}
        </Script>
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
