interface LevelIndicatorIconProps {
  className?: string
}

export function LevelIndicatorIcon({ className }: LevelIndicatorIconProps) {
  return (
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
      {/* Container rectangle */}
      <rect x="4" y="4" width="16" height="16" rx="2" />
      {/* Level indicator bars */}
      <rect x="6" y="16" width="2" height="2" fill="currentColor" />
      <rect x="9" y="14" width="2" height="4" fill="currentColor" />
      <rect x="12" y="12" width="2" height="6" fill="currentColor" />
      <rect x="15" y="10" width="2" height="8" fill="currentColor" />
    </svg>
  )
}
