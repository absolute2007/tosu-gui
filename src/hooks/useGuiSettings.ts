import { useCallback, useEffect, useState } from 'react'

export function useGuiSettings() {
  const [closeToTray, setCloseToTray] = useState(false)

  const load = useCallback(async () => {
    try {
      const settings = await window.tosuGui.getGuiSettings()
      setCloseToTray(settings.closeToTray)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const setCloseToTraySetting = useCallback(async (enabled: boolean) => {
    setCloseToTray(enabled)
    await window.tosuGui.saveGuiSettings({ closeToTray: enabled })
  }, [])

  return { closeToTray, setCloseToTraySetting }
}