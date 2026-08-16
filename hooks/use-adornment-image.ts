"use client"

import { useEffect, useState } from "react"

// Rasterizes a device's adornment SVG once for everyone who draws it (the
// interactive canvas and every screen thumbnail), and paints its off-screen
// covers in the designer's own backdrop color on the way.
//
// Off-screen covers are the parts of the cartesian framebuffer a device's
// physical panel never shows - the corners of a 240x240 buffer behind round
// glass, say. An adornment SVG marks them with id="offscreen-..." and leaves
// them fill="none" (see the M5 Dial's adornment.svg): the file can't know
// what color to use, because the right color is whatever the designer draws
// behind the device, so it's filled in here instead. Same id-prefix
// convention the hardware-button hit-zones already use.
//
// The screen cutout marker (id="screen" - lib/device-description.ts's
// extractScreenRect) is forced invisible (fill/stroke "none") here too,
// regardless of what the DDF itself gave it. DEVICE_GUIDE.md's own authoring
// convention already says it should carry no fill or stroke ("a
// measurement-only marker"), but a device author can still give it a real
// color (e.g. a neutral gray, representing the device's screen when off) so
// the Startup Gate's device picker - which renders the raw adornment SVG
// directly, never through this hook, see startup-device-gate.tsx's
// AdornmentThumbnail - shows something more device-like than a transparent
// hole while nothing's selected yet. Everywhere this hook IS used (the live
// canvas, thumbnails), that fill would otherwise sit on top of and hide the
// screen's own real background/objects, so it's stripped here on the way to
// the raster - 2026-08-16.
//
// The recolor is non-destructive - it happens on a parsed copy on the way to
// the raster, never on the project's own `adornment` string. That string is
// device data that gets stored and exported; a designer-only color has no
// business in it.

const OFFSCREEN_ID_PREFIX = "offscreen"
const SCREEN_ID = "screen"

// The same token the canvas container paints itself with (app/globals.css),
// read live rather than hardcoded so the two can never drift - including if
// it ever stops being identical in light and dark, which today it is.
export function readOffscreenColor(): string {
  if (typeof window === "undefined") return "rgb(192, 192, 192)"
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--canvas-container-bg").trim()
  return raw ? `rgb(${raw})` : "rgb(192, 192, 192)"
}

// Accepts either a raw SVG string or an already-encoded data URL, since a
// project's stored adornment has been seen as both.
function decodeAdornment(adornment: string): string {
  if (adornment.startsWith("data:image/svg+xml;base64,")) {
    return atob(adornment.replace("data:image/svg+xml;base64,", ""))
  }
  if (adornment.startsWith("data:image/svg+xml,")) {
    return decodeURIComponent(adornment.replace("data:image/svg+xml,", ""))
  }
  return adornment
}

// Every SVG tag that can actually paint something - used to build the
// offscreen-only mask below (buildOffscreenMaskSvg): anything NOT an
// offscreen cover gets hidden by stripping exactly these tags, since a
// group/svg/defs element has no fill/stroke of its own to hide in the first
// place.
const SHAPE_TAGS = ["rect", "path", "circle", "ellipse", "polygon", "polyline", "line", "text"]

