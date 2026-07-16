import { useCallback, useEffect, useState } from 'react'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { BeatmapPanel } from './components/BeatmapPanel'
import { Toast } from './components/Toast'
import { StatusPage } from './pages/StatusPage'
import { CountersPage } from './pages/CountersPage'
import { MapsPage } from './pages/MapsPage'
import { OverlayPage } from './pages/OverlayPage'
import { SettingsPage } from './pages/SettingsPage'
import { useTosuSocket } from './hooks/useTosuSocket'
import { useCounterDownloads } from './hooks/useCounterDownloads'
import { useTosuSettings } from './hooks/useTosuSettings'
import { useTosuUpdate } from './hooks/useTosuUpdate'
import { useAppUpdate } from './hooks/useAppUpdate'
import { useGuiSettings } from './hooks/useGuiSettings'
import { UpdateBanner } from './components/UpdateBanner'
import type { TosuStatus } from '../electron/preload'
import './styles/app.css'

export type Page = 'status' | 'counters' | 'maps' | 'overlay' | 'settings'

interface ToastState {
  message: string
  type: 'success' | 'error'
}

export default function App() {
  const [page, setPage] = useState<Page>('status')
  const [tosuStatus, setTosuStatus] = useState<TosuStatus | null>(null)
  const [restarting, setRestarting] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type })
  }, [])

  const refreshStatus = useCallback(async () => {
    try {
      const status = await window.tosuGui.getStatus()
      setTosuStatus(status)
    } catch { /* */ }
  }, [])

  const tosuSettings = useTosuSettings(tosuStatus, showToast)
  const counterDownloads = useCounterDownloads(showToast)
  const tosuUpdate = useTosuUpdate(showToast, refreshStatus)
  const appUpdate = useAppUpdate(showToast)
  const guiSettings = useGuiSettings()

  // Panel data (cover URL, leaderboard PB) is only parsed when the panel is enabled
  const game = useTosuSocket(tosuStatus?.baseUrl ?? '', {
    beatmapPanelEnabled: guiSettings.showBeatmapPanel,
  })

  useEffect(() => {
    refreshStatus()

    let interval: ReturnType<typeof setInterval> | null = null

    const startPolling = () => {
      if (interval) return
      interval = setInterval(refreshStatus, 5000)
    }

    const stopPolling = () => {
      if (!interval) return
      clearInterval(interval)
      interval = null
    }

    const onVisibility = () => {
      if (document.hidden) stopPolling()
      else {
        void refreshStatus()
        startPolling()
      }
    }

    startPolling()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [refreshStatus])

  const handleCheckUpdates = async () => {
    const [appInfo, tosuInfo] = await Promise.all([
      appUpdate.checkForUpdate(true, { notify: false }),
      tosuUpdate.checkForUpdate(true, { notify: false }),
    ])

    const appAvail = Boolean(appInfo?.updateAvailable)
    const tosuAvail = Boolean(tosuInfo?.updateAvailable)
    const appErr = appInfo?.error && !appInfo.unsupported ? appInfo.error : null
    const tosuErr = tosuInfo?.error || null

    if (appAvail || tosuAvail) {
      const parts: string[] = []
      if (appAvail) parts.push(`tosu GUI v${appInfo?.latestVersion}`)
      if (tosuAvail) parts.push(`tosu v${tosuInfo?.latestVersion}`)
      showToast(`Доступно: ${parts.join(' и ')}`, 'success')
      return
    }

    if (appInfo?.unsupported && tosuErr) {
      showToast(tosuErr, 'error')
      return
    }
    if (appErr && tosuErr) {
      showToast(`${appErr}; ${tosuErr}`, 'error')
      return
    }
    if (appErr) {
      showToast(appErr, 'error')
      return
    }
    if (tosuErr) {
      showToast(tosuErr, 'error')
      return
    }
    if (appInfo?.unsupported) {
      // Dev build — still report tosu status if we have it
      if (tosuInfo && !tosuInfo.updateAvailable) {
        showToast(`tosu актуален (v${tosuInfo.currentVersion})`, 'success')
      } else {
        showToast(appInfo.error || 'Автообновление GUI только в установленной версии', 'error')
      }
      return
    }

    showToast(
      `Всё актуально (GUI v${appInfo?.currentVersion ?? '—'}, tosu v${tosuInfo?.currentVersion ?? '—'})`,
      'success'
    )
  }

  const handleRestart = async () => {
    if (tosuUpdate.installing || appUpdate.installing) {
      showToast('Дождитесь окончания обновления', 'error')
      return
    }
    setRestarting(true)
    try {
      await window.tosuGui.restart()
      await refreshStatus()
      showToast('tosu перезапущен', 'success')
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err ?? 'Ошибка перезапуска')
      // Electron wraps invoke errors: "Error invoking remote method 'x': Error: actual"
      const msg = raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '')
      showToast(msg || 'Ошибка перезапуска', 'error')
    } finally {
      setRestarting(false)
    }
  }

  return (
    <div className="app-shell">
      <TitleBar />
      <div className="app-body">
        <Sidebar
          active={page}
          onChange={setPage}
          osuConnected={game.connected}
        />
        <main className="app-content">
          {appUpdate.visible && appUpdate.updateInfo?.updateAvailable && (
            <UpdateBanner
              title="Доступно обновление tosu GUI"
              fromVersion={appUpdate.updateInfo.currentVersion}
              toVersion={appUpdate.updateInfo.latestVersion}
              installing={appUpdate.installing}
              progress={appUpdate.progress}
              releaseUrl={appUpdate.updateInfo.releaseUrl}
              installLabel="Обновить GUI"
              onInstall={() => void appUpdate.install()}
              onDismiss={() => void appUpdate.dismiss()}
              onOpenRelease={() => {
                if (appUpdate.updateInfo?.releaseUrl) {
                  void window.tosuGui.openExternal(appUpdate.updateInfo.releaseUrl)
                }
              }}
            />
          )}
          {tosuUpdate.visible && tosuUpdate.updateInfo?.updateAvailable && (
            <UpdateBanner
              title="Доступно обновление tosu"
              fromVersion={tosuUpdate.updateInfo.currentVersion}
              toVersion={tosuUpdate.updateInfo.latestVersion}
              installing={tosuUpdate.installing}
              progress={tosuUpdate.progress}
              releaseUrl={tosuUpdate.updateInfo.releaseUrl}
              installLabel="Обновить tosu"
              onInstall={() => void tosuUpdate.install()}
              onDismiss={() => void tosuUpdate.dismiss()}
              onOpenRelease={() => {
                if (tosuUpdate.updateInfo?.releaseUrl) {
                  void window.tosuGui.openExternal(tosuUpdate.updateInfo.releaseUrl)
                }
              }}
            />
          )}
          {page === 'status' && (
            <StatusPage
              game={game}
              tosuStatus={tosuStatus}
              onRestart={handleRestart}
              restarting={restarting || tosuUpdate.installing || appUpdate.installing}
              onCheckUpdate={() => void handleCheckUpdates()}
              checkingUpdate={tosuUpdate.installing || appUpdate.installing}
            />
          )}
          <div className="page-slot" hidden={page !== 'counters'}>
            <CountersPage
              baseUrl={tosuStatus?.baseUrl ?? ''}
              tosuStatus={tosuStatus}
              visible={page === 'counters'}
              downloads={counterDownloads.downloads}
              onDownload={counterDownloads.download}
              isDownloading={counterDownloads.isDownloading}
              onToast={showToast}
            />
          </div>
          <div className="page-slot" hidden={page !== 'maps'}>
            <MapsPage
              visible={page === 'maps'}
              onToast={showToast}
              onOpenSettings={() => setPage('settings')}
            />
          </div>
          {page === 'overlay' && tosuSettings.settings && (
            <OverlayPage
              baseUrl={tosuStatus?.baseUrl ?? ''}
              tosuStatus={tosuStatus}
              settings={tosuSettings.settings}
              dirty={tosuSettings.dirty}
              saving={tosuSettings.saving}
              onUpdate={tosuSettings.update}
              onSave={tosuSettings.save}
              onSaveSnapshot={tosuSettings.saveSnapshot}
              onToast={showToast}
            />
          )}
          {page === 'overlay' && !tosuSettings.settings && (
            <div className="page"><div className="empty-state">Загрузка...</div></div>
          )}
          {page === 'settings' && tosuSettings.settings && (
            <SettingsPage
              settings={tosuSettings.settings}
              dirty={tosuSettings.dirty}
              saving={tosuSettings.saving}
              checkAppUpdates={appUpdate.checkEnabled}
              checkTosuUpdates={tosuUpdate.checkEnabled}
              closeToTray={guiSettings.closeToTray}
              showBeatmapPanel={guiSettings.showBeatmapPanel}
              songsPath={guiSettings.songsPath}
              songsPathResolved={guiSettings.songsPathResolved}
              mapsOverlayKeybind={guiSettings.mapsOverlayKeybind}
              onCheckAppUpdatesChange={appUpdate.setCheckAppUpdates}
              onCheckTosuUpdatesChange={tosuUpdate.setCheckTosuUpdates}
              onCloseToTrayChange={guiSettings.setCloseToTraySetting}
              onShowBeatmapPanelChange={guiSettings.setShowBeatmapPanelSetting}
              onMapsOverlayKeybindChange={guiSettings.setMapsOverlayKeybindSetting}
              onPickSongsPath={guiSettings.pickSongsPath}
              onClearSongsPath={guiSettings.clearSongsPath}
              onUpdate={tosuSettings.update}
              onSave={tosuSettings.save}
            />
          )}
          {page === 'settings' && !tosuSettings.settings && (
            <div className="page"><div className="empty-state">Загрузка...</div></div>
          )}
        </main>
        {guiSettings.showBeatmapPanel && <BeatmapPanel game={game} />}
      </div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}