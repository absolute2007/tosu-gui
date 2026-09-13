import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppUpdateInfo, AppUpdateProgress } from '../../electron/app-updater'
import { useI18n } from '../i18n/context'

export function useAppUpdate(onToast: (msg: string, type: 'success' | 'error') => void) {
  const { lang } = useI18n()
  const [updateInfo, setUpdateInfo] = useState<AppUpdateInfo | null>(null)
  const [visible, setVisible] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [progress, setProgress] = useState<AppUpdateProgress | null>(null)
  const [checkEnabled, setCheckEnabled] = useState(true)
  const dismissedRef = useRef<string | null>(null)
  const checkingRef = useRef(false)

  const loadGuiSettings = useCallback(async () => {
    try {
      const settings = await window.tosuGui.getGuiSettings()
      setCheckEnabled(settings.checkAppUpdates)
      dismissedRef.current = settings.dismissedAppVersion
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
        const info = await window.tosuGui.checkAppUpdate()
        setUpdateInfo(info)

        if (info.unsupported) {
          if (notify) {
            onToast(
              lang === 'en'
                ? 'Auto-update is only available in the installed version'
                : (info.error || 'Автообновление доступно только в установленной версии'),
              'error'
            )
          }
          setVisible(false)
          return info
        }

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
          onToast(
            lang === 'en'
              ? `tosu GUI is up to date (v${info.currentVersion})`
              : `tosu GUI актуален (v${info.currentVersion})`,
            'success'
          )
        }
        return info
      } catch (err) {
        if (notify) {
          const msg = err instanceof Error ? err.message : (lang === 'en' ? 'Update check failed' : 'Ошибка проверки обновлений')
          onToast(msg, 'error')
        }
        return null
      } finally {
        checkingRef.current = false
      }
    },
    [checkEnabled, lang, onToast]
  )

  const dismiss = useCallback(async () => {
    if (!updateInfo?.latestVersion) {
      setVisible(false)
      return
    }
    dismissedRef.current = updateInfo.latestVersion
    setVisible(false)
    await window.tosuGui.dismissAppUpdate(updateInfo.latestVersion)
  }, [updateInfo])

  const install = useCallback(async () => {
    if (installing) return

    setInstalling(true)
    setProgress({
      phase: 'downloading',
      progress: 0,
      message: lang === 'en' ? 'Preparing…' : 'Подготовка…',
    })

    try {
      await window.tosuGui.installAppUpdate()
      // App usually quits here; if not, show a note
      onToast(
        lang === 'en'
          ? 'Installer launched — confirm update'
          : 'Установщик запущен — подтвердите обновление',
        'success'
      )
      setVisible(false)
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err ?? (lang === 'en' ? 'Update failed' : 'Ошибка обновления'))
      const msg = raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '')
      onToast(msg || (lang === 'en' ? 'Update failed' : 'Ошибка обновления'), 'error')
    } finally {
      setInstalling(false)
      setProgress(null)
    }
  }, [installing, lang, onToast])

  const setCheckAppUpdates = useCallback(
    async (enabled: boolean) => {
      setCheckEnabled(enabled)
      const settings = await window.tosuGui.saveGuiSettings({ checkAppUpdates: enabled })
      dismissedRef.current = settings.dismissedAppVersion
      if (enabled) void checkForUpdate(true)
    },
    [checkForUpdate]
  )

  useEffect(() => {
    void loadGuiSettings()
  }, [loadGuiSettings])

  useEffect(() => {
    if (!checkEnabled) return

    const timer = setTimeout(() => {
      void checkForUpdate()
    }, 5000)

    const interval = setInterval(() => {
      void checkForUpdate()
    }, 6 * 60 * 60 * 1000)

    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [checkEnabled, checkForUpdate])

  useEffect(() => {
    const unsubscribe = window.tosuGui.onAppUpdateProgress((next) => {
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
    setCheckAppUpdates,
  }
}
