import { test, expect } from "@playwright/test"
import vectors from "../lib/ha-template/vectors.json"
import { fromJson, namesUsed, parseTemplate, payloadVariables, readSource, renderTemplate, TemplateError, type Value } from "../lib/ha-template"

// Home Assistant's templates as the designer evaluates them
// (docs/2026-10-26-ha-templates.md). The expected results are Jinja's own,
// rendered by scripts/ha-template-vectors.py with Home Assistant's filters -
// not taken from lib/ha-template.ts. Pure: no browser.

interface Case {
  template: string
  payload?: string
  variables?: Record<string, unknown>
  unsupported?: boolean
  result?: string
  error?: string
}

function render(c: Case): { result: string } | { error: true } {
  const parsed = parseTemplate(c.template)
  if ("unsupported" in parsed) throw new Error(`${c.template}: ${parsed.unsupported}`)
  const variables: Record<string, Value> =
    c.payload !== undefined ? payloadVariables(c.payload) : Object.fromEntries(Object.entries(c.variables ?? {}).map(([k, v]) => [k, fromJson(v)]))
  try {
    return { result: renderTemplate(parsed, variables) }
  } catch (e) {
    if (e instanceof TemplateError) return { error: true }
    throw e
  }
}

test.describe("Home Assistant templates, as Jinja renders them", () => {
  for (const c of (vectors as { cases: Case[] }).cases) {
    test(c.template, () => {
      if (c.unsupported) {
        expect(parseTemplate(c.template)).toHaveProperty("unsupported")
        return
      }
      expect(render(c)).toEqual(c.error !== undefined ? { error: true } : { result: c.result })
    })
  }
})

test.describe("what a template needs", () => {
  test("why one cannot be followed names what is missing", () => {
    expect(parseTemplate("{{ states('sensor.x') }}")).toEqual({ unsupported: "states()" })
    expect(parseTemplate("{{ this.state }}")).toEqual({ unsupported: "`this`" })
    expect(parseTemplate("{{ value | regex_replace('a', 'b') }}")).toEqual({ unsupported: "the filter regex_replace" })
    expect(parseTemplate("{% for x in y %}{% endfor %}")).toEqual({ unsupported: "a {% for %} block" })
    expect(parseTemplate("{% if value %}a")).toEqual({ unsupported: "an {% if %} without {% endif %}" })
    expect(parseTemplate("{{ value.split(',') }}")).toEqual({ unsupported: "the method split()" })
  })

  test("the names it reads and does not set itself", () => {
    const t = parseTemplate('{% set on = value == "ON" %}{ "action": "{{ value }}", "code": "{{ code }}", "on": {{ on }} }')
    if ("unsupported" in t) throw new Error(t.unsupported)
    expect([...namesUsed(t)].sort()).toEqual(["code", "value"])
  })

  test("where it reads the payload, and what it compares that with", () => {
    const source = (template: string) => {
      const t = parseTemplate(template)
      if ("unsupported" in t) throw new Error(t.unsupported)
      return readSource(t)
    }
    expect(source("{% if value_json.output %}ON{% else %}OFF{% endif %}")).toEqual({ path: ["output"], constants: [] })
    expect(source('{{ "OFF" if value_json["value"] == 0 else "ON" }}')).toEqual({ path: ["value"], constants: [{ num: 0, int: true }] })
    expect(source("{{ 'on' if value in ['1', 'yes'] else 'off' }}")).toEqual({ path: "value", constants: ["1", "yes"] })
    expect(source("{{ 'on' if value_json.get('unlocked') else 'off' }}")).toEqual({ path: ["unlocked"], constants: [] })
    expect(source("{{ value_json.a.b[0] }}")).toEqual({ path: ["a", "b", 0], constants: [] })
    // Two fields, or a field it computes the name of: no one source.
    expect(source("{{ value_json.a if value_json.b else 'x' }}")).toBeUndefined()
    expect(source("{{ value_json[value_json.k] }}")).toBeUndefined()
  })
})
