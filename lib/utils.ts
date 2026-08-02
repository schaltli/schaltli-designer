import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// crypto.randomUUID() only exists in secure contexts (HTTPS, or the
// literal hostname "localhost") - this app is meant to be reachable over
// plain HTTP on a LAN IP (e.g. a self-hosted Pekaway instance at
// http://192.168.x.x:3000, no TLS), which is NOT a secure context, so
// randomUUID() throws "is not a function" there. crypto.getRandomValues()
// has no such restriction, so build a UUID v4 from that instead - this
// doesn't need to be cryptographically unguessable, just unique enough to
// track one deploy attempt against another.
export function generateUuid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
