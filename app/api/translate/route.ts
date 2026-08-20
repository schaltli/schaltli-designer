import { NextResponse } from "next/server"

/**
 * GET /api/translate?q=<text>&target=en - server-side proxy for the New
 * Screen dialog's icon auto-suggest flow (screens-panel.tsx, 2026-08-17):
 * translating a screen's name to English before searching Iconify (whose
 * index is effectively English-only) needs a translation service reachable
 * from here, since Google's endpoint isn't meant to be called directly from
 * a browser. Uses Google Translate's unofficial single-endpoint (no API
 * key; the documented free alternatives - e.g. MyMemory - need an explicit
 * source language too, so this isn't giving anything up by not using
 * `sl=auto`).
 *
 * Source language is hardcoded to `de` rather than `sl=auto` (changed
 * 2026-08-18, live user report): auto-detect is unreliable on the short,
 * context-free single words this feature actually sends it - confirmed live
 * with two real screen names:
 *   - "Schoss" - auto-detect: "lb" (Luxembourgish, confidence 0.51) ->
 *     "Shot" (wrong meaning entirely). Forced `sl=de` -> "Lap" (correct).
 *   - "Schloss" - auto-detect: "en" -> left untranslated, 0 Iconify results.
 *     Forced `sl=de` -> "Lock" (correct, Iconify finds real matches).
 * This app's own users are German-speaking (see project memory), so forcing
 * `sl=de` is the right default; an English screen name still round-trips
 * correctly in practice (spot-checked live: "Home" -sl=de-> "Home"
 * unchanged) since Google Translate recognizes untranslatable/identical
 * terms regardless of the declared source. Best-effort either way: any
 * failure returns the original text unchanged rather than blocking screen
 * creation on a third-party service being reachable.
 */
export const dynamic = "force-dynamic"

const FETCH_TIMEOUT_MS = 5000
const SOURCE_LANGUAGE = "de"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q")?.trim()
  const target = searchParams.get("target") || "en"

  if (!q) {
    return NextResponse.json({ error: "Missing q" }, { status: 400 })
  }

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${SOURCE_LANGUAGE}&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(q)}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    let response: Response
    try {
      response = await fetch(url, { signal: controller.signal })
    } finally {
      clearTimeout(timeout)
    }
    if (!response.ok) {
      return NextResponse.json({ translated: q, detectedSource: null })
    }

    // Response shape: [[["translated chunk","original chunk",null,null,1], ...], null, "detectedSourceLang", ...]
    // - chunked per sentence/segment, so multiple entries need joining.
    const data = await response.json()
    const translated = Array.isArray(data?.[0])
      ? data[0].map((segment: unknown) => (Array.isArray(segment) ? segment[0] ?? "" : "")).join("")
      : q
    const detectedSource = typeof data?.[2] === "string" ? data[2] : null

    return NextResponse.json({ translated: translated || q, detectedSource })
  } catch {
    return NextResponse.json({ translated: q, detectedSource: null })
  }
}
