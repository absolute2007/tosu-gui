const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta'])

const KEY_LABELS: Record<string, string> = {
  ' ': 'Space',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Escape: 'Escape',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
}

function formatKeyLabel(key: string): string {
  if (KEY_LABELS[key]) return KEY_LABELS[key]
  if (key.length === 1) return key.toUpperCase()
  if (/^f\d+$/i.test(key)) return key.toUpperCase()
  return key
}

export function formatKeybind(event: KeyboardEvent): string | null {
  const parts: string[] = []
  if (event.ctrlKey) parts.push('Control')
  if (event.shiftKey) parts.push('Shift')
  if (event.altKey) parts.push('Alt')
  if (event.metaKey) parts.push('Meta')

  const key = event.key
  const isModifier = MODIFIER_KEYS.has(key) || key === 'OS' || key === 'AltGraph'

  if (!isModifier) {
    parts.push(formatKeyLabel(key))
  }

  if (parts.length === 0) return null
  if (isModifier && parts.length === parts.filter((p) => MODIFIER_KEYS.has(p) || p === 'Meta').length) {
    return null
  }

  return parts.join(' + ')
}