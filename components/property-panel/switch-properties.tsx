"use client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Button } from "@/components/ui/button"
import { ColorDepthAwarePicker } from "./color-depth-aware-picker"
import { IconColorField } from "./icon-color-field"
import { TopicSelector } from "./topic-selector"
import { Separator } from "@/components/ui/separator"
import type { ScreenObject, Topic, ProjectAsset, ProjectFont } from "../project-editor"

const Plus = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M5 12h14" />
    <path d="m12 5v14" />
  </svg>
)

const Trash2 = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
  </svg>
)

const Search = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.35-4.35" />
  </svg>
)

const X = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
)

// One icon slot's picker UI (thumbnail + name + clear, or a "select" button
// when empty) - shared between a state's normal Icon and its optional
// Active Icon, which are otherwise identical UI wired to different
// properties. Pulled out specifically because Active Icon was added
// alongside Icon (2026-08-14) rather than copy-pasted, so the two can't
// drift the way two independently-hand-written copies eventually would.
function IconPickerField({
  label,
  hint,
  assetId,
  projectAssets,
  onSelect,
  onClear,
}: {
  label: string
  hint?: string
  assetId: string | undefined
  projectAssets: ProjectAsset[]
  onSelect: () => void
  onClear: () => void
}) {
  const asset = assetId ? projectAssets.find((a) => a.id === assetId) : undefined
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground mb-1">{hint}</p>}
      {assetId ? (
        <div className="flex items-center gap-2 mt-1 p-2 bg-background rounded border">
          <div className="w-8 h-8 flex-shrink-0 flex items-center justify-center p-1">
            {(() => {
              if (asset && asset.data) {
                try {
                  let svgContent = asset.data
                  if (asset.data.startsWith("data:image/svg+xml;base64,")) {
                    svgContent = atob(asset.data.split(",")[1])
                  } else if (asset.data.startsWith("data:image/svg+xml,")) {
                    svgContent = decodeURIComponent(asset.data.split(",")[1])
                  }
                  return (
                    <div
                      className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                      dangerouslySetInnerHTML={{ __html: svgContent }}
                    />
                  )
                } catch (error) {
                  return <span className="text-xs">📄</span>
                }
              }
              return <span className="text-xs">📄</span>
            })()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium truncate">{asset?.name || "Unknown"}</div>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 flex-shrink-0 bg-transparent"
            onClick={onClear}
            title={`Clear ${label.toLowerCase()}`}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2 mt-1 p-2 bg-background rounded border">
          <div className="flex-1 text-xs text-muted-foreground">No icon</div>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 flex-shrink-0 bg-transparent"
            onClick={onSelect}
            title={`Select ${label.toLowerCase()}`}
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

interface SwitchPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  topics: Topic[]
  onManageTopics: () => void
  projectAssets: ProjectAsset[]
  fonts: ProjectFont[]
  colorDepth: "1bit" | "4bit" | "24bit"
  onOpenIconSelector: (stateIndex: number, slot: "normal" | "active") => void
  onManageFonts?: () => void
  allScreens?: Array<{
    objects: Array<{
      properties: Record<string, any>
    }>
    backgroundColor?: string
    gridColor?: string
  }>
  nextId: number
  onIncrementNextId: () => void
}

export function SwitchProperties({
  selectedObject,
  onUpdateObject,
  topics,
  onManageTopics,
  projectAssets,
  fonts,
  colorDepth,
  onOpenIconSelector,
  onManageFonts,
  allScreens,
  nextId,
  onIncrementNextId,
}: SwitchPropertiesProps) {
  const updateProperty = (key: string, value: any) => {
    onUpdateObject(selectedObject.id, {
      properties: {
        ...selectedObject.properties,
        [key]: value,
      },
    })
  }

  const updatePosition = (key: "x" | "y" | "width" | "height", value: number) => {
    onUpdateObject(selectedObject.id, { [key]: value })
  }

  const states: any[] = selectedObject.properties.states || []
  const mode: "segmented" | "single" = selectedObject.properties.mode === "single" ? "single" : "segmented"

  const updateState = (index: number, updates: Record<string, any>) => {
    const newStates = [...states]
    newStates[index] = { ...newStates[index], ...updates }
    updateProperty("states", newStates)
  }

  return (
    <div className="space-y-3">
      {/* Read Topic - retained, drives which segment shows active */}
      <TopicSelector
        selectedTopicId={selectedObject.properties.topic}
        topics={topics}
        onTopicChange={(topic) => updateProperty("topic", topic)}
        onManageTopics={onManageTopics}
        label="Read Topic (retained)"
        className="w-full"
      />

      {/* Write Topic - same TopicSelector as Read Topic above, same
          restriction to registered project Topics (2026-08-14: an earlier
          version kept this a free-text field with a quick-pick dropdown
          alongside it, reasoning that a command destination is often never
          registered as its own Topic - reverted in favor of matching Read
          Topic exactly, so a write destination has to be a real, known
          Topic like any other binding). allowSubtopics=false: a publish
          destination has to be the whole topic - you can only send the
          full JSON payload to e.g. "sensor/data", never to a virtual
          "sensor/data#field" path, so a JSON topic must render as one
          plain pick here instead of an expandable "choose a field" node. */}
      <TopicSelector
        selectedTopicId={selectedObject.properties.writeTopic}
        topics={topics}
        onTopicChange={(topic) => updateProperty("writeTopic", topic)}
        onManageTopics={onManageTopics}
        label="Write Topic (command)"
        className="w-full"
        allowSubtopics={false}
      />

      {/* Font Selection - shared across every segment's label */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <Label className="text-xs">Font</Label>
          {onManageFonts && (
            <button onClick={onManageFonts} className="text-xs text-blue-600 hover:underline">
              Manage Fonts
            </button>
          )}
        </div>
        <select
          value={selectedObject.properties.fontId || ""}
          onChange={(e) => updateProperty("fontId", e.target.value || undefined)}
          className="w-full h-8 px-2 text-xs border rounded"
        >
          <option value="">System Default</option>
          {fonts.map((font) => (
            <option key={font.id} value={font.id}>
              {font.name} ({font.size}px)
            </option>
          ))}
        </select>
      </div>

      {/* Mode - decides whether the states sit side by side or share one
          surface. Everything below (labels, icons, read/write values) means
          the same thing in both; only the marker rule and the tap behaviour
          differ, which is what the hint under States spells out. */}
      <div>
        <Label className="text-xs">Mode</Label>
        <select
          value={mode}
          onChange={(e) => updateProperty("mode", e.target.value)}
          className="w-full h-8 px-2 text-xs border rounded mt-1"
        >
          <option value="segmented">Segmented - one area per state</option>
          <option value="single">Single area - tap advances</option>
        </select>
      </div>

      <Separator />

      {/* States */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs">States</Label>
          <button
            onClick={() => {
              const newStates = [
                ...states,
                {
                  id: `switchstate-${nextId}`,
                  label: `State ${states.length + 1}`,
                  readValue: "",
                  writeValue: "",
                },
              ]
              onIncrementNextId()
              updateProperty("states", newStates)
            }}
            className="p-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>

        <div className="text-xs text-blue-600 dark:text-blue-400 mb-3">
          {mode === "single" ? (
            <>
              One area showing whichever state's read value matches the read topic. Tapping it on the device publishes
              the next state's write value, wrapping around at the end. Tick "Show marker" on the states that should
              carry the bar. With no match yet, the area shows "?".
            </>
          ) : (
            <>
              Shown as segments side by side, in this order. Tapping a segment on the device publishes its write value;
              the active segment is whichever one's read value matches the read topic, and the marker bar always follows
              it.
            </>
          )}
        </div>

        <div className="space-y-2">
          {states.map((state, index) => (
            <div key={state.id || `state-${index}`} className="p-2 bg-muted rounded relative">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-semibold">State #{index + 1}</div>
                <button
                  onClick={() => updateProperty("states", states.filter((_, i) => i !== index))}
                  className="p-1 text-destructive hover:bg-destructive/10 rounded"
                  title="Delete State"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <div>
                  <Label className="text-xs block mb-1">Label</Label>
                  <Input
                    value={state.label ?? ""}
                    onChange={(e) => updateState(index, { label: e.target.value })}
                    placeholder="Display text"
                    className="h-8 text-xs"
                  />
                </div>

                <div className="flex gap-1">
                  <div className="flex-1">
                    <Label className="text-xs block mb-1">Read value</Label>
                    <Input
                      value={state.readValue ?? ""}
                      onChange={(e) => updateState(index, { readValue: e.target.value })}
                      placeholder="e.g. high"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="flex-1">
                    <Label className="text-xs block mb-1">Write value</Label>
                    <Input
                      value={state.writeValue ?? ""}
                      onChange={(e) => updateState(index, { writeValue: e.target.value })}
                      placeholder="e.g. high"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>

                {/* Single-area mode only: which states carry the marker bar
                    is a question only the author can answer - "Auto" on a
                    thermostat is neither obviously on nor obviously off - and
                    the list has no reordering UI, so a positional convention
                    would be uncorrectable. In segmented mode the bar always
                    follows the active segment and this is not asked. */}
                {mode === "single" && (
                  <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={state.showMarker === true}
                      onChange={(e) => updateState(index, { showMarker: e.target.checked })}
                      className="h-3.5 w-3.5"
                    />
                    Show marker bar in this state
                  </label>
                )}

                <IconPickerField
                  label="Icon (optional)"
                  assetId={state.iconAssetId}
                  projectAssets={projectAssets}
                  onSelect={() => onOpenIconSelector(index, "normal")}
                  onClear={() => updateState(index, { iconAssetId: undefined })}
                />

                {/* Segmented mode only. In single-area mode a state is only
                    ever drawn while it is active, so its own Icon already is
                    its active picture and a second slot would leave the
                    first one unreachable. */}
                {mode === "segmented" && (
                  <IconPickerField
                    label="Icon when active (optional)"
                    hint="A different picture while this segment is the active one - a filled bulb against an outlined one, say. Falls back to Icon when unset."
                    assetId={state.activeIconAssetId}
                    projectAssets={projectAssets}
                    onSelect={() => onOpenIconSelector(index, "active")}
                    onClear={() => updateState(index, { activeIconAssetId: undefined })}
                  />
                )}
              </div>
            </div>
          ))}
        </div>

        {states.length === 0 && (
          <div className="text-xs text-muted-foreground p-2 bg-muted rounded">
            Click + to add states.{" "}
            {mode === "single" ? "The switch shows one of them at a time." : "Each state is one segment of the switch."}
          </div>
        )}
      </div>

      <Separator />

      {/* Corner Radius - same slider as box/SoftwareButton. Default 0, so no
          existing Switch changes appearance until someone moves it. */}
      <div>
        <Label htmlFor="cornerRadius" className="text-xs">
          Corner Radius
        </Label>
        <div className="px-2">
          <Slider
            value={[selectedObject.properties.cornerRadius || 0]}
            onValueChange={([value]) => updateProperty("cornerRadius", value)}
            min={0}
            max={20}
            step={1}
            className="w-full"
          />
          <div className="text-xs text-muted-foreground mt-1">{selectedObject.properties.cornerRadius || 0}px</div>
        </div>
      </div>

      {/* Colors */}
      <ColorDepthAwarePicker
        label="Background Color"
        value={selectedObject.properties.backgroundColor || "#ffffff"}
        onChange={(value) => updateProperty("backgroundColor", value)}
        colorDepth={colorDepth}
        allowTransparent={true}
        screens={allScreens}
      />

      {/* Still called activeBackgroundColor in the data: the value saved in
          every existing project is already the right colour for its new job,
          and renaming the key would have needed a migration to say nothing
          new. It is the marker bar here, and the hollow unconfirmed bar on a
          device. */}
      <ColorDepthAwarePicker
        label="Marker Bar Color"
        value={selectedObject.properties.activeBackgroundColor || "#2563eb"}
        onChange={(value) => updateProperty("activeBackgroundColor", value)}
        colorDepth={colorDepth}
        allowTransparent={false}
        screens={allScreens}
      />

      <ColorDepthAwarePicker
        label="Border Color"
        value={selectedObject.properties.borderColor || "#cccccc"}
        onChange={(value) => updateProperty("borderColor", value)}
        colorDepth={colorDepth}
        allowTransparent={true}
        screens={allScreens}
      />

      <ColorDepthAwarePicker
        label="Text Color"
        value={selectedObject.properties.textColor || "#000000"}
        onChange={(value) => updateProperty("textColor", value)}
        colorDepth={colorDepth}
        allowTransparent={false}
        screens={allScreens}
      />

      {/* One color for every state's icon, next to the one textColor that
          already covers every state's label. States differ by picture and
          wording, not by color. */}
      <IconColorField
        assetIds={states.flatMap((s: any) => [s.iconAssetId, s.activeIconAssetId])}
        projectAssets={projectAssets}
        iconColor={selectedObject.properties.iconColor}
        iconColorFlatten={selectedObject.properties.iconColorFlatten}
        onUpdate={updateProperty}
        colorDepth={colorDepth}
        screens={allScreens}
      />

      {/* Position Controls */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="x" className="text-xs">
            X
          </Label>
          <Input
            id="x"
            type="number"
            value={selectedObject.x}
            onChange={(e) => updatePosition("x", Number.parseInt(e.target.value) || 0)}
            className="h-8"
          />
        </div>
        <div>
          <Label htmlFor="y" className="text-xs">
            Y
          </Label>
          <Input
            id="y"
            type="number"
            value={selectedObject.y}
            onChange={(e) => updatePosition("y", Number.parseInt(e.target.value) || 0)}
            className="h-8"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label htmlFor="width" className="text-xs">
            Width
          </Label>
          <Input
            id="width"
            type="number"
            value={selectedObject.width}
            onChange={(e) => updatePosition("width", Number.parseInt(e.target.value) || 1)}
            className="h-8"
          />
        </div>
        <div>
          <Label htmlFor="height" className="text-xs">
            Height
          </Label>
          <Input
            id="height"
            type="number"
            value={selectedObject.height}
            onChange={(e) => updatePosition("height", Number.parseInt(e.target.value) || 1)}
            className="h-8"
          />
        </div>
      </div>
    </div>
  )
}
