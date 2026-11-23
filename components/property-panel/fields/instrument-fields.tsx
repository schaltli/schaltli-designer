"use client"

/**
 * What a styled gauge or bar adds to its panel
 * (docs/2026-11-23-instrument-styles.md, «Set by the user, fixed by the
 * style»): the style, the words on the face, the scale, the zones and the
 * needle's motion. Shared by the gauge's and the bar's panels, so the two
 * cannot drift.
 */

import {
  calibratedRange,
  normalizeInstrument,
  presetLabels,
  STYLE_META,
  type CalibrationPoint,
  type InstrumentLabel,
  type InstrumentScaleProps,
  type InstrumentStyle,
  type InstrumentZone,
  type LabelPreset,
  type ZoneKind,
} from "@/lib/instrument"
import {
  AddListItem,
  FieldNote,
  ListItem,
  NumberField,
  PropertySection,
  SelectField,
  TextField,
  ToggleRow,
  listSummary,
} from "./index"

/** The styles as the panel names them, in the order of the proposals (by era). */
export const STYLE_OPTIONS: { value: "" | InstrumentStyle; label: string }[] = [
  { value: "", label: "Flat" },
  { value: "pressure", label: "Pressure gauge" },
  { value: "deco", label: "Art deco" },
  { value: "coil", label: "Moving coil" },
  { value: "roadster", label: "Roadster" },
  { value: "cockpit", label: "Cockpit" },
  { value: "rally", label: "Rally" },
  { value: "vfd", label: "VFD" },
  { value: "fuel", label: "Fuel gauge" },
  { value: "bluered", label: "Blue and red" },
  { value: "night", label: "Night drive" },
  { value: "engraving", label: "Engraving" },
]

const MOTION_OPTIONS = [
  { value: "style", label: "As the style" },
  { value: "direct", label: "Direct" },
] as const

const PRESET_OPTIONS: { value: LabelPreset | "custom"; label: string }[] = [
  { value: "numbers", label: "Numbers" },
  { value: "fuel", label: "E ½ F" },
  { value: "words", label: "LEER HALB VOLL" },
  { value: "custom", label: "Custom" },
]

const ZONE_OPTIONS: { value: ZoneKind; label: string }[] = [
  { value: "danger", label: "Danger" },
  { value: "warning", label: "Warning" },
  { value: "ok", label: "OK" },
]

interface Props {
  properties: Record<string, any>
  /** Several properties at once, as one change (one undo step). */
  onChange: (patch: Record<string, any>) => void
}

/** The style picker. Choosing the fuel gauge on a scale without labels gives it E ½ F. */
export function InstrumentStyleField({ properties, onChange }: Props) {
  const style = normalizeInstrument(properties).style ?? ""
  return (
    <SelectField
      id="instrumentStyle"
      label="Style"
      value={style}
      options={STYLE_OPTIONS}
      onChange={(value) => {
        if (!value) {
          onChange({ style: undefined })
          return
        }
        const patch: Record<string, any> = { style: value }
        const scale: InstrumentScaleProps = properties.scale ?? {}
        if (value === "fuel" && !scale.labels) {
          const { min, max } = calibratedRange(properties.calibrationPoints ?? [])
          patch.scale = { ...scale, labels: presetLabels("fuel", min, max) }
        }
        onChange(patch)
      }}
      hint="A physical instrument to copy. The style sets the material, the sweep and how the needle moves; the scale below sets what it measures."
    />
  )
}

function presetOf(labels: InstrumentLabel[] | undefined, min: number, max: number): LabelPreset | "custom" {
  if (!labels) return "numbers"
  for (const p of ["fuel", "words"] as const) {
    const want = presetLabels(p, min, max)!
    if (want.length === labels.length && want.every((w, i) => w.value === labels[i].value && w.text === labels[i].text))
      return p
  }
  return "custom"
}

