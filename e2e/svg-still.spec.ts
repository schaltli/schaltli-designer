import { test, expect } from "@playwright/test"
import { stillSvg, stillIconData } from "../lib/svg-still"
import { migrateProject } from "../lib/object-types"

// Icons that draw themselves (SMIL: <animate>, <set>) - Iconify's line-md set
// does - start invisible: a stroke dashed away, a part at opacity 0. Drawn as
// a still picture, as the canvas and every device draw an icon, that start
// is all there is (the user, 2026-10-12: the engine icon of an energy
// diagram's node showed nothing). Still, they are their end state.

const ENGINE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><g stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path fill="currentColor" fill-opacity="0" stroke-dasharray="42" d="M11 9h6v10h-6.5l-2 -2h-2.5v-6.5l1.5 -1.5Z"><animate fill="freeze" attributeName="stroke-dashoffset" dur="0.5s" values="42;0"/><animate fill="freeze" attributeName="fill-opacity" begin="1.3s" dur="0.4s" to="1"/></path><g fill="none"><path d="M17 13h4v-3h1v8h-1v-3h-4Z" opacity="0"><set fill="freeze" attributeName="opacity" begin="0.6s" to="1"/><animate fill="freeze" attributeName="d" begin="0.6s" dur="0.2s" values="M17 13h0v-3h0v8h0v-3h0Z;M17 13h4v-3h1v8h-1v-3h-4Z"/></path></g></g></svg>'

test("an animated icon becomes its end state: every animation's last value on its element, no animation left", () => {
  const still = stillSvg(ENGINE)
  expect(still).not.toMatch(/<(animate|set)\b/)
  expect(still).toContain('<path fill="currentColor" fill-opacity="1" stroke-dasharray="42" d="M11 9h6v10h-6.5l-2 -2h-2.5v-6.5l1.5 -1.5Z" stroke-dashoffset="0">')
  expect(still).toContain('<path d="M17 13h4v-3h1v8h-1v-3h-4Z" opacity="1">')
  expect(still).toMatch(/<\/path><\/g><\/g><\/svg>$/)
})

test("an animation that does not freeze leaves its element as it was; one with a closing tag goes too", () => {
  expect(stillSvg('<svg><circle r="2" opacity="0"><animate attributeName="opacity" to="1" dur="1s"/></circle></svg>')).toBe(
    '<svg><circle r="2" opacity="0"></circle></svg>',
  )
  expect(stillSvg('<svg><rect width="1"><animate attributeName="width" values="1;5" fill="freeze"></animate></rect></svg>')).toBe(
    '<svg><rect width="5"></rect></svg>',
  )
  expect(stillSvg('<svg><g><animateTransform attributeName="transform" type="rotate" to="90" fill="freeze"/></g></svg>')).toBe(
    '<svg><g transform="rotate(90)"></g></svg>',
  )
})

test("an icon without animation is returned untouched, to the byte; data URLs in both encodings", () => {
  const plain = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 1h2"/></svg>'
  expect(stillSvg(plain)).toBe(plain)
  const b64 = `data:image/svg+xml;base64,${Buffer.from(plain).toString("base64")}`
  expect(stillIconData(b64)).toBe(b64)
  const animated = `data:image/svg+xml;base64,${Buffer.from(ENGINE).toString("base64")}`
  const out = stillIconData(animated)
  expect(out.startsWith("data:image/svg+xml;base64,")).toBe(true)
  expect(Buffer.from(out.split(",")[1], "base64").toString()).toBe(stillSvg(ENGINE))
  const uri = `data:image/svg+xml,${encodeURIComponent(ENGINE)}`
  expect(decodeURIComponent(stillIconData(uri).split(",")[1])).toBe(stillSvg(ENGINE))
  // Not an SVG at all: left be.
  expect(stillIconData("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA")
})

test("a project saved with an animated icon has it still once opened", () => {
  const data = `data:image/svg+xml;base64,${Buffer.from(ENGINE).toString("base64")}`
  const project = migrateProject({ settings: {}, screens: [], assets: [{ id: "icon-7", type: "icon", name: "line-md:engine-filled", data }] } as any) as any
  expect(Buffer.from(project.assets[0].data.split(",")[1], "base64").toString()).toBe(stillSvg(ENGINE))
})
