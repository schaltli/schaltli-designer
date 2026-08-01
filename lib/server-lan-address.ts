import os from "os"

// Server-side counterpart to hil/epaper/orchestrator.js's localLanAddress()
// helper - same bug, same fix, different caller. app/api/deploy/route.ts
// needs to hand the *device* a URL it can actually reach; the browser's
// own window.location.origin is NOT that (2026-08-01 finding, reported
// live: a user browsing the designer via http://localhost:3000 had that
// literal "localhost" embedded in the deploy trigger, which a device can
// never resolve to anything but itself). The server can inspect its own
// network interfaces, which the browser categorically cannot - so this
// resolution belongs here, not client-side.
//
// Unlike the orchestrator (which has a specific --device IP to match
// subnets against), there's no known device IP at this point - discovery
// is MQTT-based, not IP-based - so this uses a broader heuristic instead:
// skip common VPN/tunnel interface names (Tailscale bit us during this
// same investigation) and prefer private-range addresses.
const VPN_NAME_PATTERN = /tailscale|wireguard|zerotier|^tun|^tap|^ppp|vpn/i

function isPrivateIPv4(address: string): boolean {
  const parts = address.split(".").map(Number)
  if (parts.length !== 4) return false
  const [a, b] = parts
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

export function serverLanAddress(): string | null {
  const interfaces = os.networkInterfaces()
  let fallback: string | null = null

  for (const [name, addrs] of Object.entries(interfaces)) {
    if (VPN_NAME_PATTERN.test(name)) continue
    for (const addr of addrs || []) {
      if (addr.family !== "IPv4" || addr.internal) continue
      if (!fallback) fallback = addr.address
      if (isPrivateIPv4(addr.address)) return addr.address
    }
  }

  return fallback
}
