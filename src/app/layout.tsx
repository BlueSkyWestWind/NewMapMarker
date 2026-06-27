import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { PublicEnvScript } from '@/components/public-env-script';
import './globals.css';
import Providers from './providers';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'MapMarker Pro',
  description: '장비·축전지 위치 관리 지도 대시보드',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PublicEnvScript />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
