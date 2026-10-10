// «Your van», the scene beside the demo's designer
// (docs/2026-10-09-demo-instance.md, decision 8): the demo van drawn side on,
// under a sky that follows its clock, its windows and lamps lit by what the
// screens switch. Here, beside the demo van, and not in the designer, whose
// own code names nothing of a van (e2e/no-van-words.spec.ts): the designer
// only draws what sceneSvg() returns from the values of SCENE_TOPICS.
//
// Plain flat drawing, 300 wide. A better illustration can replace it; the
// topics and the rules for lighting stay.

/** What the scene reads from the broker. */
const SCENE_TOPICS = [
  "schaltli/demo/daylight",
  "schaltli/demo/time",
  "schaltli/state/dimmer/1/level",
  "schaltli/state/dimmer/2/level",
  "schaltli/state/dimmer/3/level",
  "schaltli/state/dimmer/1/name",
  "schaltli/state/dimmer/2/name",
  "schaltli/state/dimmer/3/name",
  "schaltli/state/relay/1/power",
  "schaltli/state/relay/2/power",
  "schaltli/state/relay/1/name",
  "schaltli/state/relay/2/name",
  "schaltli/state/relay/3/power",
  "schaltli/state/tank/1/level",
  "schaltli/state/tank/2/level",
  "schaltli/state/tank/1/name",
  "schaltli/state/tank/2/name",
  "schaltli/demo/shower",
  "schaltli/demo/refill",
  "schaltli/demo/puddle",
]

/**
 * What a visitor can do in the scene: a click on a part with
 * data-action="<name>" publishes payload "start" on COMMAND_PREFIX + name.
 * The demo van carries it out (integrations/vanpi/demo-van.js).
 */
const COMMAND_PREFIX = "schaltli/cmnd/demo/"

const W = 300
const H = 340

function clamp01(v) {
  return Math.max(0, Math.min(1, v))
}

function hex(c) {
  return `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`
}

function rgb(h) {
  return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
}

function mix(a, b, t) {
  const ca = rgb(a)
  const cb = rgb(b)
  return hex(ca.map((v, i) => v + (cb[i] - v) * clamp01(t)))
}

function escapeXml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c])
}

/** The scene's state from the broker's values (strings, as they arrive). */
function sceneState(values) {
  const num = (topic) => {
    const n = Number(values[topic])
    return Number.isFinite(n) ? n : 0
  }
  const time = /^\d\d:\d\d$/.test(values["schaltli/demo/time"] || "") ? values["schaltli/demo/time"] : "12:00"
  const [hh, mm] = time.split(":").map(Number)
  return {
    daylight: clamp01(num("schaltli/demo/daylight")),
    time,
    phase: (hh * 60 + mm) / (24 * 60),
    lights: [1, 2, 3].map((n) => ({
      level: clamp01(num(`schaltli/state/dimmer/${n}/level`) / 100),
      name: values[`schaltli/state/dimmer/${n}/name`] || ["Innenlicht", "Küche", "Einstieg"][n - 1],
    })),
    lamps: [1, 2].map((n) => ({
      on: values[`schaltli/state/relay/${n}/power`] === "on",
      name: values[`schaltli/state/relay/${n}/name`] || ["Lichterkette", "Aussenlicht"][n - 1],
    })),
    tanks: [1, 2].map((n) => ({
      level: values[`schaltli/state/tank/${n}/level`] === undefined ? null : clamp01(num(`schaltli/state/tank/${n}/level`) / 100),
      name: values[`schaltli/state/tank/${n}/name`] || ["Frischwasser", "Grauwasser"][n - 1],
    })),
    draining: values["schaltli/state/relay/3/power"] === "on",
    shower: values["schaltli/demo/shower"] === "on",
    refill: values["schaltli/demo/refill"] === "on",
    puddle: clamp01(num("schaltli/demo/puddle")),
  }
}

let drawn = 0

/**
 * The scene as an SVG string. Its gradients get ids of their own per
 * drawing, so two scenes in one page do not take each other's sky.
 */