// data: URI helper shared by both rasterization passes below.
// unescape(encodeURIComponent(...)) rather than a bare btoa: btoa throws on
// any character above U+00FF, and an adornment may legitimately carry one (a
// device name in a <title>, a typographic dash in a comment).
function svgToDataUri(svgText: string): string {
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgText)))}`
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => {
      console.error("Failed to load adornment image")
      resolve(null)
    }
    img.src = src
  })
}

// A second artwork, built from the same source, with every shape hidden
// except the offscreen-* covers (recolored, same as the main raster) - null
// when the artwork has none. Lets a consumer that doesn't want the full
// bezel/button artwork (screen-thumbnail.tsx, 2026-08-16 - too small at
// thumbnail scale to read anyway) still mask a round device's dead corners
// the same way the main canvas does, without drawing anything else on top
// of the screen's real content.
function buildOffscreenMaskSvg(svgText: string, offscreenColor: string): string | null {
  let copy: Document
  try {
    copy = new DOMParser().parseFromString(svgText, "image/svg+xml")
  } catch {
    return null
  }
  const covers = copy.querySelectorAll(`[id^="${OFFSCREEN_ID_PREFIX}"]`)
  if (covers.length === 0) return null

  for (const tag of SHAPE_TAGS) {
    copy.querySelectorAll(tag).forEach((el) => {
      const isCover = (el.getAttribute("id") || "").startsWith(OFFSCREEN_ID_PREFIX)
      // Drop any inline style first, same reasoning as the screen-cutout
      // marker below - it would otherwise outrank the fill/stroke
      // attributes being set here.
      el.removeAttribute("style")
      el.setAttribute("fill", isCover ? offscreenColor : "none")
      el.setAttribute("stroke", "none")
    })
  }
  return new XMLSerializer().serializeToString(copy)
}

export interface AdornmentImage {
  // Null until the raster finishes, or when there's no adornment at all.
  image: HTMLImageElement | null
  // The parsed SVG, for hit-testing hardware buttons by id. Reflects the
  // original artwork, not the recolored copy.
  svgDoc: Document | null
  // See buildOffscreenMaskSvg's own comment. Null when the artwork has no
  // offscreen-* covers at all (a rectangular device, say) - nothing to mask.
  offscreenMaskImage: HTMLImageElement | null
}

export function useAdornmentImage(adornment: string | undefined, offscreenColor: string): AdornmentImage {
  const [result, setResult] = useState<AdornmentImage>({ image: null, svgDoc: null, offscreenMaskImage: null })

  useEffect(() => {
    if (!adornment) {
      setResult({ image: null, svgDoc: null, offscreenMaskImage: null })
      return
    }

    let cancelled = false
    const svgText = decodeAdornment(adornment)

    let svgDoc: Document | null = null
    let recolored = svgText
    try {
      svgDoc = new DOMParser().parseFromString(svgText, "image/svg+xml")
      const covers = svgDoc.querySelectorAll(`[id^="${OFFSCREEN_ID_PREFIX}"]`)
      const screenEl = svgDoc.getElementById(SCREEN_ID)
      if (covers.length > 0 || screenEl) {
        const copy = new DOMParser().parseFromString(svgText, "image/svg+xml")
        copy.querySelectorAll(`[id^="${OFFSCREEN_ID_PREFIX}"]`).forEach((el) => {
          el.setAttribute("fill", offscreenColor)
        })
        const screenCopy = copy.getElementById(SCREEN_ID)
        if (screenCopy) {
          // Inkscape authors a shape's color as a style="fill:#606060;..."
          // attribute by default, not a plain fill="..." one - an inline
          // style always outranks a presentation attribute, so setting
          // fill="none"/stroke="none" alone would silently do nothing
          // against that (found live on the M5 Dial's own adornment.svg,
          // 2026-08-16). Drop the whole style attribute rather than only
          // its fill/stroke - this element is documented as measurement-
          // only (DEVICE_GUIDE.md), nothing else in its style is meant to
          // matter once it's invisible.
          screenCopy.removeAttribute("style")
          screenCopy.setAttribute("fill", "none")
          screenCopy.setAttribute("stroke", "none")
        }
        recolored = new XMLSerializer().serializeToString(copy)
      }
    } catch (error) {
      console.error("Failed to parse adornment SVG:", error)
    }

    const maskSvg = buildOffscreenMaskSvg(svgText, offscreenColor)

    Promise.all([loadImage(svgToDataUri(recolored)), maskSvg ? loadImage(svgToDataUri(maskSvg)) : Promise.resolve(null)]).then(
      ([image, offscreenMaskImage]) => {
        if (!cancelled) setResult({ image, svgDoc, offscreenMaskImage })
      },
    )

    return () => {
      cancelled = true
    }
  }, [adornment, offscreenColor])

  return result
}
