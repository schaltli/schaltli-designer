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
// The recolor is non-destructive - it happens on a parsed copy on the way to
// the raster, never on the project's own `adornment` string. That string is
// device data that gets stored and exported; a designer-only color has no
// business in it.

const OFFSCREEN_ID_PREFIX = "offscreen"

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

export interface AdornmentImage {
  // Null until the raster finishes, or when there's no adornment at all.
  image: HTMLImageElement | null
  // The parsed SVG, for hit-testing hardware buttons by id. Reflects the
  // original artwork, not the recolored copy.
  svgDoc: Document | null
}

export function useAdornmentImage(adornment: string | undefined, offscreenColor: string): AdornmentImage {
  const [result, setResult] = useState<AdornmentImage>({ image: null, svgDoc: null })

  useEffect(() => {
    if (!adornment) {
      setResult({ image: null, svgDoc: null })
      return
    }

    let cancelled = false
    const svgText = decodeAdornment(adornment)

    let svgDoc: Document | null = null
    let recolored = svgText
    try {
      svgDoc = new DOMParser().parseFromString(svgText, "image/svg+xml")
      const covers = svgDoc.querySelectorAll(`[id^="${OFFSCREEN_ID_PREFIX}"]`)
      if (covers.length > 0) {
        const copy = new DOMParser().parseFromString(svgText, "image/svg+xml")
        copy.querySelectorAll(`[id^="${OFFSCREEN_ID_PREFIX}"]`).forEach((el) => {
          el.setAttribute("fill", offscreenColor)
        })
        recolored = new XMLSerializer().serializeToString(copy)
      }
    } catch (error) {
      console.error("Failed to parse adornment SVG:", error)
    }

    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      if (!cancelled) setResult({ image: img, svgDoc })
    }
    img.onerror = () => {
      console.error("Failed to load adornment image")
      if (!cancelled) setResult({ image: null, svgDoc })
    }
    // unescape(encodeURIComponent(...)) rather than a bare btoa: btoa throws
    // on any character above U+00FF, and an adornment may legitimately carry
    // one (a device name in a <title>, a typographic dash in a comment).
    img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(recolored)))}`

    return () => {
      cancelled = true
    }
  }, [adornment, offscreenColor])

  return result
}
