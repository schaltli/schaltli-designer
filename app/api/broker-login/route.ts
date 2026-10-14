import { NextResponse } from "next/server"
import { isDemo, refuseInDemo } from "@/lib/demo-mode"
import { readBrokerLogin, writeBrokerLogin } from "@/lib/broker-login"

/**
 * GET /api/broker-login - the broker login every browser connects with
 * (lib/broker-login.ts, #67). PUT { username, password } - keeps a login
 * that just connected in «Listen to Broker»; an empty username forgets
 * it.
 */
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  // The demo's broker takes anyone, and its login is nobody's business.
  if (isDemo(request)) return NextResponse.json({ username: "", password: "" })
  return NextResponse.json(await readBrokerLogin(), { headers: { "Cache-Control": "no-store" } })
}

export async function PUT(request: Request) {
  const refused = refuseInDemo(request)
  if (refused) return refused
  const body = await request.json().catch(() => null)
  const username = body?.username
  const password = body?.password
  if (typeof username !== "string" || typeof password !== "string" || username.length > 256 || password.length > 256) {
    return NextResponse.json({ error: "A login is a username and a password, each a string of at most 256 characters" }, { status: 400 })
  }
  await writeBrokerLogin({ username: username.trim(), password: username.trim() ? password : "" })
  return NextResponse.json({ success: true })
}
