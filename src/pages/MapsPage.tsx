import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  Download,
  FolderOpen,
  Loader2,
  LogIn,
  LogOut,
  Map as MapIcon,
  Pause,
  Play,
  Search,
  X,
} from 'lucide-react'
import type {
  MapDownloadProgress,
  MapLanguageFilter,
  MapModeFilter,
  MapSetSummary,
  MapStatusFilter,
} from '../../electron/beatmap-maps'
import type { OsuAccountInfo } from '../../electron/osu-session'
import './MapsPage.css'

interface Props {
  visible?: boolean
  /** Compact layout for always-on-top overlay window */
  overlay?: boolean
  onToast: (msg: string, type: 'success' | 'error') => void
  onOpenSettings?: () => void
}

const PAGE_SIZE = 24
/** Min gap between search requests (osu rate limit ~60/min). */
const SEARCH_COOLDOWN_MS = 1200
/** After 429, pause auto-load this long. */
const RATE_LIMIT_COOLDOWN_MS = 45_000

const MODE_OPTIONS: { id: MapModeFilter; label: string }[] = [
  { id: 'any', label: 'Все' },
  { id: 'osu', label: 'osu!' },
  { id: 'taiko', label: 'Taiko' },
  { id: 'fruits', label: 'Catch' },
  { id: 'mania', label: 'Mania' },
]

/** Primary categories — always visible as chips (like osu! listing). */
const MAIN_STATUS_OPTIONS: { id: MapStatusFilter; label: string }[] = [
  { id: 'ranked', label: 'Ranked' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'loved', label: 'Loved' },
  { id: 'any', label: 'Любой' },
]

/** Secondary categories — dropdown (Pending/WIP/etc. on the website). */
const MORE_STATUS_OPTIONS: { id: MapStatusFilter; label: string }[] = [
  { id: 'pending', label: 'На рассмотрении' },
  { id: 'wip', label: 'В разработке' },
  { id: 'graveyard', label: 'Graveyard' },
  { id: 'favourites', label: 'Избранное' },
  { id: 'mine', label: 'Мои карты' },
]

const LANGUAGE_OPTIONS: { id: MapLanguageFilter; label: string }[] = [
  { id: 'any', label: 'Любой язык' },
  { id: 'english', label: 'English' },
  { id: 'japanese', label: 'Japanese' },
  { id: 'chinese', label: 'Chinese' },
  { id: 'korean', label: 'Korean' },
  { id: 'russian', label: 'Russian' },
  { id: 'instrumental', label: 'Instrumental' },
  { id: 'french', label: 'French' },
  { id: 'german', label: 'German' },
  { id: 'spanish', label: 'Spanish' },
  { id: 'italian', label: 'Italian' },
  { id: 'swedish', label: 'Swedish' },
  { id: 'polish', label: 'Polish' },
  { id: 'unspecified', label: 'Не указан' },
  { id: 'other', label: 'Другой' },
]

function isMoreStatus(id: MapStatusFilter): boolean {
  return MORE_STATUS_OPTIONS.some((o) => o.id === id)
}

function formatStars(min: number, max: number): string {
  if (!max) return '—'
  if (Math.abs(max - min) < 0.05) return max.toFixed(2)
  return `${min.toFixed(1)}–${max.toFixed(1)}`
}

function statusClass(status: string): string {
  const s = status.toLowerCase()
  if (s === 'ranked' || s === 'approved') return '-ranked'
  if (s === 'loved') return '-loved'
  if (s === 'qualified') return '-qualified'
  if (s === 'pending' || s === 'wip') return '-pending'
  if (s === 'graveyard') return '-graveyard'
  return '-other'
}

function isBusyPhase(phase: MapDownloadProgress['phase'] | undefined): boolean {
  return phase === 'downloading' || phase === 'installing' || phase === 'queued'
}

function cleanIpcError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '')
}

function isRateLimitMsg(msg: string): boolean {
  return /429|слишком много|rate|лимит/i.test(msg)
}

