import React from 'react';
import type { Metadata } from 'next';
import { IBM_Plex_Mono, Manrope, Source_Serif_4 } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import AppWrapper from './AppWrapper';
import './globals.css';

const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' });
const sourceSerif = Source_Serif_4({ subsets: ['latin'], variable: '--font-source-serif' });
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-ibm-plex-mono',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'ResumeTailor - AI-Powered Resume Optimization',
  description: 'Tailor your resume to any job description with AI-powered keyword matching, ATS optimization, and rewrite suggestions.',
  generator: 'v0.app',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${sourceSerif.variable} ${plexMono.variable} font-sans antialiased`}>
        <AppWrapper>{children}</AppWrapper>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
