// A chart series' name from discovery (docs/2026-11-11-chart-tweaks.md,
// decision 2): where Home Assistant or a bridge announces the topic a series
// reads, its name there - the entry's, and the part's after it - rather than
// the topic's last segment.

import type { CatalogEntry } from "@/lib/ha-discovery"

/** Every topic (and `topic#path`) the catalog's entries read, with the name they announce it under. */
export function namesByTopic(entries: readonly CatalogEntry[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const entry of entries) {
    for (const control of entry.controls) {
      const read = "read" in control ? control.read : undefined
      if (!read || read in out) continue
      out[read] = control.part ? `${entry.label} ${control.part}` : entry.label
    }
  }
  return out
}
