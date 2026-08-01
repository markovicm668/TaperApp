import React from 'react';
import type { Metadata } from 'next';
import Script from 'next/script';
import { IBM_Plex_Mono, Inter, Source_Serif_4 } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import AppWrapper from './AppWrapper';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', weight: ['300', '400', '500', '600'] });
const sourceSerif = Source_Serif_4({ subsets: ['latin'], variable: '--font-source-serif' });
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-ibm-plex-mono',
  weight: ['400', '500'],
});

export const metadata: Metadata = {
  title: 'Tailor - Tailor resumes to job description with keyword matching and optimization',
  description: 'Tailor your resume to any job description with keyword matching, ATS optimization, and rewrite suggestions.',
  generator: 'v0.app',
  icons: {
    icon: '/favicon.ico',
  },
  verification: {
    google: 'REPLACE_WITH_YOUR_GOOGLE_VERIFICATION_CODE',
  },  
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <Script
          data-website-id="dfid_dNQW78mhptvPg00g6rV6g"
          data-domain="trytailor.cv"
          src="https://datafa.st/js/script.js"
          strategy="afterInteractive"
        />
      </head>
      <body className={`${inter.variable} ${sourceSerif.variable} ${plexMono.variable} font-sans antialiased`}>
        <AppWrapper>{children}</AppWrapper>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
