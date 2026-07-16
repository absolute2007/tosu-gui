import { useCallback, useEffect, useState } from 'react'

export function useGuiSettings() {
  const [closeToTray, setCloseToTray] = useState(false)
  const [showBeatmapPanel, setShowBeatmapPanel] = useState(true)
  const [songsPath, setSongsPath] = useState('')
  const [songsPathResolved, setSongsPathResolved] = useState<string | null>(null)
  const [mapsOverlayKeybind, setMapsOverlayKeybind] = useState('Control + Shift + M')
  const [ready, setReady] = useState(false)

  const load = useCallback(async () => {
    try {
      const settings = await window.tosuGui.getGuiSettings()
      setCloseToTray(settings.closeToTray)
      setShowBeatmapPanel(settings.showBeatmapPanel !== false)
      setSongsPath(settings.songsPath || '')
      setMapsOverlayKeybind(settings.mapsOverlayKeybind || 'Control + Shift + M')
      const pathInfo = await window.tosuGui.getSongsPath()
      setSongsPathResolved(pathInfo.resolved)
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

  const setMapsOverlayKeybindSetting = useCallback(async (bind: string) => {
    setMapsOverlayKeybind(bind)
    await window.tosuGui.saveGuiSettings({ mapsOverlayKeybind: bind })
  }, [])

  const pickSongsPath = useCallback(async () => {
    const result = await window.tosuGui.pickSongsPath()
    if (result.cancelled) return null
    setSongsPath(result.configured)
    setSongsPathResolved(result.resolved)
    return result.resolved
  }, [])

  const clearSongsPath = useCallback(async () => {
    setSongsPath('')
    await window.tosuGui.saveGuiSettings({ songsPath: '' })
    const pathInfo = await window.tosuGui.getSongsPath()
    setSongsPathResolved(pathInfo.resolved)
  }, [])

  return {
    ready,
    closeToTray,
    showBeatmapPanel,
    songsPath,
    songsPathResolved,
    mapsOverlayKeybind,
    setCloseToTraySetting,
    setShowBeatmapPanelSetting,
    setMapsOverlayKeybindSetting,
    pickSongsPath,
    clearSongsPath,
  }
}
