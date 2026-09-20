/**
 * One icon per object type for the toolbar and the object tree, agreed
 * 2026-09-20 on the design canvas with the control split
 * (docs/2026-09-20-control-split.md, decision 12).
 *
 * One library, one stroke: Lucide's glyphs where Lucide has a rhyming one,
 * and the rest drawn in its manner (stroke 2 on a 24 grid) so that Bar and
 * Slider, Gauge and Dial, Button and Button Group read as pairs. The rule for
 * colour: ink draws the frame, the accent draws the part the data moves -
 * the bar's fill, the switch's knob, the group's chosen segment, the
 * switcher's shown sheet, the live line, the picture in the live icon, the
 * letter of the live text. Text, Icon, Line, Box and Button bind to nothing
 * and stay one colour. A slider's handle is ink: it is what a finger holds,
 * not what the data moves.
 *
 * The accent is the UI's own primary colour, not the device palette's: these
 * are designer chrome, and they have to read on the toolbar's background.
 */
import type { ObjectType } from "@/lib/object-types"

const ACCENT = "hsl(var(--primary))"

type IconProps = { className?: string }

function Glyph({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}

// Lucide `type`.
export const TextIcon = (p: IconProps) => (
  <Glyph {...p}>
    <polyline points="4 7 4 4 20 4 20 7" />
    <line x1="9" x2="15" y1="20" y2="20" />
    <line x1="12" x2="12" y1="4" y2="20" />
  </Glyph>
)

// `type`, the letter in the accent and the bar it hangs from in ink.
export const LiveTextIcon = (p: IconProps) => (
  <Glyph {...p}>
    <polyline points="4 7 4 4 20 4 20 7" />
    <line x1="9" x2="15" y1="20" y2="20" stroke={ACCENT} />
    <line x1="12" x2="12" y1="4" y2="20" stroke={ACCENT} />
  </Glyph>
)

// Lucide `image`.
export const IconIcon = (p: IconProps) => (
  <Glyph {...p}>
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
  </Glyph>
)

// `image`, the frame in ink and the picture in the accent.
export const LiveIconIcon = (p: IconProps) => (
  <Glyph {...p}>
    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
    <circle cx="9" cy="9" r="2" stroke={ACCENT} />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" stroke={ACCENT} />
  </Glyph>
)

// A hollow track with 3 px of room inside 2 px walls; the fill is a 3 px
// stroke with round caps, flush with the track's inner edge.
const Track = () => <rect x="2" y="9.5" width="20" height="5" rx="2.5" />

export const BarIcon = (p: IconProps) => (
  <Glyph {...p}>
    <Track />
    <path d="M4.5 12h8" strokeWidth="3" stroke={ACCENT} />
  </Glyph>
)

export const SliderIcon = (p: IconProps) => (
  <Glyph {...p}>
    <Track />
    <path d="M4.5 12h6" strokeWidth="3" stroke={ACCENT} />
    <circle cx="13" cy="12" r="3.5" fill="var(--background)" />
  </Glyph>
)

// The same bent into a 240-degree arc centred (12,14): a hollow band 3 wide
// (r 7 to 10) with round caps as one closed outline, the fill a 3 px stroke
// along the centreline (r 8.5) over the first 35 %, its round start cap
// coinciding with the band's.
const Band = () => (
  <path d="M3.34 19A10 10 0 1 1 20.66 19A1.5 1.5 0 0 1 18.06 17.5A7 7 0 1 0 5.94 17.5A1.5 1.5 0 0 1 3.34 19Z" />
)
const BandFill = () => <path d="M4.64 18.25A8.5 8.5 0 0 1 7 7.12" strokeWidth="3" stroke={ACCENT} />

export const GaugeIcon = (p: IconProps) => (
  <Glyph {...p}>
    <Band />
    <BandFill />
  </Glyph>
)

export const DialIcon = (p: IconProps) => (
  <Glyph {...p}>
    <Band />
    <BandFill />
    <circle cx="7" cy="7.12" r="3.5" fill="var(--background)" />
  </Glyph>
)

// Lucide `toggle-right`, the knob - whose position is the value - in the accent.
export const SwitchIcon = (p: IconProps) => (
  <Glyph {...p}>
    <rect width="20" height="12" x="2" y="6" rx="6" ry="6" />
    <circle cx="16" cy="12" r="3" fill={ACCENT} stroke="none" />
  </Glyph>
)

// A connected strip of three, the chosen segment filled with the accent.
export const ButtonGroupIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="M9.67 8h4.66v8H9.67z" fill={ACCENT} stroke="none" />
    <rect x="2" y="7" width="20" height="10" rx="3" />
    <path d="M8.67 7v10M15.33 7v10" />
  </Glyph>
)

// One button with a label line, the same footprint as the group: one
// segment against three.
export const ButtonIcon = (p: IconProps) => (
  <Glyph {...p}>
    <rect x="2" y="7" width="20" height="10" rx="3" />
    <path d="M8 12h8" />
  </Glyph>
)

const Polyline = ({ accent }: { accent?: boolean }) => (
  <>
    <path d="M3 18 9 7l5 8 7-9" stroke={accent ? ACCENT : undefined} />
    <circle cx="3" cy="18" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="21" cy="6" r="1.4" fill="currentColor" stroke="none" />
  </>
)

export const LineIcon = (p: IconProps) => (
  <Glyph {...p}>
    <Polyline />
  </Glyph>
)

// The line in the accent, its endpoints in ink.
export const LiveLineIcon = (p: IconProps) => (
  <Glyph {...p}>
    <Polyline accent />
  </Glyph>
)

// Lucide `square`.
export const BoxIcon = (p: IconProps) => (
  <Glyph {...p}>
    <rect width="18" height="18" x="3" y="3" rx="2" />
  </Glyph>
)

// Lucide `layers-2`, the top sheet - the panel being shown - in the accent.
export const SwitcherIcon = (p: IconProps) => (
  <Glyph {...p}>
    <path d="m16.02 12 5.48 3.13a1 1 0 0 1 0 1.74L13 21.74a2 2 0 0 1-2 0l-8.5-4.87a1 1 0 0 1 0-1.74L7.98 12" />
    <path
      d="M13 13.74a2 2 0 0 1-2 0L2.5 8.87a1 1 0 0 1 0-1.74L11 2.26a2 2 0 0 1 2 0l8.5 4.87a1 1 0 0 1 0 1.74Z"
      stroke={ACCENT}
    />
  </Glyph>
)

// Lucide `panel-top`: a panel is a switcher's one sheet.
export const PanelIcon = (p: IconProps) => (
  <Glyph {...p}>
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M3 9h18" />
  </Glyph>
)

export const OBJECT_ICONS: Record<ObjectType, (p: IconProps) => JSX.Element> = {
  text: TextIcon,
  "live-text": LiveTextIcon,
  icon: IconIcon,
  "live-icon": LiveIconIcon,
  bar: BarIcon,
  gauge: GaugeIcon,
  slider: SliderIcon,
  dial: DialIcon,
  switch: SwitchIcon,
  "button-group": ButtonGroupIcon,
  button: ButtonIcon,
  line: LineIcon,
  "live-line": LiveLineIcon,
  box: BoxIcon,
  switcher: SwitcherIcon,
  panel: PanelIcon,
}
