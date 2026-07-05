import { useEffect, useState } from 'react'

interface Props {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  fallback?: number
  className?: string
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  fallback,
  className = 'glass-input -narrow',
}: Props) {
  const [text, setText] = useState(String(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(String(value))
  }, [value, focused])

  const commit = (raw: string) => {
    const parsed = parseInt(raw, 10)
    const base = Number.isFinite(parsed) ? parsed : (fallback ?? value)
    let next = base
    if (min !== undefined) next = Math.max(min, next)
    if (max !== undefined) next = Math.min(max, next)
    setText(String(next))
    onChange(next)
  }

  return (
    <input
      className={className}
      type="text"
      inputMode="numeric"
      value={focused ? text : String(value)}
      onFocus={() => {
        setFocused(true)
        setText(String(value))
      }}
      onChange={(e) => {
        const next = e.target.value
        if (next === '' || /^\d+$/.test(next)) {
          setText(next)
          if (next !== '') onChange(parseInt(next, 10))
        }
      }}
      onBlur={() => {
        setFocused(false)
        commit(text)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        }
      }}
    />
  )
}