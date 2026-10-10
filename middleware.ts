import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { allowedInDemo, demoRefusal, isDemo } from "@/lib/demo-mode"

// The demo mode's first gate (lib/demo-mode.ts): every /api request the demo
// does not do is answered here. Every route handler checks again on its own.
export function middleware(request: NextRequest) {
  if (!isDemo(request)) return NextResponse.next()
  return allowedInDemo(request.method, request.nextUrl.pathname) ? NextResponse.next() : demoRefusal()
}

export const config = { matcher: "/api/:path*" }
