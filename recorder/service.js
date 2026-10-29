// The recorder as a broker client (docs/2026-10-16-charts.md decisions 1-7,
// tasks/charts-recorder-plan.md decisions 5, 7, 8): it records the union of
// what every display's charts want and lays the history retained on the
// broker. Only one records per broker: the others wait, passive, until it
// is gone.

"use strict"

const os = require("os")
const mqtt = require("mqtt")
const { Series, RESOLUTIONS, dateOf, dayPayload, recentPayload, dailyPayload, keptDates } = require("./history")
const store = require("./store")

const PREFIX = "schaltli/history"
const WANTS = `${PREFIX}/wants/`
const PRESENCE = `${PREFIX}/recorder`
// recent6: the last 6 hours at 5 minutes, under 2 KB - 48 hours were about
// 10 KB, past a device's MQTT buffer (tasks/charts-firmware-plan.md decision 1).
const RECENT6_SPAN = 6 * 3600
// A recorder whose presence was not renewed for this long is taken for gone.
const STALE = 180

/**
 * Where a topic's history lies. A `#` cannot be published in a topic name,
 * so a field's path follows a `~` (lib/chart.ts historyName, the same rule).
 */
function historyName(topic) {
  return topic.replace("#", "~")
}

function bareTopic(topic) {
  const hash = topic.indexOf("#")
  return hash === -1 ? topic : topic.slice(0, hash)
}

/**
 * options: broker (url), file (where the history is kept, none for none),
 * tz, id, clock (() => unix seconds), tickMs (how often it publishes; the
 * default lays each payload at the end of its step), saveMs, log.
 */
