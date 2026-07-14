import { useCallback, useEffect, useState } from 'react'

export function useGuiSettings() {
  const [closeToTray, setCloseToTray] = useState(false)
  const [showBeatmapPanel, setShowBeatmapPanel] = useState(true)
  const [ready, setReady] = useState(false)

  const load = useCallback(async () => {
    try {
      const settings = await window.tosuGui.getGuiSettings()
      setCloseToTray(settings.closeToTray)
      setShowBeatmapPanel(settings.showBeatmapPanel !== false)
    } catch {
      /* ignore */
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const setCloseToTraySetting = useCallback(async (enabled: boolean) => {
    setCloseToTray(enabled)
    await window.tosuGui.saveGuiSettings({ closeToTray: enabled })
  }, [])

  const setShowBeatmapPanelSetting = useCallback(async (enabled: boolean) => {
    setShowBeatmapPanel(enabled)
    await window.tosuGui.saveGuiSettings({ showBeatmapPanel: enabled })
  }, [])

  return {
    ready,
    closeToTray,
    showBeatmapPanel,
    setCloseToTraySetting,
    setShowBeatmapPanelSetting,
  }
}
