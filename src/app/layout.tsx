// file: src/app/layout.tsx
import type { Metadata } from 'next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import ClientLayout from './ClientLayout'
import './globals.css'

/* ------------------------------------------------------------------ */
/* METADATA GLOBAL (PWA + SEO)                                         */
/* ------------------------------------------------------------------ */

export const metadata: Metadata = {
  title: 'Cal Blay App',
  description:
    'WebApp operativa de Cal Blay – esdeveniments, personal, quadrants i incidències.',

  manifest: '/manifest.json',

  appleWebApp: {
    capable: true,
    title: 'Cal Blay',
    statusBarStyle: 'default',
  },

  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/icon-192.png',
  },
}

/* ------------------------------------------------------------------ */
/* VIEWPORT (OBLIGATORI PER theme-color)                               */
/* ------------------------------------------------------------------ */

export const viewport = {
  themeColor: '#1e293b',
}

/* ------------------------------------------------------------------ */
/* ROOT LAYOUT (SERVER)                                                */
/* ------------------------------------------------------------------ */

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ca">
      <body suppressHydrationWarning>
        {/* 
          IMPORTANT:
          ClientLayout embolcalla TOTA l'app.
          Això garanteix:
          - SessionProvider actiu
          - useSession funcional a tot arreu
          - zero errors 500
        */}
        <ClientLayout>
          {children}
        </ClientLayout>
        <SpeedInsights />
      </body>
    </html>
  )
}
