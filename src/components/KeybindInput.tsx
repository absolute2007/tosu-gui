import { useEffect, useRef, useState } from 'react'
import { formatKeybind } from '../lib/keybind'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function KeybindInput({ value, onChange, placeholder, className = 'glass-input -wide' }: Props) {
  const [listening, setListening] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!listening) return

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()

      if (event.key === 'Escape') {
        setListening(false)
        return
      }

      const combo = formatKeybind(event)
      if (combo) {
        onChange(combo)
        setListening(false)
      }
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [listening, onChange])

  return (
    <input
      ref={inputRef}
      className={`${className}${listening ? ' -listening' : ''}`}
      value={listening ? 'Нажмите клавиши...' : value}
      placeholder={placeholder}
      title="Кликните и нажмите клавиши. Esc — ручной ввод"
      readOnly={listening}
      onFocus={() => setListening(true)}
      onBlur={() => setListening(false)}
      onChange={(e) => {
        if (!listening) onChange(e.target.value)
      }}
      onKeyDown={(e) => {
        if (listening) {
          e.preventDefault()
          return
        }
        if (e.key === 'Backspace' || e.key === 'Delete') {
          onChange('')
        }
      }}
    />
  )
}