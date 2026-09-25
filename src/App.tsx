import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { BeatmapPanel } from './components/BeatmapPanel'
import { Toast } from './components/Toast'
import { StatusPage } from './pages/StatusPage'
import { CountersPage } from './pages/CountersPage'
import { OverlayPage } from './pages/OverlayPage'
import { SettingsPage } from './pages/SettingsPage'
import { useTosuSocket } from './hooks/useTosuSocket'
import { useCounterDownloads } from './hooks/useCounterDownloads'
import { useTosuSettings } from './hooks/useTosuSettings'
import { useAppUpdate } from './hooks/useAppUpdate'
import { useGuiSettings } from './hooks/useGuiSettings'
import { useOsuAuth } from './hooks/useOsuAuth'
import { UpdateBanner } from './components/UpdateBanner'
import { useI18n } from './i18n/context'
import type { TosuStatus } from '../electron/preload'
import './styles/app.css'

const MapsPage = lazy(() => import('./pages/MapsPage').then((m) => ({ default: m.MapsPage })))
const SkinsPage = lazy(() => import('./pages/SkinsPage').then((m) => ({ default: m.SkinsPage })))
const SkinCustomizerPage = lazy(() =>
  import('./pages/SkinCustomizerPage').then((m) => ({ default: m.SkinCustomizerPage }))
)

function PageFallback() {
  return (
    <div className="page">
      <div className="empty-state">
        <Loader2 size={22} className="spin" />
      </div>
    </div>
  )
}

export type Page = 'status' | 'counters' | 'maps' | 'skins' | 'skin-customizer' | 'overlay' | 'settings'


interface ToastState {
  message: string
  type: 'success' | 'error'
}

