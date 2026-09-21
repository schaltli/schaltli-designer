"use client"

/**
 * Every property field on one page, at the panel's real width.
 *
 * Not part of the normal app - the same kind of harness as
 * app/test-render/page.tsx, and for the same reason: the fields
 * (components/property-panel/fields/) are the foundation the nineteen
 * panels are rebuilt on, and their rules are geometric - one left edge for
 * every value, one right edge for every ornament, a fold below 380 px of
 * panel, a collapse that is remembered by heading. Those are worth
 * measuring rather than eyeballing, and e2e/property-fields.spec.ts
 * measures them here.
 *
 * The width is settable through ?w= so the spec can watch the fold happen
 * without resizing the window.
 */

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import type { ProjectFont, Topic } from "@/components/project-editor"
import {
  AddListItem,
  ColorField,
  FontField,
  ButtonGroupRow,
  ConditionRow,
  FrameFields,
  IconField,
  ListItem,
  NumberField,
  NumberPair,
  PropertySections,
  PropertySection,
  SelectField,
  TextField,
  ToggleRow,
  TopicField,
  TypeBadge,
  frameSummary,
} from "@/components/property-panel/fields"

// Enough of a project for the three wrapped pickers to draw themselves.
const TOPICS: Topic[] = [
  { id: "t1", topic: "pkw/stat/tank/fresh", type: "numeric", examples: ["62"] },
]
const FONTS: ProjectFont[] = [
  { id: "f1", name: "helvB12", displayName: "Helvetica Bold", path: "fonts/helvB12.bdf", size: 12 },
]

const ASSETS = [{ id: "a1", name: "water.svg", type: "svg" as const, data: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="currentColor"/></svg>' }]

function Harness() {
  const params = useSearchParams()
  const width = Number.parseInt(params.get("w") ?? "480", 10) || 480

  const [text, setText] = useState("Frischwasser")
  const [thickness, setThickness] = useState(28)
  const [angles, setAngles] = useState<[number, number]>([135, 45])
  const [direction, setDirection] = useState("ltr")
  const [flatten, setFlatten] = useState(true)
  const [op, setOp] = useState("==")
  const [condValue, setCondValue] = useState("auto")
  const [frame, setFrame] = useState({ x: 20, y: 120, width: 240, height: 56 })
  const [icon, setIcon] = useState<string | null>("a1")
  const [topic, setTopic] = useState<string | undefined>("pkw/stat/tank/fresh")
  const [fill, setFill] = useState("#6750A4")
  const [fontId, setFontId] = useState<string | undefined>("f1")
  const [items, setItems] = useState([
    { id: "s1", title: "1", summary: "Aus · off" },
    { id: "s2", title: "2", summary: "An · on" },
  ])

  return (
    <div
      style={{ width }}
      data-testid="panel"
      className="@container/panel border-l border-border bg-background p-3.5"
    >
      <PropertySections>
        <PropertySection title="Content">
          <TextField id="fld-text" label="Name" value={text} onChange={setText} placeholder="none" />
          <IconField
            label="Icon"
            assetId={icon}
            projectAssets={ASSETS}
            onSelect={() => setIcon("a1")}
            onClear={() => setIcon(null)}
          />
          <SelectField
            id="fld-select"
            label="Direction"
            value={direction}
            onChange={setDirection}
            options={[
              { value: "ltr", label: "Left to right" },
              { value: "btt", label: "Bottom to top" },
            ]}
          />
        </PropertySection>

        <PropertySection title="Data">
          <SelectField
            id="fld-topic"
            label="Topic"
            value="t1"
            onChange={() => {}}
            options={[{ value: "t1", label: "pkw/stat/tank/fresh" }]}
            badge={<TypeBadge kind="number" />}
          />
          <NumberField
            id="fld-step"
            label="Step"
            value={thickness}
            onChange={setThickness}
            unit="px"
            hint="How far a finger moves the value in one jump."
          />
          <NumberPair
            label="Angles"
            values={angles}
            onChange={(i, v) => setAngles((a) => (i === 0 ? [v, a[1]] : [a[0], v]))}
            unit="°"
          />
          {/* The wrapped pickers, which draw a shadcn trigger of their own -
              taller, white and bordered until the row re-dresses it. Here so
              that stays measured rather than eyeballed. */}
          <TopicField
            label="Bound topic"
            selectedTopicId={topic}
            topics={TOPICS}
            onTopicChange={setTopic}
            onManageTopics={() => {}}
          />
          <FontField value={fontId} fonts={FONTS} onChange={setFontId} />
          <ColorField label="Fill" value={fill} onChange={setFill} colorDepth="24bit" />
        </PropertySection>

        <PropertySection title="States" summary={`${items.length} states`}>
          {items.map((it, i) => (
            <ListItem
              key={it.id}
              title={it.title}
              summary={it.summary}
              defaultOpen={i === 0}
              index={i}
              onReorder={(from, to) =>
                setItems((xs) => {
                  const next = [...xs]
                  const [moved] = next.splice(from, 1)
                  next.splice(to, 0, moved)
                  return next
                })
              }
              onRemove={() => setItems((xs) => xs.filter((x) => x.id !== it.id))}
            >
              <TextField label="Label" value={it.summary} onChange={() => {}} />
            </ListItem>
          ))}
          <AddListItem
            label="Add state"
            onClick={() => setItems((xs) => [...xs, { id: `s${xs.length + 1}`, title: String(xs.length + 1), summary: "neu" }])}
          />
        </PropertySection>

        <PropertySection title="Visibility">
          <ConditionRow
            label="Shown when"
            operator={op}
            value={condValue}
            onOperatorChange={setOp}
            onValueChange={setCondValue}
          />
          <ToggleRow label="Flatten" checked={flatten} onChange={setFlatten} text="Ignore the icon's own colours" />
          <ButtonGroupRow label="Align" buttons={[
            { label: "Left", onClick: () => {} },
            { label: "Centre", onClick: () => {} },
            { label: "Right", onClick: () => {} },
          ]} />
        </PropertySection>

        <PropertySection title="Frame" defaultCollapsed summary={frameSummary(frame.x, frame.y, frame.width, frame.height)}>
          <FrameFields
            {...frame}
            onChange={(k, v) => setFrame((f) => ({ ...f, [k]: v }))}
            locked={["height"]}
            lockedHint="Height follows the font."
          />
        </PropertySection>
      </PropertySections>
    </div>
  )
}

export default function TestFieldsPage() {
  return (
    <main className="min-h-screen bg-muted/30 p-6">
      <p className="mb-4 text-xs text-muted-foreground">
        Property-field harness - see components/property-panel/fields/. Not part of the normal app.
      </p>
      <Suspense fallback={null}>
        <Harness />
      </Suspense>
    </main>
  )
}
