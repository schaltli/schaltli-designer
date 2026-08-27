import { test, expect } from "@playwright/test"
import { resolveArcSweep } from "../components/canvas/renderers/render-arc-level"
import { ARC_ANGLE_SCALE } from "../lib/arc-raster"

// Was "Counter-clockwise" am arc-level wirklich umdreht (2026-08-27).
//
// Naheliegend, und falsch: dass es nur die Fuellrichtung spiegelt und
// derselbe Bogen stehen bleibt. resolveArcSweep() dreht aber auch die
// Bedeutung der beiden Winkel um - bei "ccw" ist `maxAngle` der Anfang und
// die Spanne laeuft `minAngle - maxAngle`. Dieselben Zahlen ergeben deshalb
// in den beiden Richtungen *verschieden grosse* Boegen: 225/135 sind im
// Uhrzeigersinn 270 Grad und gegen ihn 90.
//
// Aufgefallen beim Bau der Wasserseite fuers Fahrzeug, die zwei
// konzentrische Ringe mit gegenlaeufiger Fuellung zeigt. Der innere lief im
// ersten Wurf nur unten herum statt ueber die volle Spanne - sichtbar erst
// im Bild, denn keine Zahl und keine Eigenschaft verraet es vorher. Wer
// denselben Bogen bei umgekehrter Fuellung will, muss die Winkel tauschen.
//
// Hier festgenagelt statt im Bild geprueft, weil ein Pixelvergleich diese
// Verwechslung zwar zeigt, aber nicht erklaert - und weil die Firmware
// dieselbe Rechnung hat.
const bogen = (minAngle: number, maxAngle: number, direction: "cw" | "ccw") =>
  ({
    id: "a",
    type: "arc-level",
    x: 0,
    y: 0,
    width: 200,
    height: 200,
    zIndex: 0,
    properties: { minAngle, maxAngle, direction },
  }) as any

const grad = (a64: number) => a64 / ARC_ANGLE_SCALE

test.describe("arc-level: was die Richtung umdreht", () => {
  test("im Uhrzeigersinn faengt der Bogen bei minAngle an", () => {
    const s = resolveArcSweep(bogen(225, 135, "cw"))
    expect(grad(s.start64)).toBe(225)
    expect(grad(s.sweep64)).toBe(270)
    expect(s.fillFromEnd).toBe(false)
  })

  test("dieselben Winkel gegen den Uhrzeigersinn ergeben einen ANDEREN Bogen, nicht nur eine andere Fuellrichtung", () => {
    const s = resolveArcSweep(bogen(225, 135, "ccw"))
    expect(grad(s.start64)).toBe(135)
    // 90 statt 270: das ist die Falle. Wer hier 270 erwartet, baut einen
    // Ring, der nur ein Viertel des Wegs geht.
    expect(grad(s.sweep64)).toBe(90)
  })

  test("getauschte Winkel gegen den Uhrzeigersinn decken denselben Bogen ab wie im Uhrzeigersinn", () => {
    const imUhrzeiger = resolveArcSweep(bogen(225, 135, "cw"))
    const dagegen = resolveArcSweep(bogen(135, 225, "ccw"))

    // Gleicher Anfang, gleiche Spanne - also exakt dieselbe Flaeche auf dem
    // Glas. Das ist das Paar, das ein Doppelring braucht.
    expect(dagegen.start64).toBe(imUhrzeiger.start64)
    expect(dagegen.sweep64).toBe(imUhrzeiger.sweep64)
    // Und nur DAS unterscheidet sie: von welchem Ende gefuellt wird.
    expect(dagegen.fillFromEnd).toBe(true)
    expect(imUhrzeiger.fillFromEnd).toBe(false)
  })

  test("ein Vollkreis bleibt ein Vollkreis, in beide Richtungen", () => {
    // Gleiche Winkel heissen "rundherum" (das Preset "Voll" schreibt 0/0),
    // nicht "Spanne null" - sonst verschwaende ein Ring beim Umschalten der
    // Richtung.
    for (const d of ["cw", "ccw"] as const) {
      const s = resolveArcSweep(bogen(0, 0, d))
      expect(grad(s.sweep64), `${d} bei 0/0`).toBe(360)
    }
  })
})
