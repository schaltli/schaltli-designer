import { test, expect } from "@playwright/test"
import JSZip from "jszip"

// Der Geraete-Export und Objekte in einem Container (2026-08-27).
//
// Gefunden an einer echten Seite, nicht hier: eine Luefterseite, deren
// Bedienelemente in einem tab-control liegen, kam auf dem Panel ohne ein
// einziges Icon heraus. Die Ursache lag in beiden Haelften des Exports, und
// beide Haelften lasen nur `screen.objects`:
//
//   1. lib/asset-export.ts backte die Bitmaps nur fuer die oberste Ebene -
//      was in einem Container lag, wurde nie gezeichnet.
//   2. lib/project-zip.ts schrieb die Dateipfade nur auf die oberste Ebene
//      zurueck - selbst eine gebackene Datei waere der Firmware also
//      unbekannt geblieben.
//
// Keine der beiden Haelften meldete etwas. Der Zip war gueltig, das Projekt
// lud, die Kacheln blieben leer.
//
// Warum das lange unbemerkt blieb: die vorhandene Export-Pruefung in
// e2e/switch-render.spec.ts liest `screens.flatMap((s) => s.objects)` und
// haette denselben blinden Fleck gehabt. Deshalb prueft dieser Test
// ausdruecklich ueber alle Ebenen - und nicht nur, DASS gebacken wird,
// sondern AN WELCHER STELLE: ein Icon bekommt seinen Hintergrund
// einkomponiert (exportIconUsage() schneidet den geflachten Hintergrund an
// obj.x/obj.y zu), und diese Koordinate muss die absolute sein. Ein Icon,
// das gebacken wird, aber den Hintergrund der falschen Bildschirmstelle
// mitbringt, ist genauso kaputt - nur unauffaelliger.
//
// Die Regel, an der die Rechnung haengt, steht in beiden Renderern: ein
// tab-control verschiebt seine Kinder um seinen eigenen Ursprung
// (lib/render-screen.ts per ctx.translate, ColorScreenRenderer.cpp
// gleichlautend), ein panel verschiebt nichts - dessen eigenes x/y wird nie
// angewandt. Genau das wird unten mit vier Ablagen desselben Icons
// festgenagelt.