function sceneSvg(values = {}) {
  const s = sceneState(values)
  const id = `vs${++drawn}`
  const d = s.daylight
  // Dusk and dawn: warm where the sun is low but up, or just gone.
  const low = clamp01(1 - Math.abs(d - 0.12) / 0.2) * (s.phase > 0.15 && s.phase < 0.85 ? 1 : 0)
  const skyTop = mix(mix("#0b1630", "#3d7fc1", d * 1.4), "#5b4a8a", low * 0.5)
  const skyLow = mix(mix("#1a2a4f", "#a9dcf3", d * 1.4), "#f2a65a", low)
  const night = 1 - clamp01(d * 2.5) // how dark the world is
  const ground = mix("#6aa84f", "#1f3322", night)
  const groundFar = mix("#8cc56e", "#2a4430", night)

  // The sun on its arc from dawn (phase 0.25) to dusk (0.75); the moon on the other half.
  const arc = (p) => {
    const a = Math.PI * clamp01((p - 0.25) / 0.5)
    return { x: 30 + (W - 60) * (1 - (Math.cos(a) + 1) / 2), y: 150 - Math.sin(a) * 110 }
  }
  const sun = arc(s.phase)
  const moon = arc(((s.phase + 0.5) % 1))
  const stars = clamp01(night * 1.2 - 0.2)

  const [inside, kitchen, step] = s.lights
  const [fairy, outside] = s.lamps
  const lit = (level) => mix("#2c3e50", "#ffd27a", level)
  const glass = mix("#a9d6f5", "#24364a", night)
  const windowFill = (level) => (level > 0 ? lit(0.35 + level * 0.65) : glass)
  const glow = (level, r, cx, cy) =>
    level > 0
      ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#${id}-glow)" opacity="${(0.25 + 0.75 * night) * level}"/>`
      : ""
  const shade = 0.5 * night // the van itself in the dark

  const starDots = stars > 0
    ? [[22, 22], [58, 48], [96, 18], [140, 36], [182, 14], [214, 44], [236, 70], [286, 60], [40, 80], [120, 70], [262, 96]]
        .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 ? 1 : 1.5}" fill="#fff" opacity="${stars}"/>`)
        .join("")
    : ""

  // The fairy light along the van's side, under the roof, the whole length:
  // a wire sagging between hooks, a bulb every few centimetres. In the van's
  // own coordinates (drawn inside its group).
  const hooks = [48, 144, 240, 336, 432]
  const sag = (x) => {
    const i = Math.min(hooks.length - 2, Math.max(0, hooks.findIndex((h, k) => x >= h && x <= hooks[k + 1])))
    const t = (x - hooks[i]) / (hooks[i + 1] - hooks[i])
    return 62 + 10 * 4 * t * (1 - t)
  }
  const wire = hooks
    .slice(1)
    .map((h, k) => `Q ${(hooks[k] + h) / 2} ${62 + 20} ${h} 62`)
    .join(" ")
  const colours = ["#ff6b6b", "#ffd93d", "#6bcb77", "#4d96ff"]
  const bulbs =
    `<path d="M ${hooks[0]} 62 ${wire}" fill="none" stroke="${mix("#555", "#222", night)}" stroke-width="1.6"/>` +
    Array.from({ length: 16 }, (_, i) => {
      const x = 60 + i * 24
      const y = sag(x) + 3
      const colour = colours[i % 4]
      return (fairy.on ? `<circle cx="${x}" cy="${y}" r="16" fill="${colour}" opacity="${0.12 + 0.3 * night}"/>` : "") +
        `<circle data-part="lamp-1" cx="${x}" cy="${y}" r="5" fill="${fairy.on ? colour : mix("#8a8a8a", "#3a3a3a", night)}"/>`
    }).join("")

  const legend = [
    ...s.lights.map((l) => [l.name, l.level > 0 ? `${Math.round(l.level * 100)} %` : "off", l.level > 0]),
    ...s.lamps.map((l) => [l.name, l.on ? "on" : "off", l.on]),
    ...s.tanks.filter((t) => t.level !== null).map((t) => [t.name, `${Math.round(t.level * 100)} %`, "water"]),
  ]
    .map(([name, value, on], i) => {
      const y = 262 + Math.floor(i / 2) * 20
      const x = i % 2 ? 158 : 12
      const dot = on === "water" ? "#4d96ff" : on ? "#ffc947" : "#9aa5b1"
      return `<circle cx="${x + 5}" cy="${y - 4}" r="4" fill="${dot}"/>` +
        `<text x="${x + 14}" y="${y}" font-size="11" fill="currentColor">${escapeXml(name)}: ${value}</text>`
    })
    .join("")

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, sans-serif">
<defs>
  <linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop data-part="sky-top" offset="0" stop-color="${skyTop}"/><stop offset="1" stop-color="${skyLow}"/></linearGradient>
  <radialGradient id="${id}-glow"><stop offset="0" stop-color="#ffd27a" stop-opacity="0.9"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
  <radialGradient id="${id}-pool" cx="0.5" cy="0" r="0.8"><stop offset="0" stop-color="#ffd27a" stop-opacity="0.7"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></radialGradient>
