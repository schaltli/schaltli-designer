"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  NUMBER_FORMATS,
  formatNumber,
  numberFormatOf,
  separatorProblem,
  type Separators,
} from "@/lib/placeholders"

// Settings › Number format (docs/2026-09-25-text-placeholders.md): how
// placeholders like {topic:…:N2} write a number. A preset sets both
// characters; Custom lets them be typed. The project stores only the two
// characters - the preset is a way of choosing them.

const SAMPLE = "12345.678"

interface NumberFormatFieldProps {
  value: Separators
  onChange: (separators: Separators) => void
}

export function NumberFormatField({ value, onChange }: NumberFormatFieldProps) {
  const preset = numberFormatOf(value)
  // Custom stays chosen while its fields are being typed in, even when the
  // typed pair happens to pass through a preset's.
  const [customOpen, setCustomOpen] = useState(preset === "custom")
  const [draft, setDraft] = useState<Separators>(value)
  const selected = customOpen ? "custom" : preset
  const problem = separatorProblem(draft)

  const choose = (id: string) => {
    if (id === "custom") {
      setCustomOpen(true)
      setDraft(value)
      return
    }
    const format = NUMBER_FORMATS.find((f) => f.id === id)
    if (!format) return
    setCustomOpen(false)
    setDraft(format.separators)
    onChange(format.separators)
  }

  const type = (next: Separators) => {
    setDraft(next)
    // Only a usable pair is stored; the field keeps what was typed so it can
    // be corrected, and says what is wrong with it.
    if (!separatorProblem(next)) onChange(next)
  }

  const sample = (separators: Separators) => formatNumber(SAMPLE, { kind: "N", digits: 2 }, separators)

  return (
    <div>
      <Label htmlFor="numberFormat" className="text-sm">
        Number format
      </Label>
      <Select value={selected} onValueChange={choose}>
        <SelectTrigger id="numberFormat" className="mt-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {NUMBER_FORMATS.map((format) => (
            <SelectItem key={format.id} value={format.id}>
              {format.label} ({sample(format.separators)})
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom</SelectItem>
        </SelectContent>
      </Select>

      {selected === "custom" && (
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div>
            <Label htmlFor="decimalSeparator" className="text-xs text-muted-foreground">
              Decimal separator
            </Label>
            <Input
              id="decimalSeparator"
              value={draft.decimal}
              maxLength={1}
              onChange={(e) => type({ ...draft, decimal: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="thousandsSeparator" className="text-xs text-muted-foreground">
              Thousands separator
            </Label>
            <Input
              id="thousandsSeparator"
              value={draft.thousands}
              maxLength={1}
              placeholder="none"
              onChange={(e) => type({ ...draft, thousands: e.target.value })}
            />
          </div>
        </div>
      )}

      <p className={problem && selected === "custom" ? "text-xs text-destructive mt-1" : "text-xs text-muted-foreground mt-1"}>
        {problem && selected === "custom"
          ? problem
          : `How placeholders write numbers, e.g. {topic:…:N2} → ${sample(value)}.`}
      </p>
    </div>
  )
}