// Ein Kreis, keine Flaeche: die Ecken der Kachel bleiben frei, dort ist der
// einkomponierte Hintergrund sichtbar und damit ueberhaupt vergleichbar.
const ICON_SVG =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="#000000"/></svg>`,
  ).toString("base64")

const ICON = 24

/** Ein Icon-Objekt; die Koordinaten sind die, die im Projekt stehen - also relativ zum Container. */
const icon = (id: string, x: number, y: number) => ({
  id,
  type: "icon",
  zIndex: 5,
  x,
  y,
  width: ICON,
  height: ICON,
  properties: { assetId: "asset-circle", iconColor: "#000000" },
})

/** panel um ein Objekt; panelX/panelY sind bewusst frei waehlbar, weil sie wirkungslos sein muessen. */
const panel = (id: string, child: any, panelX = 0, panelY = 0) => ({
  id,
  type: "panel",
  zIndex: 0,
  x: panelX,
  y: panelY,
  width: 200,
  height: 200,
  properties: { comparisonOperator: "==", comparisonValue: "A" },
  children: [child],
})

const tabControl = (id: string, x: number, y: number, children: any[]) => ({
  id,
  type: "tab-control",
  zIndex: 1,
  x,
  y,
  width: 200,
  height: 200,
  properties: { topic: "t/mode" },
  children,
})

const box = (id: string, x: number, y: number, w: number, h: number, fill: string) => ({
  id,
  type: "box",
  zIndex: 0,
  x,
  y,
  width: w,
  height: h,
  properties: { backgroundColor: fill, borderColor: fill, borderWidth: 0 },
})

// Alle vier Ablagen zielen auf dieselbe absolute Stelle (50, 80) - ausser
// der letzten, die absichtlich danebenliegt.
const ZIEL_X = 50
const ZIEL_Y = 80

function buildProject() {
  return {
    name: "nested-export",
    screenWidth: 240,
    screenHeight: 240,
    settings: { colorDepth: "24bit" },
    fonts: [],
    assets: [{ id: "asset-circle", name: "circle", type: "icon", data: ICON_SVG }],
    topics: [{ id: "t-mode", topic: "t/mode", type: "text", examples: ["A"] }],
    screens: [
      {
        id: "s1",
        name: "Screen 1",
        backgroundColor: "#ffffff",
        objects: [
          // Der Pruefstein fuer die Position: ein schwarzes Feld genau
          // ueber der Zielstelle, sonst weiss. Wer hier richtig
          // zuschneidet, bringt einen schwarzen Rand mit; wer die relative
          // Koordinate nimmt, einen weissen.
          box("marker", ZIEL_X, ZIEL_Y, ICON, ICON, "#000000"),

          // (a) tab-control (40,60) + Icon (10,20) = (50,80)
          tabControl("tabs-a", 40, 60, [panel("panel-a", icon("icon-a", ZIEL_X - 40, ZIEL_Y - 60))]),

          // (b) andere Zerlegung derselben Stelle: (30,50) + (20,30) = (50,80).
          // Muss (a) aufs Byte gleichen - sonst ist die Addition nicht das,
          // was der Renderer tut.
          tabControl("tabs-b", 30, 50, [panel("panel-b", icon("icon-b", ZIEL_X - 30, ZIEL_Y - 50))]),

          // (c) dasselbe wie (a), aber das panel traegt ein eigenes x/y.
          // Muss (a) ebenfalls gleichen: ein panel verschiebt nichts.
          tabControl("tabs-c", 40, 60, [panel("panel-c", icon("icon-c", ZIEL_X - 40, ZIEL_Y - 60), 99, 99)]),

          // (d) zwei Ebenen tief: (20,30) + (20,30) + (10,20) = (50,80).
          tabControl("tabs-d", 20, 30, [
            panel("panel-d1", tabControl("tabs-d-inner", 20, 30, [panel("panel-d2", icon("icon-d", 10, 20))])),
          ]),

          // (e) Gegenprobe: bewusst NICHT auf der Zielstelle. Ohne den
          // Versatz waere (a) genau hier gelandet, also muss (e) sich von
          // (a) unterscheiden - sonst beweist die Gleichheit oben nichts.
          tabControl("tabs-e", 40, 60, [panel("panel-e", icon("icon-e", 0, 0))]),

          // Ein Switch mit Zustandsicons im Container - die andere Haelfte
          // des Fehlers. Sein Bitmap wird ueber einen eigenen Pfad
          // ausgeliefert (states[].path), der ebenfalls nur auf der
          // obersten Ebene zurueckgeschrieben wurde.
          tabControl("tabs-sw", 8, 8, [
            panel("panel-sw", {
              id: "nested-switch",
              type: "Switch",
              zIndex: 2,
              x: 4,
              y: 150,
              width: 120,
              height: 40,
              properties: {
                topic: "t/mode",
                writeTopic: "t/mode/set",
                mode: "segmented",
                states: [
                  { id: "st-a", label: "A", readValue: "A", writeValue: "A", iconAssetId: "asset-circle" },
                  { id: "st-b", label: "B", readValue: "B", writeValue: "B", iconAssetId: "asset-circle" },
                ],
                backgroundColor: "#ffffff",
                activeBackgroundColor: "#cccccc",
                borderColor: "#000000",
                textColor: "#000000",
                iconColor: "#000000",
              },
            }),
          ]),
        ],
      },
    ],
  }
}

test.describe("Geraete-Export mit Objekten in einem Container", () => {
  test("jedes Icon in einem tab-control wird gebacken und traegt seinen Pfad", async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)

    const zipBase64: string = await page.evaluate((p) => (window as any).__buildDeviceZipForTest(p), buildProject())
    const zip = await JSZip.loadAsync(Buffer.from(zipBase64, "base64"))
    const exported = JSON.parse(await zip.file("project.json")!.async("string"))

    const alle = (list: any[]): any[] => (list || []).flatMap((o) => [o, ...alle(o.children)])
    const objekte = exported.screens.flatMap((s: any) => alle(s.objects))

    const ohnePfad = objekte.filter((o: any) => o.type === "icon" && !o.path).map((o: any) => o.id)
    expect(ohnePfad, `Icons ohne gebackenes Bitmap: ${ohnePfad.join(", ")}`).toEqual([])

    const zustaende = objekte
      .filter((o: any) => o.type === "Switch")
      .flatMap((o: any) => (o.properties.states || []).map((st: any) => ({ obj: o.id, st })))
      .filter((z: any) => z.st.iconAssetId)
    expect(zustaende.length, "der verschachtelte Switch fehlt im Export").toBe(2)
    const zustandOhnePfad = zustaende.filter((z: any) => !z.st.path).map((z: any) => `${z.obj}/${z.st.id}`)
    expect(zustandOhnePfad, `Switch-Zustaende ohne Bitmap: ${zustandOhnePfad.join(", ")}`).toEqual([])

    // Ein Pfad, der auf nichts zeigt, ist genauso wertlos wie keiner: die
    // Firmware laedt genau diese Datei und zeichnet sonst eine leere Kachel.
    for (const p of [
      ...objekte.filter((o: any) => o.type === "icon").map((o: any) => o.path),
      ...zustaende.map((z: any) => z.st.path),
    ]) {
      const eintrag = zip.file(p)
      expect(eintrag, `${p} steht im Projekt, liegt aber nicht im Zip`).toBeTruthy()
      const bytes = await eintrag!.async("nodebuffer")
      expect(bytes.length, `${p} ist leer`).toBeGreaterThan(50)
      expect(bytes.subarray(0, 2).toString("ascii"), `${p} ist keine BMP-Datei`).toBe("BM")
    }
  })

  test("ein Icon im Container bringt den Hintergrund seiner absoluten Stelle mit", async ({ page }) => {
    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)

    const zipBase64: string = await page.evaluate((p) => (window as any).__buildDeviceZipForTest(p), buildProject())
    const zip = await JSZip.loadAsync(Buffer.from(zipBase64, "base64"))
    const exported = JSON.parse(await zip.file("project.json")!.async("string"))

    const alle = (list: any[]): any[] => (list || []).flatMap((o) => [o, ...alle(o.children)])
    const objekte = exported.screens.flatMap((s: any) => alle(s.objects))
    const bytes = async (id: string) => {
      const obj = objekte.find((o: any) => o.id === id)
      expect(obj, `${id} fehlt im Export`).toBeTruthy()
      return await zip.file(obj.path)!.async("nodebuffer")
    }

    const [a, b, c, d, e] = await Promise.all([
      bytes("icon-a"),
      bytes("icon-b"),
      bytes("icon-c"),
      bytes("icon-d"),
      bytes("icon-e"),
    ])

    // Dieselbe absolute Stelle, auf vier Wegen erreicht - vier gleiche
    // Bilder. Eine andere Zerlegung (b) faellt auf, wenn der Versatz nicht
    // wirklich addiert wird; ein panel mit eigenem Ursprung (c) faellt auf,
    // wenn dessen x/y faelschlich mitgerechnet wird; zwei Ebenen (d)
    // fallen auf, wenn die Rekursion nur eine Ebene tief geht.
    expect(b.equals(a), "andere Zerlegung derselben Stelle ergibt ein anderes Bild - der Versatz wird nicht addiert").toBe(true)
    expect(c.equals(a), "das eigene x/y eines panel wurde mitgerechnet - es darf nichts verschieben").toBe(true)
    expect(d.equals(a), "zwei Ebenen tief stimmt der Versatz nicht - die Rekursion sammelt nicht auf").toBe(true)

    // Und die Gegenprobe, ohne die alles oben auch dann gruen waere, wenn
    // der Versatz durchgaengig ignoriert wuerde: (e) liegt an der Stelle,
    // an der (a) ohne Versatz landen wuerde, und ueber ihr liegt kein
    // schwarzes Feld. Die beiden Bilder muessen sich unterscheiden.
    expect(e.equals(a), "das Icon bringt an jeder Stelle denselben Hintergrund mit - der Versatz wird ignoriert").toBe(
      false,
    )
  })
})
