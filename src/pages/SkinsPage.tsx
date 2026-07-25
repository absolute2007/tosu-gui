import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FolderOpen,
  FileUp,
  Images,
  Link2,
  Loader2,
  Palette,
  Search,
  X,
} from 'lucide-react'
import type {
  SkinDownloadProgress,
  SkinModeFilter,
  SkinSearchResult,
  SkinSort,
  SkinSummary,
} from '../../electron/skins-types'
import './SkinsPage.css'

function toFullShotUrl(url: string): string {
  return url.replace(/_(xs|sm|md|lg)\.webp(\?.*)?$/i, '.webp$2')
}

interface Props {
  visible?: boolean
  onToast: (msg: string, type: 'success' | 'error') => void
  onOpenSettings?: () => void
}

const MODE_OPTIONS: { id: SkinModeFilter; label: string }[] = [
  { id: 'any', label: 'Все' },
  { id: 'osu', label: 'osu!' },
  { id: 'taiko', label: 'Taiko' },
  { id: 'fruits', label: 'Catch' },
  { id: 'mania', label: 'Mania' },
]

const SORT_OPTIONS: { id: SkinSort; label: string }[] = [
  { id: 'recent', label: 'Новые' },
  { id: 'popular', label: 'Популярные' },
  { id: 'downloads', label: 'Скачивания' },
  { id: 'likes', label: 'Лайки' },
]

const QUERY_DEBOUNCE_MS = 320

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function creatorsLabel(skin: SkinSummary): string {
  if (!skin.creators.length) return '—'
  return skin.creators
    .map((c) => c.name)
    .filter(Boolean)
    .slice(0, 2)
    .join(', ')
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, ' ')
    .trim()
}