function createRecorder(options) {
  const clock = options.clock ?? (() => Date.now() / 1000)
  const tz = options.tz ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const id = options.id ?? os.hostname()
  const log = options.log ?? ((line) => console.log(`[recorder] ${line}`))
  const fast = options.tickMs !== undefined
  const series = new Map() // topic → Series
  const wants = new Map() // instance → want[]
  const published = new Map() // topic → Set of dates laid on the broker
  let client = null
  let active = false
  let since = Math.floor(clock())
  let presenceTimer = null
  let tickTimer = null
  let saveTimer = null
  let lastTick = clock()
  let waiting = false

  const presence = (state) => JSON.stringify({ state, id, since, seen: Math.floor(clock()) })
  const publish = (topic, payload) => client && client.publish(topic, payload, { retain: true, qos: 1 })

  function load() {
    if (!options.file) return
    const saved = store.read(options.file, log)
    if (!saved) return
    for (const o of saved.series ?? []) series.set(o.topic, Series.fromJSON(o))
    for (const [topic, dates] of saved.published ?? []) published.set(topic, new Set(dates))
    log(`read ${series.size} topic(s) from ${options.file}`)
  }

  function save() {
    if (!options.file) return
    store.write(options.file, { series: [...series.values()].map((s) => s.toJSON()), published: [...published.entries()].map(([t, d]) => [t, [...d]]) }, log)
  }

  // What every display wants, together: one series per topic.
  function applyWants() {
    const wanted = new Map()
    for (const list of wants.values()) {
      for (const w of list) {
        if (!w || typeof w.topic !== "string" || !w.topic) continue
        if (!["level", "power", "state"].includes(w.kind)) continue
        const had = wanted.get(w.topic)
        if (had && had.kind !== w.kind) {
          log(`${w.topic}: wanted as ${had.kind} and as ${w.kind} - kept as ${had.kind}`)
          continue
        }
        if (!had) wanted.set(w.topic, w)
      }
    }
    for (const [topic, w] of wanted) {
      const s = series.get(topic)
      if (!s || s.kind !== w.kind) series.set(topic, new Series(topic, w.kind, w.onMeans))
      else s.onMeans = w.onMeans ?? []
      series.get(topic).wanted = true
    }
    for (const [topic, s] of series) if (!wanted.has(topic)) s.wanted = false
    subscribeValues()
  }

  let subscribed = new Set()
  function subscribeValues() {
    if (!client) return
    const now = new Set(active ? [...series.values()].filter((s) => s.wanted).map((s) => bareTopic(s.topic)) : [])
    for (const t of now) if (!subscribed.has(t)) client.subscribe(t, { qos: 0 })
    for (const t of subscribed) if (!now.has(t)) client.unsubscribe(t)
    subscribed = now
  }

  function layDay(s, date, now) {
    publish(`${PREFIX}/${historyName(s.topic)}/day/${date}`, JSON.stringify(dayPayload(s, date, tz, now)))
    if (!published.has(s.topic)) published.set(s.topic, new Set())
    published.get(s.topic).add(date)
  }

  /** Everything kept, laid again: after a start, the broker may have lost it. */
  function layAll() {
    const now = clock()
    const kept = keptDates(tz, now)
    for (const s of series.values()) {
      s.advance(now)
      // Today, and every day something was recorded on.
      const days = new Set([dateOf(now, tz), ...(published.get(s.topic) ?? [])])
      for (const start of s.steps.m15.keys()) days.add(dateOf(start, tz))
      for (const [a, b] of s.periods) for (let t = a; t <= (b ?? now); t += 3600) days.add(dateOf(t, tz))
      for (const date of kept) if (days.has(date)) layDay(s, date, now)
      layRecent(s, now)
      publish(`${PREFIX}/${historyName(s.topic)}/daily`, JSON.stringify(dailyPayload(s, tz, now)))
    }
  }

  function layRecent(s, now) {
    publish(`${PREFIX}/${historyName(s.topic)}/recent`, JSON.stringify(recentPayload(s, "m1", 2 * 3600, now)))
    publish(`${PREFIX}/${historyName(s.topic)}/recent6`, JSON.stringify(recentPayload(s, "m5", RECENT6_SPAN, now)))
  }

  /** At the end of each step: what changed in it, and the days that fell out cleared. */
  function tick(first = false) {
    if (!active) return
    const now = clock()
    const crossed = (len) => fast || Math.floor(now / len) !== Math.floor(lastTick / len)
    const kept = new Set(keptDates(tz, now))
    const today = dateOf(now, tz)
    for (const s of series.values()) {
      s.advance(now)
      s.prune(now)
      if (s.wanted) {
        if (crossed(RESOLUTIONS.m1)) publish(`${PREFIX}/${historyName(s.topic)}/recent`, JSON.stringify(recentPayload(s, "m1", 2 * 3600, now)))
        if (crossed(RESOLUTIONS.m5)) publish(`${PREFIX}/${historyName(s.topic)}/recent6`, JSON.stringify(recentPayload(s, "m5", RECENT6_SPAN, now)))
        if (crossed(RESOLUTIONS.m15) || dateOf(lastTick, tz) !== today) {
          layDay(s, today, now)
          // The day just ended, once more whole.
          if (dateOf(lastTick, tz) !== today) layDay(s, dateOf(lastTick, tz), now)
          publish(`${PREFIX}/${historyName(s.topic)}/daily`, JSON.stringify(dailyPayload(s, tz, now)))
        }
      }
      const dates = published.get(s.topic)
      for (const date of [...(dates ?? [])]) {
        if (kept.has(date)) continue
        publish(`${PREFIX}/${historyName(s.topic)}/day/${date}`, "")
        dates.delete(date)
      }
      // Wanted by nobody and nothing left: gone.
      if (!s.wanted && (!dates || dates.size === 0) && s.steps.m15.size === 0 && s.periods.length === 0) series.delete(s.topic)
    }
    // Its clock once a minute: a display without one knows which day is today.
    if (first || crossed(RESOLUTIONS.m1)) publish(`${PREFIX}/now`, JSON.stringify({ time: Math.floor(now), tz }))
    lastTick = now
  }

  function becomeActive() {
    if (active) return
    active = true
    since = Math.floor(clock())
    log(`recording as ${id}`)
    publish(PRESENCE, presence("online"))
    presenceTimer = setInterval(() => publish(PRESENCE, presence("online")), 60_000)
    subscribeValues()
    layAll()
    tick(true)
  }

  function onMessage(topic, buffer) {
    const payload = buffer.toString()
    if (topic === PRESENCE) {
      if (active) return
      let other = null
      try {
        other = payload ? JSON.parse(payload) : null
      } catch {}
      const gone = !other || other.state !== "online" || other.id === id || clock() - (other.seen ?? 0) > STALE
      if (gone) becomeActive()
      else if (!waiting) log(`another recorder (${other.id}) is recording on this broker - waiting until it is gone`)
      waiting = true
      return
    }
    if (topic.startsWith(WANTS)) {
      const instance = topic.slice(WANTS.length)
      let list = []
      try {
        list = payload ? JSON.parse(payload).series ?? [] : []
      } catch {
        log(`${topic}: not JSON, ignored`)
      }
      if (list.length > 0) wants.set(instance, list)
      else wants.delete(instance)
      applyWants()
      return
    }
    if (!active) return
    const t = clock()
    for (const s of series.values()) if (s.wanted && bareTopic(s.topic) === topic) s.ingest(payload, t)
  }

  return {
    id,
    get active() {
      return active
    },
    series,
    tick: () => tick(),
    save,
    start() {
      load()
      return new Promise((resolve, reject) => {
        client = mqtt.connect(options.broker, {
          clientId: `schaltli-recorder-${id}-${process.pid}-${Math.random().toString(16).slice(2, 8)}`,
          will: { topic: PRESENCE, payload: presence("offline"), retain: true, qos: 1 },
          reconnectPeriod: 5000,
        })
        client.on("message", onMessage)
        client.once("error", reject)
        client.on("connect", () => {
          client.subscribe([`${WANTS}+`, PRESENCE], { qos: 1 }, () => {
            // The retained presence comes with the subscription; none at all
            // means nobody records here.
            setTimeout(() => {
              if (!active && !waiting) becomeActive()
              resolve()
            }, options.settleMs ?? 1000)
          })
          if (active) subscribeValues()
        })
        tickTimer = setInterval(tick, options.tickMs ?? 5000)
        saveTimer = setInterval(save, options.saveMs ?? 30 * 60_000)
      })
    },
    async stop() {
      clearInterval(tickTimer)
      clearInterval(saveTimer)
      clearInterval(presenceTimer)
      if (active) {
        tick()
        save()
        await new Promise((resolve) => client.publish(PRESENCE, presence("offline"), { retain: true, qos: 1 }, resolve))
      }
      await new Promise((resolve) => client.end(false, {}, resolve))
      active = false
    },
  }
}

module.exports = { createRecorder, historyName, PREFIX }