interface MapRowProps {
  set: MapSetSummary
  owned: boolean
  download: MapDownloadProgress | undefined
  canDownload: boolean
  previewPlaying: boolean
  onTogglePreview: (set: MapSetSummary) => void
  onDownload: (set: MapSetSummary) => void
  onCancel: (setId: number) => void
}

const MapRow = memo(function MapRow({
  set,
  owned,
  download,
  canDownload,
  previewPlaying,
  onTogglePreview,
  onDownload,
  onCancel,
}: MapRowProps) {
  const busy = isBusyPhase(download?.phase)
  const pct = download?.progress ?? 0
  const cover = set.listCoverUrl || set.coverUrl
  const canPreview = Boolean(set.previewUrl)

  return (
    <div className="map-row">
      <div className="map-cover">
        {cover ? (
          <img src={cover} alt="" loading="lazy" decoding="async" draggable={false} />
        ) : (
          <div className="map-cover-fallback" />
        )}
      </div>
      <div className="map-meta">
        <div className="map-title-line">
          <span className="map-title" title={`${set.artist} — ${set.title}`}>
            {set.artist} — {set.title}
          </span>
          <span className={`map-status ${statusClass(set.status)}`}>{set.status || 'unknown'}</span>
        </div>
        <div className="map-sub">
          <span>mapped by {set.creator}</span>
          <span className="map-dot">·</span>
          <span>{formatStars(set.minStars, set.maxStars)}★</span>
          {set.bpm > 0 && (
            <>
              <span className="map-dot">·</span>
              <span>{Math.round(set.bpm)} BPM</span>
            </>
          )}
          {set.hasVideo && (
            <>
              <span className="map-dot">·</span>
              <span>video</span>
            </>
          )}
        </div>
      </div>
      <div className="map-actions">
        <button
          type="button"
          className={`btn btn-ghost btn-sm map-preview-btn ${previewPlaying ? '-playing' : ''}`}
          disabled={!canPreview}
          onClick={() => onTogglePreview(set)}
          title={previewPlaying ? 'Стоп' : 'Превью'}
          aria-label={previewPlaying ? 'Остановить превью' : 'Слушать превью'}
        >
          {previewPlaying ? <Pause size={14} strokeWidth={2} /> : <Play size={14} strokeWidth={2} />}
        </button>
        {owned ? (
          <button type="button" className="btn btn-ghost btn-sm map-dl-btn -owned" disabled>
            <Check size={14} strokeWidth={2} />
            Есть
          </button>
        ) : busy ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm map-dl-btn -busy"
            onClick={() => onCancel(set.id)}
            title="Отменить"
          >
            <X size={14} strokeWidth={2} />
            {Math.round(pct)}%
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary btn-sm map-dl-btn"
            disabled={!canDownload}
            onClick={() => onDownload(set)}
          >
            <Download size={14} strokeWidth={1.8} />
            Скачать
          </button>
        )}
      </div>
      {busy && <div className="map-row-progress" style={{ width: `${Math.max(4, pct)}%` }} />}
    </div>
  )
})

