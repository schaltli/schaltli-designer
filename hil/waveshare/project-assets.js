// Icon-Bilddaten fuer die Referenz-Renderung, zurueckgeholt aus dem
// eingebetteten editierbaren Projekt.
//
// Ein Geraete-Export traegt bewusst gar kein `assets[]`: die Firmware malt
// ein Icon aus dem gebackenen Bitmap an `obj.path` und braucht das Original
// nie. Der Renderer des Designers malt es dagegen live aus einer Data-URL -
// der Referenz-Renderung im Orchestrator fehlt damit alles, womit sie
// zeichnen koennte. Und sie malt dann nicht etwa nichts, sondern stirbt:
// `project.assets.find` auf undefined, und der ganze Lauf mit ihr.
//
// Das war real. Seit dem 2026-08-25, als diese Vorlage auf den echten
// Export umgestellt wurde und screen-2 sein Icon bekam, konnte der
// Waveshare-Orchestrator fuer keinen Screen mit Icon mehr eine Referenz
// erzeugen. Gefunden erst am 2026-08-27 beim Bau des tab-control-Screens -
// und zwar ohne erreichbares Board, was genau erklaert, warum es so lange
// unbemerkt blieb: die Suite ueberspringt sich selbst, wenn kein Geraet
// antwortet.
//
// Das editierbare Projekt liegt als _source/project.zip im Export (siehe
// docs/nested-provenance.md) und listet jedes Asset mit einem `path` in
// seinen eigenen assets/-Ordner. Das Wiedereinsetzen von dort ist derselbe
// Griff, den ddf-fonts.js fuer Schriften macht: die Bytes, die der Export
// nicht doppelt mitschleppen wollte, der Seite geben, die sie braucht -
// damit beide Seiten weiterhin dasselbe Bild aus derselben Quelle
// vergleichen.

const JSZip = require("jszip")

const ASSET_MIME = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  tiff: "image/tiff",
}

// `project` ist das project.json des Geraete-Exports, `zip` das geladene
// Export-Zip. Gibt das Array zurueck, das als project.assets taugt.
// Bringt das Projekt seine Assets schon selbst mit (handgebaute Vorlagen
// tun das), bleibt es unangetastet.
async function withEmbeddedAssetData(project, zip, log = console) {
  if (Array.isArray(project.assets) && project.assets.length > 0) return project.assets

  const sourceEntry = zip.file("_source/project.zip")
  if (!sourceEntry) {
    // Fuer sich genommen kein Fehler - eine Vorlage ohne Icons rendert auch
    // ohne Assets - aber es gehoert gesagt, sonst kommt der Absturz erst
    // mehrere Schritte spaeter und sieht nach etwas anderem aus.
    log.warn("  kein _source/project.zip im Export - Icons fehlen in der Referenz")
    return []
  }

  const source = await JSZip.loadAsync(await sourceEntry.async("nodebuffer"))
  const sourceProjectFile = source.file("project.json")
  if (!sourceProjectFile) {
    log.warn("  _source/project.zip enthaelt kein project.json - Icons fehlen in der Referenz")
    return []
  }

  const sourceProject = JSON.parse(await sourceProjectFile.async("string"))
  const assets = []
  for (const asset of sourceProject.assets || []) {
    const file = asset.path ? source.file(asset.path) : null
    if (!file) {
      log.warn(`  Asset ${asset.id} hat keine Datei unter ${asset.path} in _source/project.zip`)
      continue
    }
    const ext = String(asset.path).split(".").pop().toLowerCase()
    const mime = ASSET_MIME[ext] || "application/octet-stream"
    const b64 = await file.async("base64")
    assets.push({ ...asset, data: `data:${mime};base64,${b64}` })
  }
  return assets
}

module.exports = { withEmbeddedAssetData, ASSET_MIME }
