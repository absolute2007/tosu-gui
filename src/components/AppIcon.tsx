import { useId } from 'react'

interface Props {
  size?: number
  className?: string
}

export function AppIcon({ size = 24, className }: Props) {
  const uid = useId().replace(/:/g, '')
  const bgId = `app-icon-bg-${uid}`
  const shineId = `app-icon-shine-${uid}`

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={bgId} x1="256" y1="64" x2="256" y2="448" gradientUnits="userSpaceOnUse">
          <stop stopColor="#5AC8FA" />
          <stop offset="1" stopColor="#0A84FF" />
        </linearGradient>
        <linearGradient id={shineId} x1="256" y1="96" x2="256" y2="280" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="116" fill={`url(#${bgId})`} />
      <rect x="72" y="72" width="368" height="200" rx="100" fill={`url(#${shineId})`} />
      <rect x="148" y="272" width="52" height="96" rx="14" fill="#fff" fillOpacity="0.55" />
      <rect x="214" y="220" width="52" height="148" rx="14" fill="#fff" fillOpacity="0.78" />
      <rect x="280" y="248" width="52" height="120" rx="14" fill="#fff" fillOpacity="0.65" />
      <rect x="346" y="196" width="52" height="172" rx="14" fill="#fff" fillOpacity="0.9" />
    </svg>
  )
}