/** Everything below the style: face, scale, zones. Only for a styled object. */
export function InstrumentSections({ properties, onChange }: Props) {
  const inst = normalizeInstrument(properties)
  if (!inst.style) return null
  const meta = STYLE_META[inst.style]
  const points: CalibrationPoint[] = properties.calibrationPoints ?? []
  const { min, max } = calibratedRange(points)
  const scale: InstrumentScaleProps = properties.scale ?? {}
  const labels: InstrumentLabel[] | undefined = Array.isArray(scale.labels) ? scale.labels : undefined
  const zones: InstrumentZone[] = Array.isArray(properties.zones) ? properties.zones : []
  const preset = presetOf(labels, min, max)

  const setScale = (patch: Partial<InstrumentScaleProps>) => {
    const next: Record<string, any> = { ...scale, ...patch }
    for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k]
    onChange({ scale: Object.keys(next).length ? next : undefined })
  }
  // 0 in a number field means «automatic»: an empty field cannot be typed back.
  const autoNumber = (key: keyof InstrumentScaleProps) => (v: number) => setScale({ [key]: v > 0 ? v : undefined })
  const setLabels = (next: InstrumentLabel[] | undefined) => setScale({ labels: next && next.length ? next : undefined })
  const editLabel = (i: number, patch: Partial<InstrumentLabel>) =>
    setLabels((labels ?? []).map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const setZones = (next: InstrumentZone[]) => onChange({ zones: next.length ? next : undefined })
  const editZone = (i: number, patch: Partial<InstrumentZone>) => setZones(zones.map((z, j) => (j === i ? { ...z, ...patch } : z)))

  return (
    <>
      <PropertySection title="Face">
        <TextField
          id="instrumentCaption"
          label="Caption"
          value={properties.caption}
          placeholder="FRESH WATER"
          onChange={(value) => onChange({ caption: value || undefined })}
          hint="Printed on the face, where the style has room for it."
        />
        <TextField
          id="instrumentUnit"
          label="Unit"
          value={properties.unit}
          placeholder="%"
          onChange={(value) => onChange({ unit: value || undefined })}
        />
        {meta.readout ? (
          <ToggleRow
            label="Readout"
            checked={inst.readout !== false}
            onChange={(checked) => onChange({ readout: checked })}
            text="The value in digits, too"
          />
        ) : null}
        <SelectField
          id="instrumentMotion"
          label="Motion"
          value={inst.motion ?? "style"}
          options={MOTION_OPTIONS}
          onChange={(value) => onChange({ motion: value === "direct" ? "direct" : undefined })}
          hint="As the style: the needle swings like its model - a fuel gauge slowly, a pressure gauge with an overshoot. Direct: it jumps to the value."
        />
      </PropertySection>

      <PropertySection title="Scale" summary={preset === "custom" ? listSummary(labels?.length ?? 0, "label") : undefined}>
        <NumberField
          id="instrumentMajorStep"
          label="Major step"
          value={scale.majorStep}
          placeholder="Auto"
          min={0}
          step={0.1}
          onChange={autoNumber("majorStep")}
          hint="The value between two large ticks. 0 or empty: chosen from the range and the size."
        />
        <NumberField
          id="instrumentSubdivisions"
          label="Subdivisions"
          value={scale.minorPerMajor}
          placeholder="Auto"
          min={0}
          onChange={autoNumber("minorPerMajor")}
          hint="Small ticks per major step. 0 or empty: as many as fit."
        />
        <NumberField
          id="instrumentDecimals"
          label="Decimals"
          value={scale.decimals}
          placeholder="Auto"
          min={0}
          max={6}
          onChange={(v) => setScale({ decimals: v >= 0 ? Math.round(v) : undefined })}
        />
        <NumberField
          id="instrumentFactor"
          label="Factor"
          value={scale.factor}
          placeholder="1"
          min={0}
          onChange={autoNumber("factor")}
          hint="The labels show the value divided by this: 100 writes 0-4 for 0-400 W, with «× 100» as the unit."
        />
        <SelectField
          id="instrumentLabels"
          label="Labels"
          value={preset}
          options={PRESET_OPTIONS}
          onChange={(value) => {
            if (value === "custom") setLabels(labels ?? [{ value: min, text: String(min) }, { value: max, text: String(max) }])
            else setLabels(presetLabels(value as LabelPreset, min, max))
          }}
          hint="A preset fills the labels from the range; each one can then be changed below."
        />
        {(labels ?? []).map((label, i) => (
          <ListItem
            key={i}
            title={label.text || "(empty)"}
            summary={String(label.value)}
            onRemove={() => setLabels((labels ?? []).filter((_, j) => j !== i))}
          >
            <TextField label="Text" value={label.text} onChange={(text) => editLabel(i, { text })} />
            <NumberField label="At" value={label.value} onChange={(value) => editLabel(i, { value })} />
          </ListItem>
        ))}
        {labels ? (
          <AddListItem label="Add label" onClick={() => setLabels([...(labels ?? []), { value: (min + max) / 2, text: "" }])} />
        ) : null}
      </PropertySection>

      <PropertySection title="Zones" summary={listSummary(zones.length, "zone")}>
        {zones.map((zone, i) => (
          <ListItem
            key={i}
            title={ZONE_OPTIONS.find((o) => o.value === zone.kind)?.label ?? zone.kind}
            summary={`${zone.from} - ${zone.to}`}
            defaultOpen={i === zones.length - 1}
            onRemove={() => setZones(zones.filter((_, j) => j !== i))}
          >
            <SelectField label="Kind" value={zone.kind} options={ZONE_OPTIONS} onChange={(kind) => editZone(i, { kind: kind as ZoneKind })} />
            <NumberField label="From" value={zone.from} onChange={(from) => editZone(i, { from })} />
            <NumberField label="To" value={zone.to} onChange={(to) => editZone(i, { to })} />
          </ListItem>
        ))}
        <AddListItem
          label="Add zone"
          onClick={() => setZones([...zones, { from: min, to: min + (max - min) * 0.12, kind: "danger" }])}
        />
        {zones.length === 0 ? (
          <FieldNote>A stretch of the scale marked by meaning - Danger, Warning, OK. Each style draws it its own way.</FieldNote>
        ) : null}
      </PropertySection>
    </>
  )
}
