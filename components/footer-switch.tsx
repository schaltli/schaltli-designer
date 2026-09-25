"use client"

/**
 * A small on/off switch for the editor's footer, in the shape of Material 3's
 * switch: a pill track, a round handle that grows and moves to the end when
 * on, the track filled in the designer's accent then. The footer is 32px
 * high, so this is M3's switch scaled down, not a new look.
 *
 * A real button with role="switch" inside a <label>, so the text names it for
 * a screen reader and for getByLabel, and a click on the text toggles it.
 */
export function FooterSwitch({
  label,
  checked,
  onChange,
  disabled = false,
  title,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  title?: string
}) {
  return (
    <label
      className={`flex items-center gap-1.5 text-xs text-muted-foreground select-none ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      title={title}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-[18px] w-[30px] flex-shrink-0 items-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed ${
          checked ? "border-[var(--sb-accent)] bg-[var(--sb-accent)]" : "border-muted-foreground/60 bg-muted"
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute rounded-full transition-all ${
            checked ? "left-[13px] h-[12px] w-[12px] bg-white" : "left-[3px] h-[8px] w-[8px] bg-muted-foreground/70"
          }`}
        />
      </button>
      {label}
    </label>
  )
}
