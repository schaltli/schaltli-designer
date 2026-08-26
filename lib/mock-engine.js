// What a mock host answers when a command arrives - the rules, with no
// broker, no filesystem and no output of its own (2026-08-25).
//
// Extracted from hil/simulate-project.js so a second caller can use it: the
// designer's preview. Preview today is honest about nothing being connected
// but dishonest about what a tap does - a Switch tap does nothing at all
// (no writeValue handler exists anywhere in the UI), and a SoftwareButton's
// send-mqtt writes its payload onto the *command* topic, which no object on
// screen reads. `handlePreviewButtonAction` even admits it: without a toast,
// "a send-mqtt to a topic nothing on screen displays would otherwise look
// like the button did nothing at all". The missing piece is exactly this
// file, and it must be the same one the mock uses - a rule that behaves
// differently in the preview than on the wire would send someone hunting
// through firmware for a difference that lives in the designer.
//
// Why .js in a lib/ that is otherwise TypeScript: hil/simulate-project.js is
// plain Node, and this repo has no tsx or ts-node to run TypeScript with.
// `allowJs` is on, so the app imports this happily and infers its types from
// the JSDoc below; adding a TypeScript runner for one script would be the
// heavier trade.
//
// Deliberately pure. It returns what *should* be published and never
// publishes; the CLI hands the result to MQTT, the preview applies it to its
// own value map. Same decisions, two very different destinations, and the
// only way to keep them identical is for neither to make any.

/**
 * @typedef {{ topic: string, value: string }} MockPublication
 * A state topic and the payload it should now carry. Retained on a real
 * broker - state is what a device reads back after a reconnect.
 */

/**
 * @typedef {Object} MockEngine
 * @property {string[]} commandTopics   Everything worth listening to.
 * @property {string[]} derived         Human-readable derived mappings.
 * @property {string[]} declared        Human-readable declared rules.
 * @property {string[]} conflicts       Two Switches claiming one command.
 * @property {string[]} skipped         States that cannot take part.
 * @property {string[]} ruleProblems    Half-written rules.
 * @property {string[]} unhandled       Commands nothing can answer.
 * @property {(topic: string, payload: string, values: Record<string, string>) => MockPublication[]} respond
 * @property {() => MockPublication[]} seed
 */

// Recurses into children. A Switch inside a tab-control's panel is a real
// Switch that a real finger can reach; hil/combinations.js learned the same
// lesson the hard way on 2026-07-25, when a nested object's topic was
// silently left out of every run.
function collectObjects(objects, out = []) {
  for (const obj of objects || []) {
    out.push(obj)
    if (obj.children && obj.children.length > 0) collectObjects(obj.children, out)
  }
  return out
}

// Declared rules, keyed for lookup. Kept separate from derivation on
// purpose: a rule is authored, a mapping is deduced, and when they disagree
// it has to be obvious which is which.
function collectRules(project) {
  /** @type {Map<string, Map<string, any[]>>} */
  const rules = new Map()
  const problems = []
  const declared = []

  for (const topic of project.topics || []) {
    for (const rule of topic.mock || []) {
      const when = (rule.when ?? "").trim()
      if (!when) {
        problems.push(`${topic.topic}: a rule with no payload to match on`)
        continue
      }
      const effects = (rule.then || []).filter((e) => {
        if (!e.topic) {
          problems.push(`${topic.topic} "${when}": an effect with no target topic`)
          return false
        }
        return true
      })
      if (effects.length === 0) {
        problems.push(`${topic.topic} "${when}": no effects, so nothing would be answered`)
        continue
      }
      if (!rules.has(topic.topic)) rules.set(topic.topic, new Map())
      rules.get(topic.topic).set(when, effects)

      const described = effects
        .map((e) =>
          e.kind === "add"
            ? `${e.topic} ${Number(e.value) >= 0 ? "+" : ""}${e.value}`
            : `${e.topic} = "${e.value}"`,
        )
        .join(", ")
      declared.push(`${topic.topic} = "${when}"  ->  ${described}`)
    }
  }
  return { rules, problems, declared }
}

