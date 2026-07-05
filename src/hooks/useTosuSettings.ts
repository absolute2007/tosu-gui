import { useCallback, useEffect, useState } from 'react'
import type { TosuAppSettings } from '../../electron/tosu-api'
import type { TosuStatus } from '../../electron/preload'
import { settingsToPayload } from '../lib/settings-payload'

export function useTosuSettings(
  tosuStatus: TosuStatus | null,
  onToast: (msg: string, type: 'success' | 'error') => void
) {
  const [settings, setSettings] = useState<TosuAppSettings | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const s = await window.tosuGui.getSettings()
      setSettings(s)
      setDirty(false)
    } catch {
      /* tosu ещё не готов */
    }
  }, [])

  useEffect(() => {
    if (!tosuStatus?.running) return
    void load()
  }, [tosuStatus?.running, load])

  const update = useCallback(<K extends keyof TosuAppSettings>(key: K, value: TosuAppSettings[K]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
    setDirty(true)
  }, [])

  const saveSnapshot = useCallback(
    async (snapshot: TosuAppSettings, successMessage = 'Настройки сохранены. Перезапуск tosu...') => {
      setSaving(true)
      try {
        await window.tosuGui.saveSettings(settingsToPayload(snapshot))
        onToast(successMessage, 'success')
        setDirty(false)
        await window.tosuGui.restart()
        await load()
        return true
      } catch {
        onToast('Ошибка сохранения', 'error')
        return false
      } finally {
        setSaving(false)
      }
    },
    [load, onToast]
  )

  const save = useCallback(async () => {
    if (!settings) return
    await saveSnapshot(settings)
  }, [settings, saveSnapshot])

  return { settings, dirty, saving, update, save, saveSnapshot, reload: load }
}