import { test, expect } from "@playwright/test"
import fs from "fs"
import path from "path"
import JSZip from "jszip"

const { withEmbeddedAssetData } = require("../hil/waveshare/project-assets")

const FIXTURE = path.join(__dirname, "..", "hil", "waveshare", "fixtures", "smoke-test.zip")

// Die Referenz-Renderung des Waveshare-Orchestrators und die Icons
// (2026-08-27).
//
// Der Orchestrator vergleicht Bild gegen Bild: das Geraet malt ein Icon aus
// dem gebackenen Bitmap, der Designer malt dasselbe Icon live aus einer
// Data-URL. Nur traegt ein Geraete-Export gar kein `assets[]` - die Firmware
// braucht es nicht. Der Referenzseite fehlte damit die Bildquelle, und sie
// malte nicht etwa ein leeres Feld, sondern warf (`project.assets.find` auf
// undefined) und riss den Lauf mit.
//
// Zeitlich genau eingrenzbar: seit dem 2026-08-25, als diese Vorlage auf den
// echten Export umgestellt wurde und screen-2 ein Icon bekam. Zwei Tage
// unbemerkt, weil die Suite sich ueberspringt, wenn kein Board antwortet -
// und keines antwortete. Ein Test, der ein Board braucht, haette es also
// auch nicht gefunden; dieser hier braucht keines.
//
// Geprueft wird die Eigenschaft, an der es haengt, nicht der Aufruf: jedes
// Asset, auf das irgendein Objekt auf irgendeiner Ebene zeigt, muss mit
// echten Bilddaten zurueckkommen.
test.describe("Referenzbilder des Waveshare-Orchestrators", () => {
  test("jedes Icon, auf das die Vorlage zeigt, kommt mit Bilddaten zurueck", async () => {
    const zip = await JSZip.loadAsync(fs.readFileSync(FIXTURE))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))

    // Die Voraussetzung, nicht bloss Kulisse: haette der Geraete-Export
    // seine Assets selbst dabei, waere die ganze Wiederbeschaffung
    // gegenstandslos - und dieser Test wuerde etwas anderes pruefen als er
    // behauptet.
    expect(
      project.assets === undefined || project.assets.length === 0,
      "der Geraete-Export traegt ploetzlich Assets - dann ist dieser Test nicht mehr der, der er sein soll",
    ).toBe(true)

    const assets = await withEmbeddedAssetData(project, zip, { warn: () => {} })
    const nachId = new Map<string, any>(assets.map((a: any) => [a.id, a]))

    const alle = (list: any[]): any[] => (list || []).flatMap((o) => [o, ...alle(o.children)])
    const gebraucht = new Set<string>()
    for (const screen of project.screens) {
      for (const obj of alle(screen.objects)) {
        if (obj.properties?.assetId) gebraucht.add(obj.properties.assetId)
        if (obj.properties?.iconAssetId) gebraucht.add(obj.properties.iconAssetId)
        for (const st of obj.properties?.states || []) {
          if (st.iconAssetId) gebraucht.add(st.iconAssetId)
          if (st.activeIconAssetId) gebraucht.add(st.activeIconAssetId)
        }
        for (const paar of obj.properties?.valueIconPairs || []) {
          if (paar?.thenShowIcon) gebraucht.add(paar.thenShowIcon)
        }
      }
    }

    expect(gebraucht.size, "die Vorlage zeigt auf gar kein Icon mehr - dann deckt dieser Test nichts ab").toBeGreaterThan(0)

    const fehlend = [...gebraucht].filter((id) => {
      const a = nachId.get(id)
      return !a || typeof a.data !== "string" || !a.data.startsWith("data:")
    })
    expect(fehlend, `ohne Bilddaten: ${fehlend.join(", ")}`).toEqual([])
  })

  test("das Referenzbild zeigt die Icons wirklich, nicht nur irgendein Bild", async ({ page }) => {
    const zip = await JSZip.loadAsync(fs.readFileSync(FIXTURE))
    const project = JSON.parse(await zip.file("project.json")!.async("string"))
    project.assets = await withEmbeddedAssetData(project, zip, { warn: () => {} })

    await page.goto("/test-render")
    await page.waitForFunction(() => (window as any).__testRenderReady === true)

    // Ohne Schriftbytes: das weicht vom echten Lauf ab (der zieht sie aus
    // dem DDF des Firmware-Repos, das hier nicht ausgecheckt sein muss).
    // Fuer die Frage dieses Tests spielt die Schrift keine Rolle; die
    // Glyphen selbst haengen an e2e/ddf-name und am HIL-Pixelvergleich.
    const rendern = (p: any, i: number) =>
      page.evaluate((req) => (window as any).__renderScreenForTest(req), {
        quantize: "rgb565",
        project: p,
        screenIndex: i,
        topicOverrides: {},
      }) as Promise<string>

    // Jeder Screen muss ueberhaupt durchlaufen. Das ist die schwache
    // Haelfte - sie faengt den historischen Absturz (`undefined.find`), aber
    // ein leeres Assets-Array liefe hier auch sauber durch und malte
    // schlicht nichts.
    const gestorben: string[] = []
    for (let i = 0; i < project.screens.length; i++) {
      try {
        const dataUrl = await rendern(project, i)
        expect(dataUrl.startsWith("data:image/png;base64,"), `${project.screens[i].id} lieferte kein PNG`).toBe(true)
      } catch (e: any) {
        gestorben.push(`${project.screens[i].id}: ${String(e.message).split("\n")[0]}`)
      }
    }
    expect(gestorben, `Referenz-Renderung gescheitert auf ${gestorben.join(" | ")}`).toEqual([])

    // Und die starke Haelfte, auf die es beim Pixelvergleich ankommt: das
    // Icon muss im Bild stehen. Ein Referenzbild ohne Icon ist nicht
    // "fast richtig", es ist der garantierte Fehlschlag - das Geraet malt
    // sein gebackenes Bitmap, die Referenz eine leere Flaeche, und der
    // Vergleich meldet einen Firmwarefehler, den es nicht gibt.
    //
    // Geprueft ueber den Unterschied zu demselben Screen ohne Bilddaten:
    // damit haengt der Test an der Wirkung, nicht an einem Pixelwert, den
    // eine Layoutaenderung verschieben wuerde.
    const ohne = { ...project, assets: [] }
    const mitIcons = project.screens
      .map((s: any, i: number) => ({ s, i }))
      .filter(({ s }: any) => JSON.stringify(s).includes("asset-"))
    expect(mitIcons.length, "keine Vorlagenseite zeigt mehr ein Icon - dann deckt dieser Test nichts ab").toBeGreaterThan(0)

    for (const { s, i } of mitIcons) {
      const [a, b] = await Promise.all([rendern(project, i), rendern(ohne, i)])
      expect(a === b, `${s.id} sieht mit und ohne Icondaten gleich aus - das Icon fehlt im Referenzbild`).toBe(false)
    }
  })
})
