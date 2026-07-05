import { useCallback, useEffect, useState } from 'react'
import { Download, ExternalLink, FolderOpen, Loader2, Settings, Trash2 } from 'lucide-react'
import type { TosuCounter } from '../../electron/tosu-api'
import { CounterPreview } from '../components/CounterPreview'
import { CounterSettingsModal } from '../components/CounterSettingsModal'
import { DownloadProgressBar } from '../components/DownloadProgressBar'
import { counterKey, type CounterDownloadState } from '../hooks/useCounterDownloads'
import { useTosuCounters } from '../hooks/useTosuCounters'
import type { TosuStatus } from '../../electron/preload'

interface Props {
  baseUrl: string
  tosuStatus: TosuStatus | null
  visible?: boolean
  downloads: Record<string, CounterDownloadState>
  onDownload: (counter: TosuCounter, onComplete?: () => void) => Promise<void>
  isDownloading: (key: string) => boolean
  onToast: (msg: string, type: 'success' | 'error') => void
}

export function CountersPage({ baseUrl, tosuStatus, visible = true, downloads, onDownload, isDownloading, onToast }: Props) {
  const previewSessionKey = `${tosuStatus?.pid ?? 'off'}-${visible ? 'on' : 'off'}`
  const previewLiveReady = Boolean(tosuStatus?.running && baseUrl)
  const [tab, setTab] = useState<'local' | 'available'>('local')
  const { counters: local, loading: localLoading, reload: reloadLocal } = useTosuCounters(tosuStatus)
  const [available, setAvailable] = useState<TosuCounter[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [settingsCounter, setSettingsCounter] = useState<string | null>(null)

  const loadAvailable = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const counters = await window.tosuGui.searchAvailable(q)
      setAvailable(counters)
    } catch {
      setAvailable([])
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshAfterDownload = useCallback(async () => {
    await reloadLocal()
    if (tab === 'available') await loadAvailable(search)
  }, [loadAvailable, reloadLocal, search, tab])

  useEffect(() => {
    if (tab === 'available') loadAvailable(search)
  }, [tab, search, loadAvailable])

  const handleDelete = async (name: string) => {
    try {
      await window.tosuGui.deleteCounter(name)
      onToast('Счётчик удалён', 'success')
      reloadLocal()
    } catch {
      onToast('Не удалось удалить', 'error')
    }
  }

  const handleDownload = async (counter: TosuCounter) => {
    await onDownload(counter, refreshAfterDownload)
  }

  const counters = tab === 'local' ? local : available
  const listLoading = tab === 'local' ? localLoading : loading

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Счётчики</h1>
        <p className="page-subtitle">PP-счётчики для оверлея и стрима</p>
      </div>

      <div className="tabs-inline">
        <button className={`tab-btn ${tab === 'local' ? '-active' : ''}`} onClick={() => setTab('local')}>
          Установленные ({local.length})
        </button>
        <button className={`tab-btn ${tab === 'available' ? '-active' : ''}`} onClick={() => setTab('available')}>
          Каталог
        </button>
      </div>

      {tab === 'available' && (
        <div className="search-bar">
          <input
            className="glass-input"
            placeholder="Поиск счётчиков..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {listLoading ? (
        <div className="empty-state">Загрузка...</div>
      ) : counters.length === 0 ? (
        <div className="empty-state">
          {tab === 'local' ? 'Нет установленных счётчиков' : 'Ничего не найдено'}
          <p>{tab === 'local' ? 'Перейдите в каталог, чтобы скачать' : 'Попробуйте другой запрос'}</p>
        </div>
      ) : (
        <div className="glass-card">
          <div className="counter-list">
            {counters.map((c) => {
              const key = counterKey(c)
              const downloadState = downloads[key]
              const active = isDownloading(key)

              return (
                <div key={`${c.name}-${c.author}`} className={`counter-item${downloadState ? ' -has-download' : ''}`}>
                  <CounterPreview
                    counter={c}
                    baseUrl={baseUrl}
                    preferLive={tab === 'local'}
                    sessionKey={previewSessionKey}
                    liveReady={previewLiveReady}
                  />
                  <div className="counter-info">
                    <div className="counter-name">{c.name}</div>
                    <div className="counter-meta">
                      {c.author} · v{c.version}
                      {c.resolution && ` · ${c.resolution[0]}×${c.resolution[1]}`}
                    </div>
                    {downloadState && <DownloadProgressBar state={downloadState} />}
                  </div>
                  <div className="counter-actions">
                    {tab === 'local' ? (
                      <>
                        {c.settings.length > 0 && (
                          <button className="btn btn-ghost btn-sm" onClick={() => setSettingsCounter(c.folderName)}>
                            <Settings size={13} />
                            Настройки
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => window.tosuGui.openCounterFolder(c.folderName)}>
                          <FolderOpen size={13} />
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.folderName)}>
                          <Trash2 size={13} />
                        </button>
                      </>
                    ) : (
                      <>
                        {c.authorlinks?.[0] && (
                          <button className="btn btn-ghost btn-sm" onClick={() => window.tosuGui.openExternal(c.authorlinks[0])}>
                            <ExternalLink size={13} />
                          </button>
                        )}
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => handleDownload(c)}
                          disabled={c._downloaded || active}
                        >
                          {active ? <Loader2 size={13} className="spin" /> : <Download size={13} />}
                          {active ? 'Загрузка...' : c._downloaded ? 'Установлен' : 'Скачать'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {settingsCounter && (
        <CounterSettingsModal
          name={settingsCounter}
          onClose={() => setSettingsCounter(null)}
          onSaved={() => { onToast('Настройки сохранены', 'success'); setSettingsCounter(null) }}
          onError={() => onToast('Ошибка сохранения', 'error')}
        />
      )}
    </div>
  )
}