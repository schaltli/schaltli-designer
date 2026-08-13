export const SwitchIcon = ({ className }: { className?: string }) => (
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
    <rect x="2" y="7" width="20" height="10" rx="2" />
    <line x1="9.33" y1="7" x2="9.33" y2="17" />
    <line x1="14.67" y1="7" x2="14.67" y2="17" />
    <circle cx="14.67" cy="12" r="1.6" fill="currentColor" stroke="none" />
  </svg>
)