</defs>
<rect width="${W}" height="236" fill="url(#${id}-sky)"/>
${starDots}
${d > 0 ? `<circle cx="${sun.x}" cy="${sun.y}" r="14" fill="#ffd34d"/><circle cx="${sun.x}" cy="${sun.y}" r="24" fill="#ffd34d" opacity="0.25"/>` : ""}
${stars > 0 ? `<circle cx="${moon.x}" cy="${moon.y}" r="10" fill="#f4f1de" opacity="${stars}"/><circle cx="${moon.x + 4}" cy="${moon.y - 3}" r="9" fill="${skyTop}" opacity="${stars}"/>` : ""}
<path d="M0 190 Q 60 165 120 185 T 240 178 T 300 186 V 236 H 0 Z" fill="${groundFar}"/>
<rect y="214" width="${W}" height="22" fill="${ground}"/>

<!-- the van: a high-roof panel van as most conversions start (Fiat Ducato),
     facing right, drawn at 576 x 274 and scaled into the middle of the scene -->
<ellipse cx="150" cy="213" rx="124" ry="4" fill="#000" opacity="${0.18 - 0.1 * night}"/>
<g transform="translate(29 97) scale(0.42)">
  <rect x="44" y="38" width="380" height="12" rx="5" fill="#3b3f4a"/>
  <rect x="210" y="24" width="64" height="16" rx="8" fill="#e9ecef"/>
  <path d="M20 232 L20 74 Q20 52 42 52 L400 52 Q430 52 448 72 L520 148 Q526 155 538 158 L558 164 Q568 168 568 180 L568 232 Z" fill="#f7f7f5"/>
  <!-- cab door glass and windscreen -->
  <path d="M398 74 L432 74 Q438 74 442 79 L500 142 L398 142 Z" fill="${glass}"/>
  <path d="M450 74 L522 150 L530 154 L458 72 Z" fill="${mix("#cfe8f7", "#2b3d52", night)}"/>
  <!-- panel lines: rear doors, sliding door, cab door -->
  <line x1="36" y1="60" x2="36" y2="214" stroke="#d3d6da" stroke-width="2.5"/>
  <line x1="226" y1="56" x2="226" y2="216" stroke="#d3d6da" stroke-width="2.5"/>
  <line x1="388" y1="56" x2="388" y2="216" stroke="#d3d6da" stroke-width="2.5"/>
  <rect x="44" y="150" width="150" height="7" rx="3" fill="#4a4e59"/>
  <rect x="366" y="160" width="9" height="20" rx="3" fill="#4a4e59"/><rect x="398" y="160" width="9" height="20" rx="3" fill="#4a4e59"/>
  <!-- mirror -->
  <rect x="486" y="124" width="20" height="36" rx="5" fill="#2b2f38"/>
  <!-- lower cladding, bumpers, arches -->
  <path d="M10 186 L44 186 L44 236 L10 236 Z" fill="#4a4e59"/>
  <rect x="164" y="208" width="270" height="20" rx="4" fill="#4a4e59"/>
  <rect x="200" y="214" width="12" height="5" rx="2" fill="#f4a020"/><rect x="380" y="214" width="12" height="5" rx="2" fill="#f4a020"/>
  <path d="M506 196 L570 192 Q576 192 576 200 L576 232 Q576 240 566 240 L506 240 Z" fill="#4a4e59"/>
  <rect x="540" y="200" width="30" height="12" rx="3" fill="#3a3d45"/>
  <path d="M78 236 a52 52 0 0 1 104 0 Z M418 236 a52 52 0 0 1 104 0 Z" fill="#3a3d45"/>
  <!-- tail light, headlight -->
  <rect x="14" y="120" width="8" height="44" rx="2" fill="#d62828"/>
  <path d="M548 166 L564 172 L564 184 L546 182 Z" fill="${mix("#fdfdf5", "#d8d8c8", night)}"/>
  <!-- the van in the dark -->
  <path d="M20 232 L20 74 Q20 52 42 52 L400 52 Q430 52 448 72 L520 148 Q526 155 538 158 L558 164 Q568 168 568 180 L568 232 Z" fill="#000" opacity="${shade}"/>
  <!-- the fairy light -->
  ${bulbs}
  <!-- its windows, lit from inside -->
  ${inside.level > 0 ? `<circle cx="118" cy="110" r="110" fill="url(#${id}-glow)" opacity="${(0.25 + 0.75 * night) * inside.level}"/>` : ""}
  ${kitchen.level > 0 ? `<circle cx="292" cy="108" r="90" fill="url(#${id}-glow)" opacity="${(0.25 + 0.75 * night) * kitchen.level}"/>` : ""}
  <rect data-part="light-1" x="62" y="84" width="112" height="52" rx="10" fill="${windowFill(inside.level)}"/>
  <rect data-part="light-2" x="240" y="80" width="104" height="56" rx="10" fill="${windowFill(kitchen.level)}"/>
  <!-- the sliding door a little open: the shower behind it. A click takes a shower -->
  <g data-action="shower" style="cursor:pointer">
    <title>Take a shower</title>
    <rect x="344" y="64" width="44" height="152" fill="${mix("#4a6072", "#1c2a35", night)}"/>
    <path d="M344 94 h44 M344 124 h44 M344 154 h44 M344 184 h44 M366 64 v152" stroke="${mix("#5d7487", "#243543", night)}" stroke-width="2"/>
    <rect x="352" y="72" width="26" height="6" rx="3" fill="#c0c6cc"/>
    <rect x="363" y="66" width="4" height="9" fill="#c0c6cc"/>
    ${s.shower ? [354, 359, 364, 369, 374].map((x, i) => `<line data-part="shower" x1="${x}" y1="${82 + (i % 2) * 5}" x2="${x - 3}" y2="${160 + (i % 3) * 16}" stroke="#9fd3ff" stroke-width="2.5" stroke-dasharray="7 6"/>`).join("") : ""}
    <line x1="344" y1="62" x2="344" y2="216" stroke="#2b2f38" stroke-width="2"/>
    <line x1="388" y1="62" x2="388" y2="216" stroke="#9aa0a6" stroke-width="4"/>
    ${s.shower ? `<g data-part="steam" fill="#fff"><circle cx="398" cy="112" r="16" opacity="0.55"/><circle cx="410" cy="90" r="13" opacity="0.4"/><circle cx="402" cy="70" r="10" opacity="0.25"/></g>` : ""}
    <rect x="340" y="62" width="52" height="158" fill="transparent"/>
  </g>
  <!-- the fresh water filler, under the rear window. A click brings a canister -->
  <g data-action="refill" style="cursor:pointer">
    <title>Fill up the fresh water</title>
    <circle cx="150" cy="178" r="9" fill="#d3d6da" stroke="#8d99ae" stroke-width="3"/>
    <circle cx="150" cy="178" r="3" fill="#4d96ff"/>
    <circle cx="150" cy="178" r="20" fill="transparent"/>
  </g>
  ${s.refill ? `<g data-part="canister">
    <path d="M-30 214 Q 40 150 141 178" fill="none" stroke="#2b2d42" stroke-width="5"/>
    <rect x="-62" y="210" width="40" height="64" rx="6" fill="#d62828"/>
    <rect x="-54" y="200" width="18" height="12" rx="3" fill="#a61e1e"/>
    <rect x="-58" y="226" width="32" height="5" rx="2" fill="#a61e1e"/>
  </g>` : ""}
  <!-- the lamp above the sliding door -->
  ${outside.on ? `<circle cx="306" cy="62" r="70" fill="url(#${id}-glow)" opacity="${0.35 + 0.65 * night}"/>` : ""}
  <rect data-part="lamp-2" x="292" y="56" width="28" height="9" rx="4" fill="${outside.on ? "#fff3c4" : mix("#9aa0a6", "#555", night)}"/>
  <!-- the step light under the sliding door, and the ground it lights -->
  ${step.level > 0 ? `<ellipse cx="306" cy="262" rx="${80 + 50 * step.level}" ry="16" fill="url(#${id}-pool)" opacity="${(0.35 + 0.65 * night) * step.level}"/>` : ""}
  <rect data-part="light-3" x="270" y="226" width="72" height="5" rx="2" fill="${step.level > 0 ? "#fff0b8" : mix("#9aa0a6", "#4a4e59", night)}"/>
  <!-- the grey water running out of an open drain, and its puddle -->
  ${s.puddle > 0 ? `<ellipse data-part="puddle" cx="330" cy="278" rx="${20 + 110 * s.puddle}" ry="${5 + 7 * s.puddle}" fill="#7fb8e0" opacity="${0.35 + 0.4 * s.puddle}"/>` : ""}
  ${s.draining && s.tanks[1].level !== null && s.tanks[1].level > 0 ? `<path data-part="drain" d="M326 234 q -6 12 2 22 q 6 10 -2 22" fill="none" stroke="#6fb7e8" stroke-width="10" stroke-linecap="round" opacity="0.9"/>` : ""}
  <!-- wheels -->
  <circle cx="130" cy="236" r="38" fill="#2b2d42"/><circle cx="130" cy="236" r="22" fill="#9aa0a6"/><circle cx="130" cy="236" r="7" fill="#5c6370"/>
  <circle cx="470" cy="236" r="38" fill="#2b2d42"/><circle cx="470" cy="236" r="22" fill="#9aa0a6"/><circle cx="470" cy="236" r="7" fill="#5c6370"/>
</g>

<text x="${W - 10}" y="22" text-anchor="end" font-size="13" font-weight="600" fill="${d > 0.35 ? "#16324f" : "#e8eef6"}">${s.time}</text>
<g color="currentColor">${legend}</g>
</svg>`
}

module.exports = { SCENE_TOPICS, COMMAND_PREFIX, sceneSvg, sceneState }