export function MapsPage({ visible = true, overlay = false, onToast, onOpenSettings }: Props) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [mode, setMode] = useState<MapModeFilter>('any')
  const [status, setStatus] = useState<MapStatusFilter>('ranked')
  const [language, setLanguage] = useState<MapLanguageFilter>('any')
  const [cursor, setCursor] = useState<string | null>(null)
  /** 0-based index of last successfully loaded page */
  const [pageIndex, setPageIndex] = useState(0)
  const [sets, setSets] = useState<MapSetSummary[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [songsPath, setSongsPath] = useState<string | null>(null)
  const [localIds, setLocalIds] = useState<Set<number>>(() => new Set())
  const [downloads, setDownloads] = useState<Record<number, MapDownloadProgress>>({})
  const [account, setAccount] = useState<OsuAccountInfo | null>(null)
  /** false until first auth status check finishes — avoids "not logged in" flash */
  const [authReady, setAuthReady] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [rateLimitedUntil, setRateLimitedUntil] = useState(0)
  const [previewId, setPreviewId] = useState<number | null>(null)

  const searchSeq = useRef(0)
  const inFlightRef = useRef(false)
  const cursorRef = useRef<string | null>(null)
  const pageIndexRef = useRef(0)
  const lastSearchAtRef = useRef(0)
  const rateLimitedUntilRef = useRef(0)
  const authBootstrapped = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const loggedIn = Boolean(account?.loggedIn)

  const stopPreview = useCallback(() => {
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    setPreviewId(null)
  }, [])

  const togglePreview = useCallback(
    (set: MapSetSummary) => {
      if (!set.previewUrl) {
        onToast('Превью недоступно', 'error')
        return
      }
      if (previewId === set.id) {
        stopPreview()
        return
      }

      let audio = audioRef.current
      if (!audio) {
        audio = new Audio()
        audio.preload = 'none'
        audio.addEventListener('ended', () => setPreviewId(null))
        audio.addEventListener('error', () => {
          setPreviewId(null)
          onToast('Не удалось воспроизвести превью', 'error')
        })
        audioRef.current = audio
      }

      try {
        audio.pause()
        audio.src = set.previewUrl
        void audio.play().then(
          () => setPreviewId(set.id),
          () => {
            setPreviewId(null)
            onToast('Не удалось воспроизвести превью', 'error')
          }
        )
      } catch {
        setPreviewId(null)
        onToast('Не удалось воспроизвести превью', 'error')
      }
    },
    [previewId, stopPreview, onToast]
  )

  // Stop preview when leaving the page or unmounting
  useEffect(() => {
    if (!visible) stopPreview()
  }, [visible, stopPreview])

  useEffect(() => {
    return () => {
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        audio.removeAttribute('src')
        audioRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    cursorRef.current = cursor
  }, [cursor])

  useEffect(() => {
    pageIndexRef.current = pageIndex
  }, [pageIndex])

  useEffect(() => {
    rateLimitedUntilRef.current = rateLimitedUntil
  }, [rateLimitedUntil])

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 400)
    return () => clearTimeout(t)
  }, [query])

  const refreshAuth = useCallback(async () => {
    try {
      const info = await window.tosuGui.getOsuAuthStatus()
      setAccount(info)
      return info
    } catch {
      setAccount({ loggedIn: false, userId: null, username: null, avatarUrl: null })
      return null
    } finally {
      setAuthReady(true)
    }
  }, [])

  const refreshLocal = useCallback(async () => {
    try {
      const pathInfo = await window.tosuGui.getSongsPath()
      setSongsPath(pathInfo.resolved)
      const local = await window.tosuGui.getLocalMapSets()
      setLocalIds(new Set(local.setIds))
    } catch {
      setSongsPath(null)
      setLocalIds(new Set())
    }
  }, [])

  // Bootstrap once (page stays mounted via page-slot)
  useEffect(() => {
    if (authBootstrapped.current) return
    authBootstrapped.current = true
    void refreshAuth()
    void refreshLocal()
  }, [refreshAuth, refreshLocal])

  // Soft refresh when tab becomes visible again (no UI flash — keep previous account)
  useEffect(() => {
    if (!visible || !authReady) return
    void refreshAuth()
    void refreshLocal()
  }, [visible, authReady, refreshAuth, refreshLocal])

  useEffect(() => {
    return window.tosuGui.onMapDownloadProgress((progress) => {
      setDownloads((prev) => {
        const prevItem = prev[progress.setId]
        if (
          prevItem &&
          prevItem.phase === progress.phase &&
          Math.floor(prevItem.progress) === Math.floor(progress.progress)
        ) {
          return prev
        }
        return { ...prev, [progress.setId]: progress }
      })
      if (progress.phase === 'done') {
        setLocalIds((prev) => {
          if (prev.has(progress.setId)) return prev
          const next = new Set(prev)
          next.add(progress.setId)
          return next
        })
      }
    })
  }, [])

  const markRateLimited = useCallback((msg: string) => {
    if (!isRateLimitMsg(msg)) return
    const until = Date.now() + RATE_LIMIT_COOLDOWN_MS
    rateLimitedUntilRef.current = until
    setRateLimitedUntil(until)
    setHasMore(false)
  }, [])

  const fetchPage = useCallback(
    async (
      q: string,
      m: MapModeFilter,
      s: MapStatusFilter,
      lang: MapLanguageFilter,
      append: boolean,
      cursorStr: string | null,
      page: number
    ) => {
      if (inFlightRef.current) {
        if (append) onToast('Подождите, идёт запрос…', 'error')
        return
      }

      const now = Date.now()
      if (now < rateLimitedUntilRef.current) {
        const sec = Math.ceil((rateLimitedUntilRef.current - now) / 1000)
        if (append) {
          onToast(`Лимит osu! — подождите ~${sec}с`, 'error')
        } else {
          setError(`Лимит запросов osu! — подождите ~${sec}с и нажмите Повторить`)
        }
        return
      }

      const sinceLast = now - lastSearchAtRef.current
      if (sinceLast < SEARCH_COOLDOWN_MS) {
        await new Promise((r) => setTimeout(r, SEARCH_COOLDOWN_MS - sinceLast))
      }

      const seq = ++searchSeq.current
      inFlightRef.current = true
      if (append) setLoadingMore(true)
      else {
        setLoading(true)
        setError(null)
      }

      try {
        lastSearchAtRef.current = Date.now()
        const result = await window.tosuGui.searchMaps({
          query: q,
          mode: m,
          status: s,
          language: lang,
          page,
          limit: PAGE_SIZE,
          cursor: append ? cursorStr : null,
        })
        if (seq !== searchSeq.current) return

        if (append) {
          setSets((prev) => {
            const seen = new Set(prev.map((x) => x.id))
            const extra = result.sets.filter((r) => !seen.has(r.id))
            if (extra.length === 0) {
              setHasMore(false)
              setCursor(null)
              cursorRef.current = null
              return prev
            }
            setHasMore(result.hasMore)
            setCursor(result.cursor)
            cursorRef.current = result.cursor
            setPageIndex(page)
            pageIndexRef.current = page
            return prev.concat(extra)
          })
        } else {
          setSets(result.sets)
          setHasMore(result.hasMore)
          setCursor(result.cursor)
          cursorRef.current = result.cursor
          setPageIndex(0)
          pageIndexRef.current = 0
        }
      } catch (err) {
        if (seq !== searchSeq.current) return
        const msg = cleanIpcError(err)
        markRateLimited(msg)
        if (!append) {
          setSets([])
          setHasMore(false)
          setCursor(null)
          cursorRef.current = null
          setPageIndex(0)
          pageIndexRef.current = 0
          setError(msg)
        } else {
          onToast(msg || 'Не удалось подгрузить ещё', 'error')
        }
      } finally {
        // Always clear flags for this attempt if still current, else force-clear if stuck
        setLoading(false)
        setLoadingMore(false)
        inFlightRef.current = false
      }
    },
    [onToast, markRateLimited]
  )

  // Fresh search only when filters/query change — never auto-paginates
  useEffect(() => {
    if (!authReady) return
    if (!loggedIn) {
      setSets([])
      setHasMore(false)
      setCursor(null)
      cursorRef.current = null
      setPageIndex(0)
      pageIndexRef.current = 0
      setError(null)
      setLoading(false)
      setLoadingMore(false)
      inFlightRef.current = false
      return
    }
    void fetchPage(debouncedQuery, mode, status, language, false, null, 0)
  }, [debouncedQuery, mode, status, language, loggedIn, authReady, fetchPage])

  /** Manual only — button click, no auto-scroll load. */
  const loadMore = useCallback(() => {
    if (!loggedIn) {
      onToast('Сначала войдите в osu!', 'error')
      return
    }
    if (loadingMore || loading) return
    if (!hasMore) {
      onToast('Больше карт нет', 'error')
      return
    }
    if (Date.now() < rateLimitedUntilRef.current) {
      const sec = Math.ceil((rateLimitedUntilRef.current - Date.now()) / 1000)
      onToast(`Лимит osu! — подождите ~${sec}с`, 'error')
      return
    }
    const nextPage = pageIndexRef.current + 1
    void fetchPage(debouncedQuery, mode, status, language, true, cursorRef.current, nextPage)
  }, [
    debouncedQuery,
    mode,
    status,
    language,
    loading,
    loadingMore,
    loggedIn,
    hasMore,
    fetchPage,
    onToast,
  ])

  useEffect(() => {
    if (!rateLimitedUntil) return
    const left = rateLimitedUntil - Date.now()
    if (left <= 0) {
      setRateLimitedUntil(0)
      return
    }
    const t = setTimeout(() => {
      setRateLimitedUntil(0)
      rateLimitedUntilRef.current = 0
      // restore load-more if we still expect more
      if (cursorRef.current || pageIndexRef.current >= 0) {
        setHasMore(true)
      }
    }, left)
    return () => clearTimeout(t)
  }, [rateLimitedUntil])

  const handleLogin = async () => {
    setAuthBusy(true)
    try {
      const info = await window.tosuGui.loginOsu()
      setAccount(info)
      if (info.loggedIn) {
        onToast(info.username ? `Вошли как ${info.username}` : 'Вход выполнен', 'success')
      } else {
        onToast('Вход не выполнен', 'error')
      }
    } catch (err) {
      onToast(cleanIpcError(err) || 'Ошибка входа', 'error')
    } finally {
      setAuthBusy(false)
    }
  }

  const handleLogout = async () => {
    setAuthBusy(true)
    try {
      const info = await window.tosuGui.logoutOsu()
      setAccount(info)
      setSets([])
      setCursor(null)
      cursorRef.current = null
      setHasMore(false)
      onToast('Вышли из osu!', 'success')
    } catch {
      onToast('Не удалось выйти', 'error')
    } finally {
      setAuthBusy(false)
    }
  }

  const handlePickSongs = async () => {
    try {
      const result = await window.tosuGui.pickSongsPath()
      if (result.cancelled) return
      setSongsPath(result.resolved)
      await refreshLocal()
      onToast('Папка Songs сохранена', 'success')
    } catch {
      onToast('Не удалось выбрать папку', 'error')
    }
  }

  const handleCancel = useCallback(
    async (setId: number) => {
      try {
        await window.tosuGui.cancelMapDownload(setId)
        setDownloads((prev) => ({
          ...prev,
          [setId]: { setId, phase: 'cancelled', progress: 0, message: 'Отменено' },
        }))
      } catch {
        onToast('Не удалось отменить', 'error')
      }
    },
    [onToast]
  )

  const handleDownload = useCallback(
    async (set: MapSetSummary) => {
      if (!loggedIn) {
        onToast('Сначала войдите в osu!', 'error')
        return
      }
      if (!songsPath) {
        onToast('Сначала укажите папку Songs', 'error')
        return
      }

      let blocked = false
      setLocalIds((prev) => {
        if (prev.has(set.id)) blocked = true
        return prev
      })
      if (blocked) {
        onToast('Эта карта уже есть в Songs', 'success')
        return
      }

      setDownloads((prev) => {
        if (isBusyPhase(prev[set.id]?.phase)) {
          blocked = true
          return prev
        }
        return {
          ...prev,
          [set.id]: { setId: set.id, phase: 'queued', progress: 0, message: 'В очереди…' },
        }
      })
      if (blocked) return

      try {
        const result = await window.tosuGui.downloadMap({
          setId: set.id,
          artist: set.artist,
          title: set.title,
        })
        if (result.cancelled) {
          onToast('Загрузка отменена', 'success')
          return
        }
        onToast(`Скачано: ${set.artist} — ${set.title}`, 'success')
        setLocalIds((prev) => {
          if (prev.has(set.id)) return prev
          const next = new Set(prev)
          next.add(set.id)
          return next
        })
      } catch (err) {
        const msg = cleanIpcError(err)
        if (/отмен/i.test(msg)) {
          setDownloads((prev) => ({
            ...prev,
            [set.id]: { setId: set.id, phase: 'cancelled', progress: 0, message: 'Отменено' },
          }))
          return
        }
        if (isRateLimitMsg(msg)) {
          markRateLimited(msg)
        }
        setDownloads((prev) => ({
          ...prev,
          [set.id]: { setId: set.id, phase: 'error', progress: 0, error: msg },
        }))
        onToast(msg || 'Ошибка скачивания', 'error')
      }
    },
    [songsPath, loggedIn, onToast, markRateLimited]
  )

  const handleSongsClick = () => {
    if (songsPath) void window.tosuGui.openSongsFolder()
    else void handlePickSongs()
  }

  const canDownload = Boolean(songsPath && loggedIn)
  const rateLimitActive = rateLimitedUntil > Date.now()
  const rateLimitSec = rateLimitActive ? Math.ceil((rateLimitedUntil - Date.now()) / 1000) : 0

  return (
    <div className={`page maps-page${overlay ? ' -overlay' : ''}`}>
      <div className="maps-page-top">
        <div className="page-header maps-header">
          <div>
            <h1 className="page-title">Карты</h1>
            <p className="page-subtitle">
              {overlay ? 'osu.ppy.sh · поверх игры' : 'Официально с osu.ppy.sh (нужен вход)'}
            </p>
          </div>
          <div className="maps-header-actions">
            {!authReady ? (
              <button type="button" className="btn btn-ghost btn-sm" disabled>
                <Loader2 size={14} className="spin" />
                …
              </button>
            ) : loggedIn ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={authBusy}
                onClick={() => void handleLogout()}
                title={account?.username || 'Выйти'}
              >
                {authBusy ? <Loader2 size={14} className="spin" /> : <LogOut size={14} strokeWidth={1.8} />}
                {account?.username || 'Выйти'}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={authBusy}
                onClick={() => void handleLogin()}
              >
                {authBusy ? <Loader2 size={14} className="spin" /> : <LogIn size={14} strokeWidth={1.8} />}
                Войти
              </button>
            )}
            <button
              type="button"
              className={`btn btn-sm ${songsPath ? 'btn-ghost' : 'btn-primary'}`}
              onClick={handleSongsClick}
              title={songsPath ? 'Открыть Songs' : 'Указать папку Songs'}
            >
              <FolderOpen size={14} strokeWidth={1.8} />
              Songs
            </button>
          </div>
        </div>

        {authReady && !loggedIn && (
          <div className="maps-banner">
            <div className="maps-banner-text">
              <strong>Войдите в osu!</strong>
              <span>Поиск и скачивание идут с osu.ppy.sh под вашим аккаунтом</span>
            </div>
            <div className="maps-banner-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={authBusy}
                onClick={() => void handleLogin()}
              >
                {authBusy ? <Loader2 size={14} className="spin" /> : <LogIn size={14} strokeWidth={1.8} />}
                Войти
              </button>
            </div>
          </div>
        )}

        {authReady && loggedIn && !songsPath && (
          <div className="maps-banner">
            <div className="maps-banner-text">
              <strong>Нужна папка Songs</strong>
              <span>Куда складывать .osz (обычно %LocalAppData%\osu!\Songs)</span>
            </div>
            <div className="maps-banner-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void handlePickSongs()}>
                Выбрать папку
              </button>
              {onOpenSettings && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenSettings}>
                  Настройки
                </button>
              )}
            </div>
          </div>
        )}

        {rateLimitActive && (
          <div className="maps-banner maps-banner-warn">
            <div className="maps-banner-text">
              <strong>Лимит osu!</strong>
              <span>Подождите ~{rateLimitSec}с — слишком много запросов подряд</span>
            </div>
          </div>
        )}

        <div className="maps-toolbar">
          <div className="maps-search">
            <Search size={15} strokeWidth={1.8} className="maps-search-icon" />
            <input
              className="glass-input maps-search-input"
              placeholder="Название, артист, mapper…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              spellCheck={false}
              disabled={!authReady || !loggedIn}
            />
          </div>
          <select
            className="glass-input maps-select maps-select-lang"
            value={language}
            onChange={(e) => setLanguage(e.target.value as MapLanguageFilter)}
            disabled={!authReady || !loggedIn}
            title="Язык"
            aria-label="Язык"
          >
            {LANGUAGE_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="maps-filter-row">
          <div className="tabs-inline maps-statuses">
            {MAIN_STATUS_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`tab-btn ${status === o.id ? '-active' : ''}`}
                onClick={() => setStatus(o.id)}
                disabled={!authReady || !loggedIn}
              >
                {o.label}
              </button>
            ))}
          </div>
          <select
            className={`glass-input maps-select maps-select-more ${isMoreStatus(status) ? '-active' : ''}`}
            value={isMoreStatus(status) ? status : ''}
            onChange={(e) => {
              const v = e.target.value
              if (v) setStatus(v as MapStatusFilter)
            }}
            disabled={!authReady || !loggedIn}
            title="Другие категории"
            aria-label="Другие категории"
          >
            <option value="">{isMoreStatus(status) ? 'Другие…' : 'Ещё…'}</option>
            {MORE_STATUS_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="tabs-inline maps-modes">
          {MODE_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`tab-btn ${mode === o.id ? '-active' : ''}`}
              onClick={() => setMode(o.id)}
              disabled={!authReady || !loggedIn}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      <div className="maps-page-scroll">
        {!authReady ? (
          <div className="empty-state">
            <Loader2 size={18} className="spin" />
            <p>Проверка входа…</p>
          </div>
        ) : !loggedIn ? (
          <div className="empty-state">
            <LogIn size={22} strokeWidth={1.5} style={{ opacity: 0.45 }} />
            <p>Войдите, чтобы искать карты</p>
          </div>
        ) : loading && sets.length === 0 ? (
          <div className="empty-state">
            <Loader2 size={18} className="spin" />
            <p>Поиск…</p>
          </div>
        ) : error && sets.length === 0 ? (
          <div className="empty-state">
            <p>{error}</p>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 10 }}
              disabled={rateLimitActive}
              onClick={() => void fetchPage(debouncedQuery, mode, status, language, false, null, 0)}
            >
              Повторить
            </button>
          </div>
        ) : sets.length === 0 ? (
          <div className="empty-state">
            <MapIcon size={22} strokeWidth={1.5} style={{ opacity: 0.45 }} />
            <p>Ничего не найдено</p>
          </div>
        ) : (
          <>
            <div className={`maps-list ${loading && !loadingMore ? '-dim' : ''}`}>
              {sets.map((set) => (
                <MapRow
                  key={set.id}
                  set={set}
                  owned={localIds.has(set.id)}
                  download={downloads[set.id]}
                  previewPlaying={previewId === set.id}
                  onTogglePreview={togglePreview}
                  canDownload={canDownload && !rateLimitActive}
                  onDownload={handleDownload}
                  onCancel={handleCancel}
                />
              ))}
            </div>

            <div className="maps-load-more">
              {loadingMore ? (
                <div className="maps-load-more-status">
                  <Loader2 size={14} className="spin" />
                  Загрузка…
                </div>
              ) : rateLimitActive ? (
                <div className="maps-load-more-status -done">Лимит — ~{rateLimitSec}с</div>
              ) : hasMore ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={loading || loadingMore}
                  onClick={() => loadMore()}
                >
                  Показать ещё
                </button>
              ) : (
                <div className="maps-load-more-status -done">Все загружено</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
