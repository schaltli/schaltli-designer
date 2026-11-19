import type { Metadata } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'

export const metadata: Metadata = {
  title: 'Schaltli Designer',
  description: 'Schaltli Designer - a designer for MQTT-driven e-paper/embedded display screens',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <head>
        {/* The broker the server names (SCHALTLI_BROKER_URL, #82), set
            before the page connects anywhere: a plain script, so the page
            itself stays static and the value is the running server's. */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="/api/broker-default" />
      </head>
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
        {children}
      </body>
    </html>
  )
}
