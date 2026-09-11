import { useCallback, useEffect, useState } from 'react'
import { Download, ExternalLink, FolderOpen, Layers, Loader2, Settings, Trash2 } from 'lucide-react'
import type { TosuCounter } from '../../electron/tosu-api'
import { CounterPreview } from '../components/CounterPreview'
import { CounterSettingsModal } from '../components/CounterSettingsModal'
import { DownloadProgressBar } from '../components/DownloadProgressBar'
import { counterKey, type CounterDownloadState } from '../hooks/useCounterDownloads'
import { useTosuCounters } from '../hooks/useTosuCounters'
import { useI18n } from '../i18n/context'
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
  const { t, lang } = useI18n()
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

  const isProtectedCounter = (folderName: string) => {
    const n = folderName.toLowerCase()
    return n.includes('maps browser') && n.includes('tosu-gui')
  }

  const handleDelete = async (name: string) => {
    if (isProtectedCounter(name)) {
      onToast(
        lang === 'en'
          ? 'Maps Browser cannot be deleted — only disabled via in-game overlay'
          : 'Maps Browser нельзя удалить — только выключить in-game overlay',
        'error'
      )
      return
    }
    try {
      await window.tosuGui.deleteCounter(name)
      await reloadLocal()
      onToast(lang === 'en' ? `Deleted: ${name}` : `Удалено: ${name}`, 'success')
    } catch {
      onToast(lang === 'en' ? 'Delete failed' : 'Не удалось удалить', 'error')
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
        <h1 className="page-title">{t('counters.title')}</h1>
        <p className="page-subtitle">{t('counters.subtitle')}</p>
      </div>

      <div className="tabs-inline">
        <button className={`tab-btn ${tab === 'local' ? '-active' : ''}`} onClick={() => setTab('local')}>
          {t('counters.installed')} ({local.length})
        </button>
        <button className={`tab-btn ${tab === 'available' ? '-active' : ''}`} onClick={() => setTab('available')}>
          {t('counters.available')}
        </button>
      </div>

      {tab === 'available' && (
        <div className="search-bar">
          <input
            className="glass-input"
            placeholder={lang === 'en' ? 'Search counters...' : 'Поиск счётчиков...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {listLoading ? (
        <div className="empty-state">
          <Loader2 size={20} className="spin" />
          <span>{lang === 'en' ? 'Loading counters…' : 'Загрузка счётчиков…'}</span>
        </div>
      ) : counters.length === 0 ? (
        <div className="empty-state">
          <Layers size={24} strokeWidth={1.5} style={{ opacity: 0.45 }} />
          <p>{tab === 'local' ? (lang === 'en' ? 'No installed counters' : 'Нет установленных счётчиков') : (lang === 'en' ? 'No counters found' : 'Счётчики не найдены')}</p>
          <span className="empty-state-subtitle">
            {tab === 'local'
              ? (lang === 'en' ? 'Switch to "Catalog" tab to install counters' : 'Перейдите во вкладку «Каталог», чтобы установить')
              : (lang === 'en' ? 'Try adjusting your search query' : 'Попробуйте изменить поисковый запрос')}
          </span>
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
                            {lang === 'en' ? 'Settings' : 'Настройки'}
                          </button>
                        )}
                        <button className="btn btn-ghost btn-sm" onClick={() => window.tosuGui.openCounterFolder(c.folderName)} title={t('counters.openFolder')}>
                          <FolderOpen size={13} />
                        </button>
                        {isProtectedCounter(c.folderName) ? (
                          <span className="counter-meta" title={lang === 'en' ? 'System counter — cannot be deleted' : 'Системный счётчик — нельзя удалить'}>
                            {lang === 'en' ? 'system' : 'системный'}
                          </span>
                        ) : (
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c.folderName)} title={t('common.delete')}>
                            <Trash2 size={13} />
                          </button>
                        )}
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
                          {active ? t('counters.downloading') : c._downloaded ? t('counters.installed') : t('counters.download')}
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