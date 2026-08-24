import { useCallback, useEffect, useRef, useState } from 'react'
import type { TosuUpdateInfo, UpdateProgress } from '../../electron/tosu-updater'

export function useTosuUpdate(
  onToast: (msg: string, type: 'success' | 'error') => void,
  onInstalled?: () => void
) {
  const [updateInfo, setUpdateInfo] = useState<TosuUpdateInfo | null>(null)
  const [visible, setVisible] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState<UpdateProgress | null>(null)
  const [checkEnabled, setCheckEnabled] = useState(true)
  const dismissedRef = useRef<string | null>(null)
  const checkingRef = useRef(false)

  const loadGuiSettings = useCallback(async () => {
    try {
      const settings = await window.tosuGui.getGuiSettings()
      setCheckEnabled(settings.checkTosuUpdates)
      dismissedRef.current = settings.dismissedTosuVersion
    } catch {
      /* ignore */
    }
  }, [])

  const checkForUpdate = useCallback(
    async (force = false, opts?: { notify?: boolean }) => {
      if (checkingRef.current) return null
      if (!force && !checkEnabled) return null

      const notify = opts?.notify ?? force
      checkingRef.current = true
      try {
        const info = await window.tosuGui.checkTosuUpdate()
        setUpdateInfo(info)

        if (info.error && notify) {
          onToast(info.error, 'error')
        }

        const dismissed = dismissedRef.current
        const shouldShow = Boolean(
          info.updateAvailable &&
            info.latestVersion &&
            (force || dismissed !== info.latestVersion)
        )

        setVisible(shouldShow)

        if (notify && !info.updateAvailable && !info.error) {
          onToast(`tosu актуален (v${info.currentVersion})`, 'success')
        }
        return info
      } catch (err) {
        if (notify) {
          const msg = err instanceof Error ? err.message : 'Ошибка проверки обновлений'
          onToast(msg, 'error')
        }
        return null
      } finally {
        checkingRef.current = false
      }
    },
    [checkEnabled, onToast]
  )

  const dismiss = useCallback(async () => {
    if (!updateInfo?.latestVersion) {
      setVisible(false)
      return
    }

    dismissedRef.current = updateInfo.latestVersion
    setVisible(false)
    await window.tosuGui.dismissTosuUpdate(updateInfo.latestVersion)
  }, [updateInfo])

  const install = useCallback(async () => {
    if (installing) return

    setInstalling(true)
    setProgress({ phase: 'downloading', progress: 0, message: 'Подготовка…' })

    try {
      const result = await window.tosuGui.installTosuUpdate()
      setVisible(false)
      setUpdateInfo((prev) =>
        prev
          ? {
              ...prev,
              currentVersion: result.version,
              updateAvailable: false,
            }
          : prev
      )
      if (result.restartFailed) {
        onToast(
          `tosu обновлён до v${result.version}, но не запустился — нажмите «Перезапустить tosu»`,
          'error'
        )
      } else {
        onToast(`tosu успешно обновлён до v${result.version}`, 'success')
      }
      await onInstalled?.()
      void checkForUpdate(true, { notify: false })
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err ?? 'Ошибка обновления')
      const msg = raw
        .replace(/^Error invoking remote method '[^']+':\s*/i, '')
        .replace(/^Error:\s*/i, '')
        .replace(/^Error:\s*/i, '')
        .trim()
      onToast(msg || 'Ошибка обновления', 'error')
      void checkForUpdate(true, { notify: false })
    } finally {
      setInstalling(false)
      setProgress(null)
    }
  }, [checkForUpdate, installing, onInstalled, onToast])

  const setCheckTosuUpdates = useCallback(async (enabled: boolean) => {
    setCheckEnabled(enabled)
    const settings = await window.tosuGui.saveGuiSettings({ checkTosuUpdates: enabled })
    dismissedRef.current = settings.dismissedTosuVersion
    if (enabled) void checkForUpdate(true)
  }, [checkForUpdate])

  useEffect(() => {
    void loadGuiSettings()
  }, [loadGuiSettings])

  useEffect(() => {
    if (!checkEnabled) return

    const timer = setTimeout(() => {
      void checkForUpdate()
    }, 4000)

    const interval = setInterval(() => {
      void checkForUpdate()
    }, 6 * 60 * 60 * 1000)

    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [checkEnabled, checkForUpdate])

  useEffect(() => {
    const unsubscribe = window.tosuGui.onUpdateProgress((next) => {
      setProgress(next)
    })
    return () => {
      unsubscribe()
    }
  }, [])

  return {
    updateInfo,
    visible,
    installing,
    progress,
    checkEnabled,
    checkForUpdate,
    dismiss,
    install,
    setCheckTosuUpdates,
  }
}