// A Switch declares both halves of its own round trip, so the mapping
//
//     writeTopic + writeValue  ->  topic = readValue
//
// needs no configuration and, more to the point, keeps no second copy of a
// fact that could drift from the first. Rename a state's value in the
// designer and this follows on the next read.
function deriveSwitchTable(project, hasRuleFor) {
  /** @type {Map<string, Map<string, {readTopic: string, readValue: string, from: string}>>} */
  const table = new Map()
  const conflicts = []
  const skipped = []
  const unhandled = []
  const derived = []

  for (const screen of project.screens || []) {
    for (const obj of collectObjects(screen.objects)) {
      if (obj.type === "SoftwareButton") {
        const action = obj.properties && obj.properties.action
        if (action && action.type === "send-mqtt" && action.mqttTopic) {
          // A button's consequence lives only in the real automation, so
          // unless a rule declares it, nothing here can answer. Named rather
          // than ignored: the difference between "this button is dead" and
          // "this button is not describable yet".
          if (!hasRuleFor(action.mqttTopic, action.mqttMessage ?? "")) {
            unhandled.push(`${obj.id}: ${action.mqttTopic} = "${action.mqttMessage ?? ""}"`)
          }
        }
        continue
      }
      if (obj.type !== "Switch") continue

      const props = obj.properties || {}
      const readTopic = props.topic
      const writeTopic = props.writeTopic
      if (!readTopic || !writeTopic) {
        skipped.push(`${obj.id}: ${!readTopic ? "no read topic" : "no write topic"}`)
        continue
      }

      for (const state of props.states || []) {
        // A state with either value blank cannot take part in a round trip:
        // nothing to match on, or nothing to answer with. Listed rather than
        // dropped quietly - it is usually a state someone started and did
        // not finish.
        if (!state.writeValue || !state.readValue) {
          skipped.push(
            `${obj.id} state "${state.label || state.id}": ${!state.writeValue ? "no write value" : "no read value"}`,
          )
          continue
        }
        if (!table.has(writeTopic)) table.set(writeTopic, new Map())
        const byValue = table.get(writeTopic)
        const existing = byValue.get(state.writeValue)
        if (existing && (existing.readTopic !== readTopic || existing.readValue !== state.readValue)) {
          // Two Switches claiming the same command means guessing, and a
          // guess here looks exactly like a firmware bug later. First one
          // wins, loudly.
          conflicts.push(
            `${writeTopic} = "${state.writeValue}" -> ${existing.readTopic}="${existing.readValue}" (${existing.from})` +
              ` vs ${readTopic}="${state.readValue}" (${obj.id}) - keeping the first`,
          )
          continue
        }
        byValue.set(state.writeValue, { readTopic, readValue: state.readValue, from: obj.id })
        derived.push(`${writeTopic} = "${state.writeValue}"  ->  ${readTopic} = "${state.readValue}"   [${obj.id}]`)
      }
    }
  }
  return { table, conflicts, skipped, unhandled, derived }
}

/**
 * Applies one effect against the values known so far.
 * @returns {MockPublication | null} null when the effect cannot be applied.
 */
function applyEffect(effect, values) {
  if (effect.kind !== "add") return { topic: effect.topic, value: effect.value }

  const delta = Number(effect.value)
  if (!Number.isFinite(delta)) return null

  const min = effect.min !== undefined && effect.min !== "" ? Number(effect.min) : undefined
  const max = effect.max !== undefined && effect.max !== "" ? Number(effect.max) : undefined
  const previous = Number(values[effect.topic])
  // An unknown topic starts at its lower bound, or at zero: the first turn
  // of a knob has to do something visible, and refusing to answer would look
  // exactly like the mock not running.
  const base = Number.isFinite(previous) ? previous : min ?? 0

  let next = base + delta
  if (min !== undefined && next < min) next = min
  if (max !== undefined && next > max) next = max
  return { topic: effect.topic, value: String(next) }
}

/**
 * Reads a project and returns everything needed to answer commands from it.
 * @param {any} project A project.json - editable or device export, both carry
 *   the same topics and screens.
 * @returns {MockEngine}
 */
function buildMockEngine(project) {
  const { rules, problems, declared } = collectRules(project)
  const ruleFor = (topic, payload) => rules.get(topic)?.get((payload ?? "").trim())
  const { table, conflicts, skipped, unhandled, derived } = deriveSwitchTable(project, (t, p) => !!ruleFor(t, p))

  return {
    commandTopics: [...new Set([...table.keys(), ...rules.keys()])],
    derived,
    declared,
    conflicts,
    skipped,
    ruleProblems: problems,
    unhandled,

    respond(topic, payload, values) {
      const value = (payload ?? "").toString()
      // A declared rule wins over a derived mapping for the same payload:
      // the author said so explicitly, and derivation is a convenience.
      const effects = ruleFor(topic, value)
      if (effects) {
        const out = []
        // Sequential on purpose - two effects on the same topic in one rule
        // must see each other's result, the way they would if published one
        // after the other.
        const running = { ...values }
        for (const effect of effects) {
          const publication = applyEffect(effect, running)
          if (!publication) continue
          running[publication.topic] = publication.value
          out.push(publication)
        }
        return out
      }

      const target = table.get(topic)?.get(value)
      if (!target) return []
      return [{ topic: target.readTopic, value: target.readValue }]
    },

    seed() {
      // One value per read topic, so a freshly started device or preview has
      // a state to show instead of "?". Which mapping wins hardly matters;
      // the point is that some value exists.
      const seen = new Set()
      const out = []
      for (const byValue of table.values()) {
        for (const target of byValue.values()) {
          if (seen.has(target.readTopic)) continue
          seen.add(target.readTopic)
          out.push({ topic: target.readTopic, value: target.readValue })
        }
      }
      return out
    },
  }
}

module.exports = { buildMockEngine, applyEffect, collectObjects }
