interface Props {
  size?: number
  className?: string
}

export function AppIcon({ size = 24, className }: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <circle cx="256" cy="256" r="256" fill="#FF66AA" />
      <circle cx="256" cy="256" r="208" fill="none" stroke="#fff" strokeWidth="40" />
      <circle cx="256" cy="256" r="98" fill="#fff" />
    </svg>
  )
}
