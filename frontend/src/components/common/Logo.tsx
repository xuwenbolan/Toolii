interface LogoProps {
  showText?: boolean
  className?: string
  size?: number
}

export function Logo({ showText = true, className, size = 24 }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ''}`}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect width="32" height="32" rx="8" fill="#4F46E5" />
        <rect x="6" y="7" width="20" height="5" rx="2.5" fill="white" />
        <rect x="13.5" y="7" width="5" height="18" rx="2.5" fill="white" />
      </svg>
      {showText && (
        <span className="font-semibold tracking-tight">Toolii</span>
      )}
    </span>
  )
}
