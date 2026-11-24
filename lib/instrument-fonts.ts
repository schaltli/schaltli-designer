/**
 * The typefaces styled faces are drawn in (docs/2026-11-23-instrument-
 * styles.md, «Fonts»): shipped with the designer under
 * public/fonts/instrument/ (OFL, licences beside them), registered with the
 * browser under names of their own so a system font of the same family can
 * never stand in, and only ever used to bake faces - no device receives them.
 */

export interface InstrumentFont {
  /** The name a face's ctx.font asks for. */
  family: string
  weight: number
  style?: "normal" | "italic"
  url: string
}

export const INSTRUMENT_FONTS: InstrumentFont[] = [
  { family: "Schaltli Oswald", weight: 500, url: "/fonts/instrument/oswald-latin-500-normal.woff2" },
  { family: "Schaltli Oswald", weight: 700, url: "/fonts/instrument/oswald-latin-700-normal.woff2" },
  { family: "Schaltli Saira", weight: 300, url: "/fonts/instrument/saira-latin-300-normal.woff2" },
  { family: "Schaltli Saira", weight: 400, url: "/fonts/instrument/saira-latin-400-normal.woff2" },
  { family: "Schaltli Share Tech Mono", weight: 400, url: "/fonts/instrument/share-tech-mono-latin-400-normal.woff2" },
  { family: "Schaltli IM Fell English", weight: 400, url: "/fonts/instrument/im-fell-english-latin-400-normal.woff2" },
  { family: "Schaltli IM Fell English", weight: 400, style: "italic", url: "/fonts/instrument/im-fell-english-latin-400-italic.woff2" },
  { family: "Schaltli Playfair Display", weight: 400, url: "/fonts/instrument/playfair-display-latin-400-normal.woff2" },
  { family: "Schaltli Playfair Display", weight: 400, style: "italic", url: "/fonts/instrument/playfair-display-latin-400-italic.woff2" },
  { family: "Schaltli Playfair Display", weight: 600, style: "italic", url: "/fonts/instrument/playfair-display-latin-600-italic.woff2" },
]

let state: "idle" | "loading" | "ready" | "failed" = "idle"
const waiting: (() => void)[] = []

/**
 * True once every style typeface can be drawn with. The first call starts
 * loading them and returns false; `onReady` is called once they are there
 * (a face baked before would be baked in a fallback font and cached so).
 */
export function instrumentFontsReady(onReady?: () => void): boolean {
  if (state === "ready" || state === "failed") return true
  if (typeof document === "undefined" || typeof FontFace === "undefined") return false
  if (onReady) waiting.push(onReady)
  if (state === "idle") {
    state = "loading"
    Promise.all(
      INSTRUMENT_FONTS.map((f) =>
        new FontFace(f.family, `url(${f.url})`, { weight: String(f.weight), style: f.style ?? "normal" }).load().then((face) => {
          document.fonts.add(face)
        }),
      ),
    )
      .then(() => {
        state = "ready"
      })
      .catch((err) => {
        // Faces are then baked in the fallback, visibly; better than none.
        console.warn("[instrument] style fonts failed to load", err)
        state = "failed"
      })
      .finally(() => {
        for (const cb of waiting.splice(0)) requestAnimationFrame(cb)
      })
  }
  return false
}

/** Resolves when the style typefaces are loaded (or have failed): for export, which must not bake in a fallback. */
export function whenInstrumentFontsReady(): Promise<void> {
  return new Promise((resolve) => {
    if (instrumentFontsReady(resolve)) resolve()
  })
}
