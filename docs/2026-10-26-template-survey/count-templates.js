// The template survey of docs/2026-10-26-template-survey.md: what Jinja each
// discovery template needs, by source.
//
//   node count-templates.js <dir of downloaded discovery sources> <van.json>
//
// <van.json>: { "<config topic>": "<payload>" } of every retained config,
// as read from the broker. A source's templates are taken line by line from
// its code, so a template built across lines or keyed elsewhere is counted
// roughly; what it needs was checked by hand against the code.
const fs = require("fs"), path = require("path")
const dir = process.argv[2], van = process.argv[3]
const items = [] // {source, key, tpl}
for (const f of fs.readdirSync(dir)) {
  for (const line of fs.readFileSync(path.join(dir, f), "utf8").split("\n")) {
    const a = line.search(/\{\{|\{%/); if (a < 0) continue
    const b = Math.max(line.lastIndexOf("}}"), line.lastIndexOf("%}")); if (b < a) continue
    const key = (line.match(/["'`]?(\w*(?:template|_tpl)\w*)["'`]?\s*[:=,\]]/) || line.match(/(\w*(?:template|_tpl)\w*)/) || [, "?"])[1]
    items.push({ source: f.replace(/\..*$/, ""), key, tpl: line.slice(a, b + 2) })
  }
}
const vanCfg = JSON.parse(fs.readFileSync(van, "utf8"))
for (const [t, p] of Object.entries(vanCfg)) {
  let c; try { c = JSON.parse(p) } catch { continue }
  for (const [k, v] of Object.entries(c)) if (/template|_tpl$/.test(k) && typeof v === "string") items.push({ source: "van", key: k, tpl: v })
  if (!Object.keys(c).some((k) => /template|_tpl$/.test(k))) items.push({ source: "van", key: "(none)", tpl: "" })
}
const feat = (t) => {
  const f = new Set()
  if (!t) return ["none"]
  const inner = [...t.matchAll(/\{\{([\s\S]*?)\}\}|\{%([\s\S]*?)%\}/g)].map((m) => m[1] ?? m[2]).join(" ")
  if (/^\s*\{\{\s*value\s*\}\}\s*$/.test(t)) return ["identity"]
  if (/^\s*\{\{\s*value_json(\.\w+|\[\s*["'\$][^\]]*\])+\s*\}\}\s*$/.test(t)) return ["path"]
  if (/\{%\s*(if|elif)/.test(t)) f.add("block-if")
  if (/\{%\s*set/.test(t)) f.add("set")
  if (/\{%\s*for/.test(t)) f.add("for")
  if (/\bif\b[^%]*\belse\b/.test(inner) && !/\{%\s*if/.test(t)) f.add("inline-if")
  if (/[^|]\|\s*\w+/.test(" " + inner)) for (const m of inner.matchAll(/\|\s*(\w+)/g)) f.add("filter:" + m[1])
  if (/(\w+)\s*\(/.test(inner)) for (const m of inner.matchAll(/(?<![\w.|])(\w+)\s*\(/g)) if (!["if"].includes(m[1])) f.add("fn:" + m[1])
  for (const m of inner.matchAll(/\.(get|keys|items|split|lower|upper|replace)\s*\(/g)) f.add("method:" + m[1])
  if (/[^\w\s"'][\s]*[*\/+%]|\s[-+*\/]\s|\*\*|\/\//.test(inner.replace(/["'][^"']*["']/g, ""))) f.add("arith")
  if (/==|!=|<=|>=|\s<\s|\s>\s|\bin\b|\bis\b/.test(inner)) f.add("compare")
  if (/\{\s*["'$]|\[\s*["'$][^\]]*,/.test(inner)) f.add("dict/list literal")
  if (/^[^{]*["{]/.test(t.replace(/\{\{|\{%/, "")) && /^\s*[{\["]/.test(t) && !/^\s*\{\{|^\s*\{%/.test(t)) f.add("builds JSON/text")
  else if (t.replace(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}/g, "").trim()) f.add("text around")
  if (/\bvalue_json\b/.test(inner)) f.add("value_json")
  if (/\bnow\b|\bstates\b|as_timestamp|\biif\b|timestamp_custom|is_state/.test(inner)) f.add("HA-only")
  return [...f]
}
const by = {}
for (const it of items) { it.f = feat(it.tpl); (by[it.source] ??= []).push(it) }
const rw = (k) => /command|cmd|set_position|position_template$|^tilt_command/.test(k) && !/state|status|value_template$/.test(k) ? "W" : "R"
for (const [s, list] of Object.entries(by)) {
  const tally = {}
  for (const it of list) for (const f of it.f) tally[`${rw(it.key)} ${f}`] = (tally[`${rw(it.key)} ${f}`] || 0) + 1
  console.log(`\n### ${s}: ${list.length}`)
  console.log(Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(" | "))
}
fs.writeFileSync(path.join(dir, "..", "templates.json"), JSON.stringify(items, null, 1))