export function SkinsPage({ visible = true, onToast, onOpenSettings }: Props) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [mode, setMode] = useState<SkinModeFilter>('any')
  const [sort, setSort] = useState<SkinSort>('recent')
  const [skins, setSkins] = useState<SkinSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [cursorId, setCursorId] = useState<string | null>(null)
  const [cursorValue, setCursorValue] = useState<string | null>(null)
  const [skinsPath, setSkinsPath] = useState<string | null>(null)
  const [localNames, setLocalNames] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<Record<string, SkinDownloadProgress>>({})
  const [urlOpen, setUrlOpen] = useState(false)
  const [urlValue, setUrlValue] = useState('')
  const [gallery, setGallery] = useState<{
    skin: SkinSummary
    shots: string[]
    index: number
    loading: boolean
    error: string | null
  } | null>(null)
  const reqId = useRef(0)
  const queryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const filtersRef = useRef({ query: '', mode: 'any' as SkinModeFilter, sort: 'recent' as SkinSort })
  filtersRef.current = { query: debouncedQuery, mode, sort }

  // Debounce only text input — mode/sort apply immediately
  useEffect(() => {
    if (queryTimer.current) clearTimeout(queryTimer.current)
    queryTimer.current = setTimeout(() => {
      setDebouncedQuery(query.trim())
    }, QUERY_DEBOUNCE_MS)
    return () => {
      if (queryTimer.current) clearTimeout(queryTimer.current)
    }
  }, [query])

  const refreshPath = useCallback(async () => {
    try {
      const pathInfo = await window.tosuGui.getSkinsPath()
      setSkinsPath(pathInfo.resolved)
      const local = await window.tosuGui.getLocalSkins()
      setLocalNames(new Set(local.entries.map((e) => normalizeName(e.name))))
    } catch {
      setSkinsPath(null)
    }
  }, [])

  const runSearch = useCallback(
    async (opts?: {
      append?: boolean
      cursorId?: string | null
      cursorValue?: string | null
      /** Force params (avoids stale closure) */
      q?: string
      mode?: SkinModeFilter
      sort?: SkinSort
    }) => {
      const append = !!opts?.append
      const latest = filtersRef.current
      const q = (opts?.q ?? latest.query).trim()
      const m = opts?.mode ?? latest.mode
      const s = opts?.sort ?? latest.sort
      const my = ++reqId.current

      if (append) setLoadingMore(true)
      else {
        setLoading(true)
        setError(null)
      }

      try {
        const result: SkinSearchResult = await window.tosuGui.searchSkins({
          query: q || undefined,
          mode: m,
          sort: s,
          cursorId: append ? opts?.cursorId ?? null : null,
          cursorValue: append ? opts?.cursorValue ?? null : null,
        })
        if (my !== reqId.current) return
        setSkins((prev) => (append ? [...prev, ...result.skins] : result.skins))
        setHasMore(result.hasMore)
        setCursorId(result.cursorId)
        setCursorValue(result.cursorValue)
        setError(null)
      } catch (err) {
        if (my !== reqId.current) return
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        if (!append) setSkins([])
        onToast(msg, 'error')
      } finally {
        if (my === reqId.current) {
          setLoading(false)
          setLoadingMore(false)
        }
      }
    },
    [onToast]
  )

  useEffect(() => {
    if (!visible) return
    void refreshPath()
  }, [visible, refreshPath])

  // Fresh search whenever filters change — pass explicit params
  useEffect(() => {
    if (!visible) return
    setCursorId(null)
    setCursorValue(null)
    void runSearch({ q: debouncedQuery, mode, sort })
  }, [debouncedQuery, mode, sort, visible, runSearch])

  useEffect(() => {
    return window.tosuGui.onSkinDownloadProgress((p) => {
      setProgress((prev) => ({ ...prev, [p.jobId]: p }))
      if (p.phase === 'done' && p.filePath) {
        onToast('Скин установлен', 'success')
        void refreshPath()
      }
      if (p.phase === 'error' && p.error) onToast(p.error, 'error')
    })
  }, [onToast, refreshPath])

  const setModeFilter = (next: SkinModeFilter) => {
    if (next === mode) return
    setMode(next)
    setLoading(true)
  }

  const setSortFilter = (next: SkinSort) => {
    if (next === sort) return
    setSort(next)
    setLoading(true)
  }

  const pickPath = async () => {
    const r = await window.tosuGui.pickSkinsPath()
    if (!r.cancelled) {
      setSkinsPath(r.resolved)
      onToast('Папка Skins обновлена', 'success')
    }
  }

  const download = async (skin: SkinSummary) => {
    if (!skinsPath) {
      onToast('Укажите папку Skins', 'error')
      onOpenSettings?.()
      return
    }
    try {
      const result = await window.tosuGui.downloadSkin({ skinId: skin.id })
      if (result.cancelled) return
      if (result.openExternal) {
        onToast('MEGA: ссылка открыта в браузере', 'success')
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  const importFile = async () => {
    try {
      const r = await window.tosuGui.importSkinFile()
      if (r.cancelled) return
      onToast('Скин импортирован', 'success')
      void refreshPath()
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  const downloadUrl = async () => {
    const url = urlValue.trim()
    if (!url) return
    try {
      const r = await window.tosuGui.downloadSkinUrl({ url })
      if (r.cancelled) return
      if (r.ok) {
        setUrlOpen(false)
        setUrlValue('')
        onToast('Скин установлен', 'success')
        void refreshPath()
      }
    } catch (err) {
      onToast(err instanceof Error ? err.message : String(err), 'error')
    }
  }

  const isInstalled = useCallback(
    (skin: SkinSummary) => {
      const n = normalizeName(skin.name)
      if (!n) return false
      for (const local of localNames) {
        if (!local) continue
        if (local === n || local.includes(n) || n.includes(local)) return true
      }
      return false
    },
    [localNames]
  )

  const openGallery = async (skin: SkinSummary) => {
    const seed = skin.coverUrl ? [toFullShotUrl(skin.coverUrl)] : []
    setGallery({ skin, shots: seed, index: 0, loading: true, error: null })
    try {
      const detail = await window.tosuGui.getSkinDetail(skin.id)
      const shots = (detail.screenshots || [])
        .map((u) => toFullShotUrl(u))
        .filter(Boolean)
      setGallery({
        skin,
        shots: shots.length ? shots : seed,
        index: 0,
        loading: false,
        error: shots.length ? null : seed.length ? null : 'Нет скриншотов',
      })
    } catch (err) {
      setGallery((g) =>
        g
          ? {
              ...g,
              loading: false,
              error: err instanceof Error ? err.message : String(err),
            }
          : null
      )
    }
  }

  useEffect(() => {
    if (!gallery) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGallery(null)
      if (!gallery.shots.length) return
      if (e.key === 'ArrowRight') {
        setGallery((g) =>
          g ? { ...g, index: (g.index + 1) % g.shots.length } : g
        )
      }
      if (e.key === 'ArrowLeft') {
        setGallery((g) =>
          g ? { ...g, index: (g.index - 1 + g.shots.length) % g.shots.length } : g
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [gallery])

  const activeJobs = useMemo(
    () =>
      Object.values(progress).filter(
        (p) => p.phase === 'downloading' || p.phase === 'resolving' || p.phase === 'installing'
      ),
    [progress]
  )

  const filterBusy = loading && !loadingMore
  const queryPending = query.trim() !== debouncedQuery

  return (
    <div className="page skins-page" hidden={!visible}>
      <div className="skins-page-top">
        <div className="skins-header">
          <div>
            <h1 className="page-title">Скины</h1>
            <p className="page-subtitle">Каталог skins.osuck.net · папка Skins</p>
          </div>
          <div className="skins-header-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void importFile()}>
              <FileUp size={14} strokeWidth={1.8} />
              Импорт
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setUrlOpen((v) => !v)}
            >
              <Link2 size={14} strokeWidth={1.8} />
              URL
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => void window.tosuGui.openSkinsFolder().catch(() => onOpenSettings?.())}
              title={skinsPath || 'Папка не найдена'}
            >
              <FolderOpen size={14} strokeWidth={1.8} />
              Skins
            </button>
          </div>
        </div>

        {!skinsPath ? (
          <div className="skins-banner skins-banner-warn">
            <div className="skins-banner-text">
              <strong>Папка Skins не найдена</strong>
              <span>Укажите путь к Skins osu!stable</span>
            </div>
            <div className="skins-banner-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void pickPath()}>
                Выбрать
              </button>
              {onOpenSettings ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenSettings}>
                  Настройки
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {urlOpen ? (
          <div className="skins-url-row">
            <input
              className="glass-input skins-search-input"
              placeholder="Прямая ссылка на .osk / .zip"
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void downloadUrl()
              }}
            />
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void downloadUrl()}>
              Скачать
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setUrlOpen(false)}>
              <X size={14} />
            </button>
          </div>
        ) : null}

        <div className="skins-toolbar">
          <div className="skins-search">
            <Search size={15} strokeWidth={1.8} className="skins-search-icon" />
            <input
              className={`glass-input skins-search-input ${filterBusy || queryPending ? '-has-busy' : ''}`}
              placeholder="Поиск…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {(filterBusy || queryPending) && (
              <span className="skins-search-busy" aria-hidden>
                <Loader2 size={14} className="spin" />
              </span>
            )}
            {query ? (
              <button
                type="button"
                className="skins-search-clear"
                title="Очистить"
                aria-label="Очистить поиск"
                onClick={() => setQuery('')}
              >
                <X size={14} strokeWidth={1.8} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="skins-filters">
          <div className="tabs-inline skins-modes">
            {MODE_OPTIONS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`tab-btn ${mode === m.id ? '-active' : ''}`}
                onClick={() => setModeFilter(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="tabs-inline skins-sorts">
            {SORT_OPTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`tab-btn ${sort === s.id ? '-active' : ''}`}
                onClick={() => setSortFilter(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
          {filterBusy ? (
            <span className="skins-filter-status">
              <Loader2 size={13} className="spin" />
              Обновление…
            </span>
          ) : null}
        </div>

        {activeJobs.length > 0 ? (
          <div className="skins-progress-list">
            {activeJobs.map((p) => (
              <div key={p.jobId} className="skins-progress-row">
                <span className="skins-progress-msg">{p.message || p.phase}</span>
                <div className="skins-progress-bar">
                  <div className="skins-progress-fill" style={{ width: `${p.progress}%` }} />
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => void window.tosuGui.cancelSkinDownload(p.jobId)}
                >
                  Отмена
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="skins-page-scroll">
        {loading && skins.length === 0 ? (
          <div className="skins-empty">
            <Loader2 size={22} className="spin" />
            <span>Загрузка…</span>
          </div>
        ) : error && skins.length === 0 ? (
          <div className="skins-empty">
            <Palette size={22} strokeWidth={1.5} />
            <span>{error}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void runSearch()}>
              Повторить
            </button>
          </div>
        ) : skins.length === 0 ? (
          <div className="skins-empty">
            <Palette size={22} strokeWidth={1.5} />
            <span>Ничего не найдено</span>
          </div>
        ) : (
          <>
            <div className={`skins-grid ${filterBusy ? '-dim' : ''}`}>
              {skins.map((skin) => {
                const job = progress[`skin-${skin.id}`]
                const busy =
                  job &&
                  (job.phase === 'downloading' ||
                    job.phase === 'resolving' ||
                    job.phase === 'installing')
                const installed = isInstalled(skin)
                return (
                  <article
                    key={`${skin.id}-${skin.docId}`}
                    className={`skin-card ${installed ? '-installed' : ''} ${busy ? '-busy' : ''}`}
                  >
                    <button
                      type="button"
                      className="skin-card-cover"
                      title="Смотреть скриншоты"
                      onClick={() => void openGallery(skin)}
                    >
                      {skin.coverUrl ? (
                        <img src={skin.coverUrl} alt="" loading="lazy" draggable={false} />
                      ) : (
                        <div className="skin-card-cover-empty">
                          <Palette size={28} strokeWidth={1.4} />
                        </div>
                      )}
                      <span className="skin-card-shots-hint">
                        <Images size={13} strokeWidth={1.8} />
                        Скрины
                      </span>
                      {installed ? (
                        <span className="skin-card-badge skin-card-badge-installed">
                          <Check size={12} strokeWidth={2.4} />
                          Установлен
                        </span>
                      ) : null}
                    </button>
                    <div className="skin-card-body">
                      <div className="skin-card-title" title={skin.name}>
                        {skin.name}
                        {skin.version ? <span className="skin-card-ver"> {skin.version}</span> : null}
                      </div>
                      <div className="skin-card-meta">{creatorsLabel(skin)}</div>
                      {installed ? (
                        <div className="skin-card-installed-row">
                          <Check size={13} strokeWidth={2.2} />
                          Уже в папке Skins
                        </div>
                      ) : (
                        <div className="skin-card-stats">
                          <span title="Скачивания">{formatCount(skin.downloads)} dl</span>
                          <span title="Лайки">{formatCount(skin.likes)} likes</span>
                          {skin.sizeLabel ? <span>{skin.sizeLabel} MB</span> : null}
                        </div>
                      )}
                      {busy && job ? (
                        <div className="skin-card-dl">
                          <div className="skin-card-dl-bar">
                            <div
                              className="skin-card-dl-fill"
                              style={{ width: `${Math.max(4, job.progress)}%` }}
                            />
                          </div>
                          <span className="skin-card-dl-msg">
                            {job.message || 'Скачивание…'} {job.progress}%
                          </span>
                        </div>
                      ) : null}
                      <div className="skin-card-actions">
                        <button
                          type="button"
                          className={`btn btn-sm ${installed ? 'btn-ghost' : 'btn-primary'}`}
                          disabled={!!busy || !skinsPath}
                          onClick={() => void download(skin)}
                        >
                          {busy ? (
                            <Loader2 size={14} className="spin" />
                          ) : (
                            <Download size={14} strokeWidth={1.8} />
                          )}
                          {busy ? `${job?.progress ?? 0}%` : installed ? 'Скачать снова' : 'Скачать'}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          title="Открыть на osuck"
                          onClick={() => void window.tosuGui.openExternal(skin.pageUrl)}
                        >
                          <ExternalLink size={14} strokeWidth={1.8} />
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>

            {hasMore ? (
              <div className="skins-more">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={loadingMore || filterBusy}
                  onClick={() =>
                    void runSearch({ append: true, cursorId, cursorValue })
                  }
                >
                  {loadingMore ? <Loader2 size={16} className="spin" /> : null}
                  Ещё
                </button>
              </div>
            ) : null}
          </>
        )}

        <p className="skins-attribution">
          Каталог:{' '}
          <button
            type="button"
            className="skins-link"
            onClick={() => void window.tosuGui.openExternal('https://skins.osuck.net/')}
          >
            skins.osuck.net
          </button>
          . Файлы с Google Drive / MediaFire.
        </p>
      </div>

      {gallery ? (
        <div
          className="skin-gallery"
          role="dialog"
          aria-modal="true"
          aria-label={`Скриншоты ${gallery.skin.name}`}
        >
          <button
            type="button"
            className="skin-gallery-backdrop"
            aria-label="Закрыть"
            onClick={() => setGallery(null)}
          />
          <div className="skin-gallery-panel">
            <header className="skin-gallery-head">
              <div className="skin-gallery-title">
                <div className="skin-gallery-name">{gallery.skin.name}</div>
                <div className="skin-gallery-meta">
                  {gallery.loading
                    ? 'Загрузка скриншотов…'
                    : gallery.shots.length
                      ? `${gallery.index + 1} / ${gallery.shots.length}`
                      : gallery.error || 'Нет скриншотов'}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                title="Открыть на osuck"
                onClick={() => void window.tosuGui.openExternal(gallery.skin.pageUrl)}
              >
                <ExternalLink size={14} strokeWidth={1.8} />
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                title="Закрыть"
                onClick={() => setGallery(null)}
              >
                <X size={16} strokeWidth={1.8} />
              </button>
            </header>

            <div className="skin-gallery-stage">
              {gallery.loading && !gallery.shots.length ? (
                <div className="skin-gallery-empty">
                  <Loader2 size={22} className="spin" />
                </div>
              ) : gallery.shots.length ? (
                <>
                  {gallery.shots.length > 1 ? (
                    <button
                      type="button"
                      className="skin-gallery-nav -prev"
                      aria-label="Предыдущий"
                      onClick={() =>
                        setGallery((g) =>
                          g
                            ? {
                                ...g,
                                index: (g.index - 1 + g.shots.length) % g.shots.length,
                              }
                            : g
                        )
                      }
                    >
                      <ChevronLeft size={22} strokeWidth={1.8} />
                    </button>
                  ) : null}
                  <img
                    className="skin-gallery-img"
                    src={gallery.shots[gallery.index]}
                    alt=""
                    draggable={false}
                  />
                  {gallery.shots.length > 1 ? (
                    <button
                      type="button"
                      className="skin-gallery-nav -next"
                      aria-label="Следующий"
                      onClick={() =>
                        setGallery((g) =>
                          g ? { ...g, index: (g.index + 1) % g.shots.length } : g
                        )
                      }
                    >
                      <ChevronRight size={22} strokeWidth={1.8} />
                    </button>
                  ) : null}
                </>
              ) : (
                <div className="skin-gallery-empty">
                  {gallery.error || 'Нет скриншотов'}
                </div>
              )}
            </div>

            {gallery.shots.length > 1 ? (
              <div className="skin-gallery-thumbs">
                {gallery.shots.map((src, i) => (
                  <button
                    key={`${src}-${i}`}
                    type="button"
                    className={`skin-gallery-thumb ${i === gallery.index ? '-on' : ''}`}
                    onClick={() => setGallery((g) => (g ? { ...g, index: i } : g))}
                  >
                    <img src={src} alt="" draggable={false} />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
