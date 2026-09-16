import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

// Analytics only where it exists. The script is served by Vercel's platform,
// so a self-hosted install - which is how this app is meant to run (README,
// deploy/pekaway-install.sh) - asks for /_vercel/insights/script.js, gets a
// 404, and reports nothing to anyone anyway. Found on the van's own
// installation, 2026-09-16.
const onVercel = process.env.VERCEL === '1'

export const metadata: Metadata = {
  title: 'ScreenBee Designer',
  description: 'ScreenBee Designer - a designer for MQTT-driven e-paper/embedded display screens',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
        {children}
        {onVercel && <Analytics />}
      </body>
    </html>
  )
}