export default function App() {
  const { lang } = useI18n()
  const [page, setPage] = useState<Page>('status')
  const [visitedPages, setVisitedPages] = useState<Set<Page>>(() => new Set(['status']))
  const [tosuStatus, setTosuStatus] = useState<TosuStatus | null>(null)
  const [restarting, setRestarting] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)

  useEffect(() => {
    setVisitedPages((prev) => {
      if (prev.has(page)) return prev
      const next = new Set(prev)
      next.add(page)
      return next
    })
  }, [page])

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type })
  }, [])

  const handleCloseToast = useCallback(() => {
    setToast(null)
  }, [])

  const refreshStatus = useCallback(async () => {
    try {
      const status = await window.tosuGui.getStatus()
      setTosuStatus(status)
    } catch { /* */ }
  }, [])

  const tosuSettings = useTosuSettings(tosuStatus, showToast)
  const counterDownloads = useCounterDownloads(showToast)
  const appUpdate = useAppUpdate(showToast)
  const guiSettings = useGuiSettings()
  const osuAuth = useOsuAuth(showToast)

  useEffect(() => {
    if (!guiSettings.skinsBrowserEnabled && (page === 'skins' || page === 'skin-customizer')) {
      setPage('status')
    }
  }, [guiSettings.skinsBrowserEnabled, page])


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
    const appInfo = await appUpdate.checkForUpdate(true, { notify: false })

    if (appInfo?.updateAvailable) {
      showToast(
        lang === 'en'
          ? `Update available: tosu GUI v${appInfo.latestVersion}`
          : `Доступно обновление tosu GUI v${appInfo.latestVersion}`,
        'success'
      )
      return
    }

    if (appInfo?.unsupported) {
      showToast(
        lang === 'en'
          ? 'Auto-update is only available in the installed version'
          : (appInfo.error || 'Автообновление доступно только в установленной версии'),
        'error'
      )
      return
    }

    if (appInfo?.error) {
      showToast(appInfo.error, 'error')
      return
    }

    showToast(
      lang === 'en'
        ? `tosu GUI is up to date (v${appInfo?.currentVersion ?? '—'})`
        : `tosu GUI актуален (v${appInfo?.currentVersion ?? '—'})`,
      'success'
    )
  }

  const handleRestart = async () => {
    if (appUpdate.installing) {
      showToast(
        lang === 'en' ? 'Please wait for update to finish' : 'Дождитесь окончания обновления',
        'error'
      )
      return
    }
    setRestarting(true)
    try {
      await window.tosuGui.restart()
      await refreshStatus()
      showToast(lang === 'en' ? 'tosu restarted' : 'tosu перезапущен', 'success')
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err ?? (lang === 'en' ? 'Restart error' : 'Ошибка перезапуска'))
      // Electron wraps invoke errors: "Error invoking remote method 'x': Error: actual"
      const msg = raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '')
      showToast(msg || (lang === 'en' ? 'Restart error' : 'Ошибка перезапуска'), 'error')
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
          showSkins={guiSettings.skinsBrowserEnabled}
          account={osuAuth.account}
          authBusy={osuAuth.authBusy}
          onLogin={osuAuth.login}
          onLogout={osuAuth.logout}
        />
        <main className="app-content">
          {appUpdate.visible && appUpdate.updateInfo?.updateAvailable && (
            <UpdateBanner
              title={lang === 'en' ? 'tosu GUI update available' : 'Доступно обновление tosu GUI'}
              fromVersion={appUpdate.updateInfo.currentVersion}
              toVersion={appUpdate.updateInfo.latestVersion}
              installing={appUpdate.installing}
              progress={appUpdate.progress}
              releaseUrl={appUpdate.updateInfo.releaseUrl}
              installLabel={lang === 'en' ? 'Update GUI' : 'Обновить GUI'}
              onInstall={() => void appUpdate.install()}
              onDismiss={() => void appUpdate.dismiss()}
              onOpenRelease={() => {
                if (appUpdate.updateInfo?.releaseUrl) {
                  void window.tosuGui.openExternal(appUpdate.updateInfo.releaseUrl)
                }
              }}
            />
          )}
          {page === 'status' && (
            <StatusPage
              game={game}
              tosuStatus={tosuStatus}
              onRestart={handleRestart}
              restarting={restarting || appUpdate.installing}
              onCheckUpdate={() => void handleCheckUpdates()}
              checkingUpdate={appUpdate.installing}
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
          {visitedPages.has('maps') && (
            <div className="page-slot" hidden={page !== 'maps'}>
              <Suspense fallback={<PageFallback />}>
                <MapsPage
                  visible={page === 'maps'}
                  onToast={showToast}
                  onOpenSettings={() => setPage('settings')}
                  account={osuAuth.account}
                />
              </Suspense>
            </div>
          )}
          {guiSettings.skinsBrowserEnabled && visitedPages.has('skins') && (
            <div className="page-slot" hidden={page !== 'skins'}>
              <Suspense fallback={<PageFallback />}>
                <SkinsPage
                  visible={page === 'skins'}
                  onToast={showToast}
                  onOpenSettings={() => setPage('settings')}
                />
              </Suspense>
            </div>
          )}
          {guiSettings.skinsBrowserEnabled && visitedPages.has('skin-customizer') && (
            <div className="page-slot" hidden={page !== 'skin-customizer'}>
              <Suspense fallback={<PageFallback />}>
                <SkinCustomizerPage
                  visible={page === 'skin-customizer'}
                  onToast={showToast}
                  onOpenSettings={() => setPage('settings')}
                />
              </Suspense>
            </div>
          )}

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
            <div className="page">
              <div className="empty-state">
                <Loader2 size={20} className="spin" />
                <span>{lang === 'en' ? 'Loading overlay…' : 'Загрузка оверлея…'}</span>
              </div>
            </div>
          )}
          {page === 'settings' && tosuSettings.settings && (
            <SettingsPage
              settings={tosuSettings.settings}
              dirty={tosuSettings.dirty}
              saving={tosuSettings.saving}
              checkAppUpdates={appUpdate.checkEnabled}
              closeToTray={guiSettings.closeToTray}
              showBeatmapPanel={guiSettings.showBeatmapPanel}
              songsPath={guiSettings.songsPath}
              songsPathResolved={guiSettings.songsPathResolved}
              skinsPath={guiSettings.skinsPath}
              skinsPathResolved={guiSettings.skinsPathResolved}
              skinsBrowserEnabled={guiSettings.skinsBrowserEnabled}
              mapsOverlayKeybind={guiSettings.mapsOverlayKeybind}
              disableHardwareAcceleration={guiSettings.disableHardwareAcceleration}
              onCheckAppUpdatesChange={appUpdate.setCheckAppUpdates}
              onCloseToTrayChange={guiSettings.setCloseToTraySetting}
              onShowBeatmapPanelChange={guiSettings.setShowBeatmapPanelSetting}
              onMapsOverlayKeybindChange={guiSettings.setMapsOverlayKeybindSetting}
              onDisableHardwareAccelerationChange={guiSettings.setDisableHardwareAccelerationSetting}
              onPickSongsPath={guiSettings.pickSongsPath}
              onClearSongsPath={guiSettings.clearSongsPath}
              onPickSkinsPath={guiSettings.pickSkinsPath}
              onClearSkinsPath={guiSettings.clearSkinsPath}
              onSkinsBrowserEnabledChange={guiSettings.setSkinsBrowserEnabledSetting}
              onUpdate={tosuSettings.update}
              onSave={tosuSettings.save}
            />
          )}
          {page === 'settings' && !tosuSettings.settings && (
            <div className="page">
              <div className="empty-state">
                <Loader2 size={20} className="spin" />
                <span>Загрузка настроек…</span>
              </div>
            </div>
          )}
        </main>
        {guiSettings.showBeatmapPanel && <BeatmapPanel game={game} />}
      </div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={handleCloseToast}
        />
      )}
    </div>
  )
}