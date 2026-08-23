"use client"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ColorDepthAwarePicker } from "./color-depth-aware-picker"
import { TopicSelector } from "./topic-selector"
import { Separator } from "@/components/ui/separator"
import type { ScreenObject, Topic, ProjectFont } from "../project-editor"
import { FontIcon } from "@/components/icons/font-icon"
import { ARC_CLOCK_STEP_DEGREES, formatClock } from "@/lib/arc-raster"
import { ARC_PRESETS } from "@/components/canvas/renderers/render-arc-level"

interface ArcLevelPropertiesProps {
  selectedObject: ScreenObject
  onUpdateObject: (id: string, updates: Partial<ScreenObject>) => void
  topics: Topic[]
  onManageTopics: () => void
  fonts: ProjectFont[]
  colorDepth: "1bit" | "4bit" | "24bit"
  onManageFonts: () => void
}

// The 24 half-hour positions, as angles. Half hours because twelve hours span
// 360 degrees, so an hour is 30 and a half hour is 15 - both whole numbers,
// which the stored format needs. A quarter hour would be 7.5 and could not
// be stored, which is why the dial snaps rather than following the pointer.
const CLOCK_POSITIONS = Array.from({ length: 360 / ARC_CLOCK_STEP_DEGREES }, (_, i) => i * ARC_CLOCK_STEP_DEGREES)

/**
 * A clock face for picking where the scale starts and ends.
 *
 * A round display's gauge is described the way anyone describes a position on
 * a round face - "from eight to four", not "240 degrees" - and a dial shows
 * the result before you commit to it, which two number fields cannot. The
 * numeric fields are still there underneath for the case that needs an angle
 * the clock cannot name.
 */
function ClockDial({
  minAngle,
  maxAngle,
  counterClockwise,
  onPick,
}: {
  minAngle: number
  maxAngle: number
  counterClockwise: boolean
  onPick: (which: "min" | "max", angle: number) => void
}) {
  const size = 150
  const centre = size / 2
  const radius = 56

  // Screen coordinates for an angle, with zero at twelve o'clock and
  // clockwise positive - the same convention the rasterizer uses, so what is
  // picked here is literally what gets stored.
  const pointAt = (deg: number, r: number) => {
    const rad = ((deg - 90) * Math.PI) / 180
    return { x: centre + Math.cos(rad) * r, y: centre + Math.sin(rad) * r }
  }

  const span = counterClockwise ? (minAngle - maxAngle + 360) % 360 : (maxAngle - minAngle + 360) % 360
  const sweep = span === 0 ? 360 : span
  const sweepStart = counterClockwise ? maxAngle : minAngle

  // The preview arc, drawn as a polyline rather than an SVG arc so it cannot
  // disagree with the rasterizer about which way round it goes.
  const steps = Math.max(2, Math.round(sweep / 4))
  const path = Array.from({ length: steps + 1 }, (_, i) => {
    const p = pointAt(sweepStart + (sweep * i) / steps, radius)
    return `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`
  }).join(" ")

  const minPoint = pointAt(minAngle, radius)
  const maxPoint = pointAt(maxAngle, radius)

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[190px] mx-auto block select-none">
      <circle cx={centre} cy={centre} r={radius} fill="none" stroke="currentColor" strokeWidth={10} opacity={0.12} />
      <path d={path} fill="none" stroke="currentColor" strokeWidth={10} opacity={0.55} strokeLinecap="butt" />

      {CLOCK_POSITIONS.map((deg) => {
        const outer = pointAt(deg, radius + 9)
        const isHour = deg % 30 === 0
        return (
          <g key={deg}>
            {isHour && (
              <text
                x={outer.x}
                y={outer.y}
                fontSize={8}
                textAnchor="middle"
                dominantBaseline="central"
                fill="currentColor"
                opacity={0.5}
              >
                {formatClock(deg)}
              </text>
            )}
            {/* Generous invisible hit area - the visible dots are far too
                small to aim at, and every position has to be reachable. */}
            <circle
              cx={pointAt(deg, radius).x}
              cy={pointAt(deg, radius).y}
              r={9}
              fill="transparent"
              className="cursor-pointer"
              onClick={(e) => onPick(e.shiftKey ? "max" : "min", deg)}
            />
            <circle cx={pointAt(deg, radius).x} cy={pointAt(deg, radius).y} r={isHour ? 1.6 : 1} fill="currentColor" opacity={0.35} />
          </g>
        )
      })}

      <circle cx={minPoint.x} cy={minPoint.y} r={5} fill="currentColor" />
      <text x={minPoint.x} y={minPoint.y - 11} fontSize={7.5} textAnchor="middle" fill="currentColor" opacity={0.8}>
        min
      </text>
      <circle cx={maxPoint.x} cy={maxPoint.y} r={5} fill="none" stroke="currentColor" strokeWidth={2} />
      <text x={maxPoint.x} y={maxPoint.y + 14} fontSize={7.5} textAnchor="middle" fill="currentColor" opacity={0.8}>
        max
      </text>
    </svg>
  )
}

