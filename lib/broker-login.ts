import { mkdir, readFile, rename, writeFile } from "fs/promises"
import { join } from "path"

/**
 * The broker login, kept by the designer once for every browser that opens
 * it (#67, 2026-10-14). Until then the browser connected anonymously
 * everywhere but in the «Discover MQTT Topics» dialog, which remembered a
 * login for that dialog alone and only for the session - so a broker that
 * wants a password found no devices, previewed nothing and deployed nothing.
 *
 * `.data/broker-login.json`, written by app/api/broker-login when a login
 * typed into that dialog connects. Before anything is written there,
 * SCHALTLI_BROKER_USERNAME and SCHALTLI_BROKER_PASSWORD are the default, for
 * an installation that sets them up front.
 *
 * Whoever can open the designer gets the login: the designer has no login
 * of its own. In the van's WiFi that is accepted (tasks/connections-plan.md,
 * decision 7).
 */
export type BrokerLogin = { username: string; password: string }

const FILE = join(process.cwd(), ".data", "broker-login.json")

export async function readBrokerLogin(): Promise<BrokerLogin> {
  try {
    const stored = JSON.parse(await readFile(FILE, "utf8"))
    return {
      username: typeof stored.username === "string" ? stored.username : "",
      password: typeof stored.password === "string" ? stored.password : "",
    }
  } catch {
    return {
      username: process.env.SCHALTLI_BROKER_USERNAME ?? "",
      password: process.env.SCHALTLI_BROKER_PASSWORD ?? "",
    }
  }
}

export async function writeBrokerLogin(login: BrokerLogin): Promise<void> {
  await mkdir(join(process.cwd(), ".data"), { recursive: true })
  const incoming = `${FILE}.incoming`
  await writeFile(incoming, JSON.stringify({ username: login.username, password: login.password }))
  // On Windows a rename over a file another request is reading at that
  // moment fails with EPERM or EBUSY - every page that opens reads this one.
  // Under a parallel test run that dropped a forgetting PUT, and the old
  // login stayed (2026-10-27). The reader is done within milliseconds.
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(incoming, FILE)
      return
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if ((code !== "EPERM" && code !== "EBUSY" && code !== "EACCES") || attempt >= 20) throw e
      await new Promise((resolve) => setTimeout(resolve, 10 + attempt * 10))
    }
  }
}
