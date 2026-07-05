import { useCallback, useEffect, useState } from 'react'
import { TitleBar } from './components/TitleBar'
import { Sidebar } from './components/Sidebar'
import { Toast } from './components/Toast'
import { StatusPage } from './pages/StatusPage'
import { CountersPage } from './pages/CountersPage'
import { OverlayPage } from './pages/OverlayPage'
import { SettingsPage } from './pages/SettingsPage'
import { useTosuSocket } from './hooks/useTosuSocket'
import { useCounterDownloads } from './hooks/useCounterDownloads'
import { useTosuSettings } from './hooks/useTosuSettings'
import { useTosuUpdate } from './hooks/useTosuUpdate'
import { UpdateBanner } from './components/UpdateBanner'
import type { TosuStatus } from '../electron/preload'
import './styles/app.css'

export type Page = 'status' | 'counters' | 'overlay' | 'settings'

interface ToastState {
  message: string
  type: 'success' | 'error'
}

export default function App() {
  const [page, setPage] = useState<Page>('status')
  const [tosuStatus, setTosuStatus] = useState<TosuStatus | null>(null)
  const [restarting, setRestarting] = useState(false)
  const [toast, setToast] = useState<ToastState | null>(null)

  const game = useTosuSocket(tosuStatus?.baseUrl ?? '')

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

  useEffect(() => {
    refreshStatus()
    const interval = setInterval(refreshStatus, 5000)
    return () => clearInterval(interval)
  }, [refreshStatus])

  const handleRestart = async () => {
    setRestarting(true)
    try {
      await window.tosuGui.restart()
      await refreshStatus()
      showToast('tosu перезапущен', 'success')
    } catch {
      showToast('Ошибка перезапуска', 'error')
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
          {tosuUpdate.visible && tosuUpdate.updateInfo?.updateAvailable && (
            <UpdateBanner
              info={tosuUpdate.updateInfo}
              installing={tosuUpdate.installing}
              progress={tosuUpdate.progress}
              onInstall={tosuUpdate.install}
              onDismiss={tosuUpdate.dismiss}
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
              restarting={restarting}
              onCheckUpdate={() => void tosuUpdate.checkForUpdate(true)}
              checkingUpdate={tosuUpdate.installing}
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
              checkTosuUpdates={tosuUpdate.checkEnabled}
              onCheckTosuUpdatesChange={tosuUpdate.setCheckTosuUpdates}
              onUpdate={tosuSettings.update}
              onSave={tosuSettings.save}
            />
          )}
          {page === 'settings' && !tosuSettings.settings && (
            <div className="page"><div className="empty-state">Загрузка...</div></div>
          )}
        </main>
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