export function ArcLevelProperties({
  selectedObject,
  onUpdateObject,
  topics,
  onManageTopics,
  fonts,
  colorDepth,
  onManageFonts,
}: ArcLevelPropertiesProps) {
  const updateProperty = (key: string, value: any) => {
    onUpdateObject(selectedObject.id, {
      properties: { ...selectedObject.properties, [key]: value },
    })
  }

  const props = selectedObject.properties
  const minAngle = props.minAngle ?? 225
  const maxAngle = props.maxAngle ?? 135
  const counterClockwise = props.direction === "ccw"

  const updatePosition = (key: "x" | "y", value: number) => {
    onUpdateObject(selectedObject.id, { [key]: value })
  }

  // One field, not a width and a height. The ring is inscribed in its box, so
  // the two are always equal - and the canvas already enforces that when you
  // drag or resize. Offering them separately here would let someone type an
  // oval that the canvas would never produce, which is what the icon panel
  // still does.
  const updateSize = (value: number) => {
    const size = Math.max(1, value)
    onUpdateObject(selectedObject.id, { width: size, height: size })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <Label htmlFor="arc-x" className="text-xs">
            X
          </Label>
          <Input
            id="arc-x"
            type="number"
            value={selectedObject.x}
            onChange={(e) => updatePosition("x", Number.parseInt(e.target.value) || 0)}
            className="h-8"
          />
        </div>
        <div>
          <Label htmlFor="arc-y" className="text-xs">
            Y
          </Label>
          <Input
            id="arc-y"
            type="number"
            value={selectedObject.y}
            onChange={(e) => updatePosition("y", Number.parseInt(e.target.value) || 0)}
            className="h-8"
          />
        </div>
        <div>
          <Label htmlFor="arc-size" className="text-xs">
            Size
          </Label>
          <Input
            id="arc-size"
            type="number"
            min="1"
            value={selectedObject.width}
            onChange={(e) => updateSize(Number.parseInt(e.target.value) || 1)}
            className="h-8"
          />
        </div>
      </div>

      <Separator />

      <TopicSelector
        selectedTopicId={props.topic}
        topics={topics}
        onTopicChange={(topic) => updateProperty("topic", topic)}
        onManageTopics={onManageTopics}
        label="Topic (fill)"
      />

      <TopicSelector
        selectedTopicId={props.setpointTopic}
        topics={topics}
        onTopicChange={(topic) => updateProperty("setpointTopic", topic)}
        onManageTopics={onManageTopics}
        label="Topic (setpoint marker, optional)"
      />
      <p className="text-[11px] text-muted-foreground -mt-1">
        Leave empty for a plain filled arc - a tank level has nothing to aim at.
      </p>

      <Separator />

      {/* Scale geometry */}
      <div>
        <Label className="text-xs">Scale</Label>
        <p className="text-[11px] text-muted-foreground mt-0.5 mb-1">
          Click a position for <b>min</b>, shift-click for <b>max</b>. Same position for both means a full ring.
        </p>
        <ClockDial
          minAngle={minAngle}
          maxAngle={maxAngle}
          counterClockwise={counterClockwise}
          onPick={(which, angle) => updateProperty(which === "min" ? "minAngle" : "maxAngle", angle)}
        />

        <div className="flex flex-wrap gap-1 mt-2">
          {ARC_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => {
                onUpdateObject(selectedObject.id, {
                  properties: { ...props, minAngle: preset.minAngle, maxAngle: preset.maxAngle },
                })
              }}
              className="px-2 py-1 text-[11px] rounded bg-muted hover:bg-muted-foreground/20"
              title={`${formatClock(preset.minAngle)} → ${formatClock(preset.maxAngle)}`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2 mt-2">
          <div>
            <Label className="text-xs block mb-1">Min ({formatClock(minAngle)})</Label>
            <Input
              type="number"
              min="0"
              max="359"
              value={minAngle}
              onChange={(e) => updateProperty("minAngle", ((Number(e.target.value) || 0) % 360 + 360) % 360)}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs block mb-1">Max ({formatClock(maxAngle)})</Label>
            <Input
              type="number"
              min="0"
              max="359"
              value={maxAngle}
              onChange={(e) => updateProperty("maxAngle", ((Number(e.target.value) || 0) % 360 + 360) % 360)}
              className="h-8 text-xs"
            />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          Degrees, zero at twelve o&apos;clock. The clock snaps to half hours because a quarter hour is 7.5 degrees and
          cannot be stored whole.
        </p>
      </div>

      <div>
        <Label className="text-xs">Direction</Label>
        <Select value={props.direction || "cw"} onValueChange={(value) => updateProperty("direction", value)}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cw">Clockwise</SelectItem>
            <SelectItem value="ccw">Counter-clockwise</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground mt-1">
          Which way round the dial the scale runs from min to max - so the other way between the same two positions is
          the complementary arc, not a mirrored one. For a mirrored dial, name the ends in the order the scale runs.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs block mb-1">Thickness</Label>
          <Input
            type="number"
            min="1"
            value={props.thickness ?? 22}
            onChange={(e) => updateProperty("thickness", Math.max(1, Number(e.target.value) || 1))}
            className="h-8 text-xs"
          />
        </div>
        <div>
          <Label className="text-xs block mb-1">Marker width (deg)</Label>
          <Input
            type="number"
            min="1"
            max="45"
            value={props.markerWidth ?? 4}
            onChange={(e) => updateProperty("markerWidth", Math.min(45, Math.max(1, Number(e.target.value) || 1)))}
            className="h-8 text-xs"
          />
        </div>
      </div>

      <Separator />

      {/* Value mapping - the same piecewise-linear table the bar uses, and
          the same shared interpolation, so the two cannot drift. */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label className="text-xs">Calibration Points</Label>
          <button
            onClick={() => {
              const current = props.calibrationPoints || []
              updateProperty("calibrationPoints", [...current, { value: 50, barSizePercent: 50 }])
            }}
            className="px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
          >
            +
          </button>
        </div>
        <div className="space-y-2">
          {(props.calibrationPoints || []).map((point: any, index: number) => (
            <div key={index} className="p-2 bg-muted rounded">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs block mb-1">Value</Label>
                  <Input
                    type="number"
                    value={point.value ?? ""}
                    onChange={(e) => {
                      const next = [...(props.calibrationPoints || [])]
                      next[index] = { ...next[index], value: Number(e.target.value) || 0 }
                      updateProperty("calibrationPoints", next)
                    }}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs block mb-1">Arc %</Label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={point.barSizePercent ?? ""}
                    onChange={(e) => {
                      const next = [...(props.calibrationPoints || [])]
                      next[index] = {
                        ...next[index],
                        barSizePercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)),
                      }
                      updateProperty("calibrationPoints", next)
                    }}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
              {(props.calibrationPoints || []).length > 2 && (
                <button
                  onClick={() =>
                    updateProperty(
                      "calibrationPoints",
                      (props.calibrationPoints || []).filter((_: any, i: number) => i !== index),
                    )
                  }
                  className="mt-1 text-[11px] text-destructive hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <Separator />

      <div>
        <Label className="text-xs">Display Value</Label>
        <Select value={props.displayValue || "value"} onValueChange={(value) => updateProperty("displayValue", value)}>
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="value">Value</SelectItem>
            <SelectItem value="percentage">Percentage</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="fontId" className="text-xs">
          Font
        </Label>
        <Select
          value={props.fontId || ""}
          onValueChange={(value) => {
            if (value === "manage-fonts") {
              onManageFonts()
              return
            }
            updateProperty("fontId", value)
          }}
        >
          <SelectTrigger className="h-8">
            <SelectValue placeholder="Select font" />
          </SelectTrigger>
          <SelectContent>
            {fonts.map((font) => (
              <SelectItem key={font.id} value={font.id}>
                <span className="flex items-center gap-2">
                  <FontIcon className="h-3 w-3" />
                  {font.name}
                </span>
              </SelectItem>
            ))}
            <SelectItem value="manage-fonts">Manage fonts...</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Separator />

      <ColorDepthAwarePicker
        label="Track Color"
        value={props.trackColor || "#303030"}
        onChange={(value) => updateProperty("trackColor", value)}
        colorDepth={colorDepth}
        allowTransparent={false}
      />

      <ColorDepthAwarePicker
        label="Fill Color"
        value={props.fillColor || "#4CAF50"}
        onChange={(value) => updateProperty("fillColor", value)}
        colorDepth={colorDepth}
        allowTransparent={false}
      />

      <ColorDepthAwarePicker
        label="Marker Color"
        value={props.markerColor || "#ffffff"}
        onChange={(value) => updateProperty("markerColor", value)}
        colorDepth={colorDepth}
        allowTransparent={false}
      />

      <ColorDepthAwarePicker
        label="Text Color"
        value={props.textColor || "#ffffff"}
        onChange={(value) => updateProperty("textColor", value)}
        colorDepth={colorDepth}
        allowTransparent={false}
      />

      <ColorDepthAwarePicker
        label="Background Color"
        value={props.backgroundColor || "transparent"}
        onChange={(value) => updateProperty("backgroundColor", value)}
        colorDepth={colorDepth}
        allowTransparent={true}
      />
      <p className="text-[11px] text-muted-foreground -mt-1">
        Transparent leaves the ring floating on the screen. The anti-aliased edges then mix into the screen&apos;s own
        background colour, on the device exactly as here.
      </p>
    </div>
  )
}
