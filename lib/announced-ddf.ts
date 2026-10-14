import type { MqttClient } from "mqtt"
import { computeDdfHash } from "@/lib/ddf-name"
import { TOPIC_PREFIX } from "@/lib/topic-prefix"

/**
 * What a device says about itself over the broker, fetched in the browser
 * (docs/device-contract.md §4, 2026-10-14, #70).
 *
 * A device publishes its description on `schaltli/<id>/ddf`, retained, when
 * asked on `ddf/get` - so the designer reaches no device directly, and a
 * designer in a VM behind NAT works like any other. The browser hands the
 * bytes to the designer's server (app/api/ddf/upload), which keeps no MQTT
 * connection of its own. A device older than that still names a `url` in
 * its hello, and is fetched from there (app/api/ddf/fetch).
 */
export interface Announcement {
  instanceId: string
  deviceId: string
  name?: string
  ddfHash?: string
  // Only from a device older than 2026-10-14.
  url?: string
}

export const DDF_WAITS = {
  // What the broker has retained arrives right after the subscription.
  retainedMs: 1500,
  // A board streams about 300 KB from flash; over a weak WiFi that is a few
  // seconds.
  answerMs: 30_000,
}

const label = (a: { name?: string; deviceId?: string; instanceId: string }) => `"${a.name || a.deviceId || a.instanceId}"`

/**
 * Waits on one topic of one device: first for what the broker retained,
 * then - if `ask` is given and nothing fitting came - publishes the request
 * and waits for the answer. Resolves with the first payload `fits` accepts,
 * or null when none came in time.
 */
async function awaitDeviceMessage(
  client: MqttClient,
  topic: string,
  fits: (payload: Uint8Array) => boolean,
  retainedMs: number,
  ask: { topic: string; answerMs: number } | null,
): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    let done = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (result: Uint8Array | null, error?: Error) => {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      client.removeListener("message", onMessage)
      client.unsubscribe(topic)
      if (error) reject(error)
      else resolve(result)
    }
    const onMessage = (t: string, payload: Uint8Array) => {
      if (t !== topic) return
      if (fits(payload)) finish(payload)
    }
    client.on("message", onMessage)
    client.subscribe(topic, (error) => {
      if (error) return finish(null, error)
      timer = setTimeout(() => {
        if (!ask) return finish(null)
        client.publish(ask.topic, "")
        timer = setTimeout(() => finish(null), ask.answerMs)
      }, retainedMs)
    })
  })
}

/**
 * Brings one announced device's description into the designer's store.
 * Resolves with what was stored; rejects with a message a person can act
 * on (#68: never an empty error).
 */
export async function loadAnnouncedDdf(
  client: MqttClient,
  device: Announcement,
  waits = DDF_WAITS,
): Promise<{ deviceId: string; ddfHash: string }> {
  // Once per description and page: the deploy dialog asks again on every
  // hello and status that changes its list, and each ask would otherwise
  // move 300 KB over the broker.
  const key = device.ddfHash ? `${device.deviceId}:${device.ddfHash.toLowerCase()}` : null
  const running = key ? loading.get(key) : undefined
  if (running) return running
  const load = loadOnce(client, device, waits)
  if (key) {
    loading.set(key, load)
    load.catch(() => loading.delete(key))
  }
  return load
}

const loading = new Map<string, Promise<{ deviceId: string; ddfHash: string }>>()

async function loadOnce(client: MqttClient, device: Announcement, waits: typeof DDF_WAITS): Promise<{ deviceId: string; ddfHash: string }> {
  if (device.url) {
    const res = await fetch("/api/ddf/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: device.deviceId, ddfHash: device.ddfHash, url: device.url }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(
        `Could not load ${label(device)}'s device description from ${device.url}: ${body.error || `error ${res.status}`}. ` +
          `Its firmware is older than the description over the broker - update it, or check that this designer can reach the device.`,
      )
    }
    return { deviceId: body.deviceId, ddfHash: body.ddfHash }
  }
  const hash = device.ddfHash?.toLowerCase()
  if (!hash) throw new Error(`${label(device)} announces no device description.`)

  const base = `${TOPIC_PREFIX}/${device.instanceId}`
  const bytes = await awaitDeviceMessage(
    client,
    `${base}/ddf`,
    (payload) => payload.length > 0 && computeDdfHash(payload) === hash,
    waits.retainedMs,
    { topic: `${base}/ddf/get`, answerMs: waits.answerMs },
  )
  if (!bytes) {
    throw new Error(
      `${label(device)} did not send its device description within ${Math.round(waits.answerMs / 1000)} s. ` +
        `It may be switched off, or the broker refuses a message this large (about 300 KB) - ` +
        `in Mosquitto that is message_size_limit.`,
    )
  }
  const res = await fetch(
    `/api/ddf/upload?deviceId=${encodeURIComponent(device.deviceId)}&ddfHash=${encodeURIComponent(hash)}`,
    { method: "POST", headers: { "Content-Type": "application/zip" }, body: bytes as BodyInit },
  )
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${label(device)}'s device description was refused: ${body.error || `error ${res.status}`}`)
  return { deviceId: body.deviceId, ddfHash: body.ddfHash }
}

/**
 * The project a device keeps for recovery, asked for over the broker
 * (`recovery/get` → `recovery`, not retained). Resolves with the export
 * zip's bytes, or null when the device says it has none (an empty answer);
 * rejects when no answer came.
 */
export async function requestRecoveryCopy(
  client: MqttClient,
  device: { instanceId: string; deviceId?: string; name?: string },
  answerMs = DDF_WAITS.answerMs,
): Promise<Uint8Array | null> {
  const base = `${TOPIC_PREFIX}/${device.instanceId}`
  let answered = false
  const bytes = await awaitDeviceMessage(
    client,
    `${base}/recovery`,
    () => {
      answered = true
      return true
    },
    0,
    { topic: `${base}/recovery/get`, answerMs },
  )
  if (!answered) {
    throw new Error(
      `${label(device)} did not answer within ${Math.round(answerMs / 1000)} s. ` +
        `It may be switched off, its firmware may be too old, or the broker refuses a message this large.`,
    )
  }
  return bytes && bytes.length > 0 ? bytes : null
}
