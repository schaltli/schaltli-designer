"use client"

/**
 * What a slider or a dial publishes (tasks/ha-templates-stage2-plan.md,
 * decision 3; device contract 2.11): a text with `{value}` where the number
 * goes, the number scaled first where a factor is set. Empty: the number
 * alone, as before. The device fills it in; the designer's preview does too.
 */

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatWrite, type WriteFormat } from "@/lib/scaled-value"

const SCALE_FIELDS = [
  { key: "numerator", label: "×", aria: "Send times" },
  { key: "denominator", label: "÷", aria: "Send divided by" },
  { key: "offset", label: "+", aria: "Send plus" },
  { key: "decimals", label: "Decimals", aria: "Send decimals" },
] as const

type Key = (typeof SCALE_FIELDS)[number]["key"]

export function WriteFormatField({ value, example, onChange }: { value: WriteFormat | undefined; example: string; onChange: (format: WriteFormat | undefined) => void }) {
  const set = (patch: Partial<Record<Key | "text", string>>) => {
    const next: Record<string, unknown> = { ...(value ?? { text: "" }) }
    for (const [key, raw] of Object.entries(patch)) {
      if (key === "text" || key === "offset") next[key] = raw
      else next[key] = raw === "" || raw === undefined ? undefined : Number(raw)
      if (next[key] === "" || next[key] === undefined) delete next[key]
    }
    const scaled = ["numerator", "denominator", "offset", "decimals"].some((k) => next[k] !== undefined)
    if (!next.text && !scaled) return onChange(undefined)
    onChange({ ...next, text: (next.text as string) || "{value}" } as WriteFormat)
  }
  const missing = value && !value.text.includes("{value}")
  const sent = value ? formatWrite(example, value) : example
  return (
    <div className="space-y-2" data-testid="write-format">
      <Label htmlFor="write-format-text">Send as</Label>
      <Input
        id="write-format-text"
        aria-label="Send as"
        className="font-mono text-xs"
        placeholder="{value}"
        value={value?.text ?? ""}
        onChange={(e) => set({ text: e.target.value })}
      />
      <div className="flex items-center gap-1 text-xs">
        {SCALE_FIELDS.map((field) => (
          <label key={field.key} className="flex items-center gap-1">
            <span className="text-muted-foreground">{field.label}</span>
            <Input
              aria-label={field.aria}
              className="h-7 w-14 px-1 text-xs"
              inputMode="decimal"
              value={value?.[field.key] !== undefined ? String(value[field.key]) : ""}
              onChange={(e) => set({ [field.key]: e.target.value.trim() })}
            />
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground" data-testid="write-format-preview">
        {missing ? "Write {value} where the number goes." : sent === undefined ? `${example} cannot be scaled so: nothing is sent.` : `${example} is sent as ${sent}`}
      </p>
    </div>
  )
}
