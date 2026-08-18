import { diffIconSvg } from '../lib/osu-diff'

interface Props {
  mode?: string | number
  stars: number
  size?: number
  className?: string
  title?: string
}

export function DiffIcon({ mode = 'osu', stars, size = 18, className, title }: Props) {
  const label = title ?? `${(stars || 0).toFixed(2)}★`
  return (
    <span
      className={className}
      title={label}
      aria-label={label}
      dangerouslySetInnerHTML={{ __html: diffIconSvg(mode, stars, size) }}
    />
  )
}
