import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FolderOpen,
  Loader2,
  LogIn,
  LogOut,
  Map as MapIcon,
  Pause,
  Play,
  Search,
  Volume2,
  VolumeX,
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
import {
  createPreviewRuntime,
  drawPreviewFrame,
  parseOsu,
  resetPreviewRuntime,
  type ParsedBeatmap,
  type PreviewRuntime,
} from '../lib/osu-preview'
import { useI18n } from '../i18n/context'
import { DiffIcon } from '../components/DiffIcon'
import { normalizeOsuMode } from '../lib/osu-diff'
import './MapsPage.css'

interface Props {
  visible?: boolean
  /** Compact layout for always-on-top overlay window */
  overlay?: boolean
  onToast: (msg: string, type: 'success' | 'error') => void
  onOpenSettings?: () => void
  account?: OsuAccountInfo | null
  authBusy?: boolean
  onLogin?: () => Promise<OsuAccountInfo>
  onLogout?: () => Promise<OsuAccountInfo>
}

const PAGE_SIZE = 24
/** Min gap between search requests (osu rate limit ~60/min). */
const SEARCH_COOLDOWN_MS = 1200
/** After 429, pause auto-load this long. */
const RATE_LIMIT_COOLDOWN_MS = 45_000

function pluralizeDiffs(n: number, lang: string): string {
  if (lang === 'en') {
    return `${n} ${n === 1 ? 'difficulty' : 'difficulties'}`
  }
  const abs = Math.abs(n) % 100
  const rem = abs % 10
  if (abs > 10 && abs < 20) return `${n} сложностей`
  if (rem > 1 && rem < 5) return `${n} сложности`
  if (rem === 1) return `${n} сложность`
  return `${n} сложностей`
}

const MODE_OPTIONS = (lang: string): { id: MapModeFilter; label: string }[] => [
  { id: 'any', label: lang === 'en' ? 'All' : 'Все' },
  { id: 'osu', label: 'osu!' },
  { id: 'taiko', label: 'Taiko' },
  { id: 'fruits', label: 'Catch' },
  { id: 'mania', label: 'Mania' },
]

const MAIN_STATUS_OPTIONS = (lang: string): { id: MapStatusFilter; label: string }[] => [
  { id: 'ranked', label: 'Ranked' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'loved', label: 'Loved' },
  { id: 'any', label: lang === 'en' ? 'Any' : 'Любой' },
]

const MORE_STATUS_OPTIONS = (lang: string): { id: MapStatusFilter; label: string }[] => [
  { id: 'pending', label: lang === 'en' ? 'Pending' : 'На рассмотрении' },
  { id: 'wip', label: lang === 'en' ? 'WIP' : 'В разработке' },
  { id: 'graveyard', label: 'Graveyard' },
  { id: 'favourites', label: lang === 'en' ? 'Favourites' : 'Избранное' },
  { id: 'mine', label: lang === 'en' ? 'My Maps' : 'Мои карты' },
]

const MORE_STATUS_IDS: MapStatusFilter[] = ['pending', 'wip', 'graveyard', 'favourites', 'mine']

function isMoreStatus(id: MapStatusFilter): boolean {
  return MORE_STATUS_IDS.includes(id)
}

const LANGUAGE_OPTIONS = (lang: string): { id: MapLanguageFilter; label: string }[] => [
  { id: 'any', label: lang === 'en' ? 'Any language' : 'Любой язык' },
  { id: 'english', label: 'English' },
  { id: 'japanese', label: 'Japanese' },
  { id: 'chinese', label: 'Chinese' },
  { id: 'korean', label: 'Korean' },
  { id: 'russian', label: lang === 'en' ? 'Russian' : 'Русский' },
  { id: 'instrumental', label: 'Instrumental' },
  { id: 'french', label: 'French' },
  { id: 'german', label: 'German' },
  { id: 'spanish', label: 'Spanish' },
  { id: 'italian', label: 'Italian' },
  { id: 'swedish', label: 'Swedish' },
  { id: 'polish', label: 'Polish' },
  { id: 'unspecified', label: lang === 'en' ? 'Unspecified' : 'Не указан' },
  { id: 'other', label: lang === 'en' ? 'Other' : 'Другой' },
]

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
  activeMode: MapModeFilter
  owned: boolean
  download: MapDownloadProgress | undefined
  canDownload: boolean
  previewPlaying: boolean
  lang: string
  onTogglePreview: (set: MapSetSummary) => void
  onGameplayPreview: (set: MapSetSummary) => void
  onDownload: (set: MapSetSummary) => void
  onCancel: (setId: number) => void
}

const MapRow = memo(function MapRow({
  set,
  activeMode,
  owned,
  download,
  canDownload,
  previewPlaying,
  lang,
  onTogglePreview,
  onGameplayPreview,
  onDownload,
  onCancel,
}: MapRowProps) {
  const busy = isBusyPhase(download?.phase)
  const pct = download?.progress ?? 0
  const cover = set.listCoverUrl || set.coverUrl
  const canPreview = Boolean(set.previewUrl)
  const canGp = Boolean(set.beatmaps?.length)

  const matchingBeatmaps =
    activeMode !== 'any'
      ? (set.beatmaps || []).filter((b) => normalizeOsuMode(b.mode) === activeMode)
      : set.beatmaps || []
  const displayBeatmaps = matchingBeatmaps.length > 0 ? matchingBeatmaps : set.beatmaps || []
  const totalDiffCount = set.beatmaps?.length || (set.modes?.length ? 1 : 0)
  const countLabel = pluralizeDiffs(
    activeMode !== 'any' && matchingBeatmaps.length > 0 ? matchingBeatmaps.length : totalDiffCount,
    lang
  )


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
          <span className="map-diffs-count">{countLabel}</span>
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
        {displayBeatmaps.length > 0 && (
          <div className="map-diff-icons-row" title={countLabel}>
            {displayBeatmaps.map((b) => (
              <DiffIcon
                key={b.id}
                mode={b.mode}
                stars={b.stars}
                size={14}
                title={`${b.version} (${(b.stars || 0).toFixed(2)}★)`}
                className="map-diff-item-icon"
              />
            ))}
          </div>
        )}
      </div>
      <div className="map-actions">
        <button
          type="button"
          className={`btn btn-ghost btn-sm map-preview-btn ${previewPlaying ? '-playing' : ''}`}
          disabled={!canPreview}
          onClick={() => onTogglePreview(set)}
          title={previewPlaying ? (lang === 'en' ? 'Pause' : 'Пауза') : (lang === 'en' ? 'Listen' : 'Слушать')}
          aria-label={previewPlaying ? (lang === 'en' ? 'Pause' : 'Пауза') : (lang === 'en' ? 'Preview' : 'Слушать превью')}
        >
          {previewPlaying ? <Pause size={14} strokeWidth={2} /> : <Play size={14} strokeWidth={2} />}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm map-preview-btn"
          disabled={!canGp}
          onClick={() => onGameplayPreview(set)}
          title={lang === 'en' ? 'Preview map gameplay' : 'Предпросмотр карты'}
          aria-label={lang === 'en' ? 'Preview map gameplay' : 'Предпросмотр карты'}
        >
          <Eye size={14} strokeWidth={2} />
        </button>
        {owned ? (
          <button type="button" className="btn btn-ghost btn-sm map-dl-btn -owned" disabled>
            <Check size={14} strokeWidth={2} />
            {lang === 'en' ? 'Owned' : 'Есть'}
          </button>
        ) : busy ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm map-dl-btn -busy"
            onClick={() => onCancel(set.id)}
            title={lang === 'en' ? 'Cancel' : 'Отменить'}
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
            {lang === 'en' ? 'Download' : 'Скачать'}
          </button>
        )}
      </div>
      {busy && <div className="map-row-progress" style={{ width: `${Math.max(4, pct)}%` }} />}
    </div>
  )
})


const VOL_KEY = 'tosu-gui-preview-volume'
const MUTE_OSU_KEY = 'tosu-gui-mute-osu-on-preview'

function loadStoredVolume(): number {
  try {
    const v = parseFloat(localStorage.getItem(VOL_KEY) || '0.55')
    if (!Number.isFinite(v)) return 0.55
    return Math.min(1, Math.max(0, v))
  } catch {
    return 0.55
  }
}

function loadStoredMuteOsu(): boolean {
  try {
    const v = localStorage.getItem(MUTE_OSU_KEY)
    if (v === '0' || v === 'false') return false
    return true
  } catch {
    return true
  }
}

export function MapsPage({
  visible = true,
  overlay = false,
  onToast,
  onOpenSettings,
  account: propAccount,
  authBusy: propAuthBusy,
  onLogin: propOnLogin,
  onLogout: propOnLogout,
}: Props) {
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
  const [internalAccount, setInternalAccount] = useState<OsuAccountInfo | null>(() => {
    try {
      const raw = localStorage.getItem('tosu_cached_osu_account')
      if (raw) {
        const parsed = JSON.parse(raw) as OsuAccountInfo
        if (parsed && typeof parsed.loggedIn === 'boolean') {
          return parsed
        }
      }
    } catch {}
    return null
  })
  /** false until first auth status check finishes — avoids "not logged in" flash */
  const [authReady, setAuthReady] = useState(false)
  const [internalAuthBusy, setInternalAuthBusy] = useState(false)

  const account = propAccount !== undefined ? propAccount : internalAccount
  const authBusy = propAuthBusy !== undefined ? propAuthBusy : internalAuthBusy
  const [rateLimitedUntil, setRateLimitedUntil] = useState(0)
  const [previewId, setPreviewId] = useState<number | null>(null)
  const [previewPaused, setPreviewPaused] = useState(false)
  const [previewProgress, setPreviewProgress] = useState(0)
  const [volume, setVolume] = useState(loadStoredVolume)
  const [muteOsu, setMuteOsu] = useState(loadStoredMuteOsu)
  const [gpOpen, setGpOpen] = useState(false)
  const [gpSet, setGpSet] = useState<MapSetSummary | null>(null)
  const [gpBeatmapId, setGpBeatmapId] = useState(0)
  const [gpStatus, setGpStatus] = useState('')
  const [gpLoading, setGpLoading] = useState(false)

  const notifyPreview = useCallback((active: boolean, key = 'gui-player') => {
    if (window.tosuGui?.setOsuPreviewActive) {
      void window.tosuGui.setOsuPreviewActive(active, key)
    }
  }, [])

  const toggleMuteOsu = useCallback(() => {
    setMuteOsu((prev) => {
      const next = !prev
      try {
        localStorage.setItem(MUTE_OSU_KEY, next ? '1' : '0')
      } catch {}
      if (window.tosuGui?.setOsuAutoMute) {
        void window.tosuGui.setOsuAutoMute(next)
      }
      return next
    })
  }, [])

  useEffect(() => {
    if (window.tosuGui?.getOsuAudioState) {
      void window.tosuGui.getOsuAudioState().then((st) => {
        if (st && typeof st.autoMute === 'boolean') {
          setMuteOsu(st.autoMute)
          try {
            localStorage.setItem(MUTE_OSU_KEY, st.autoMute ? '1' : '0')
          } catch {}
        }
      })
    }
  }, [])

  const searchSeq = useRef(0)
  const inFlightRef = useRef(false)
  const cursorRef = useRef<string | null>(null)
  const pageIndexRef = useRef(0)
  const lastSearchAtRef = useRef(0)
  const rateLimitedUntilRef = useRef(0)
  const authBootstrapped = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const volumeRef = useRef(volume)
  const setsRef = useRef(sets)
  const gpCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const gpRafRef = useRef(0)
  const gpAudioRef = useRef<HTMLAudioElement | null>(null)
  const gpDataRef = useRef<ParsedBeatmap | null>(null)
  const gpStartRef = useRef(0)
  const gpRuntimeRef = useRef<PreviewRuntime>(createPreviewRuntime(loadStoredVolume()))
  const loggedIn = Boolean(account?.loggedIn)

  useEffect(() => {
    volumeRef.current = volume
    if (audioRef.current) audioRef.current.volume = volume
    if (gpAudioRef.current) gpAudioRef.current.volume = volume
    gpRuntimeRef.current.volume = volume
  }, [volume])

  useEffect(() => {
    setsRef.current = sets
  }, [sets])

  const stopPreview = useCallback(() => {
    notifyPreview(false, 'gui-player')
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    setPreviewId(null)
    setPreviewPaused(false)
    setPreviewProgress(0)
  }, [notifyPreview])

  const playSet = useCallback(
    (mapSet: MapSetSummary) => {
      const primaryUrl = mapSet.previewUrl || `https://b.ppy.sh/preview/${mapSet.id}.mp3`
      const fallbackUrl = `https://catboy.best/preview/audio/${mapSet.id}`
      let audio = audioRef.current
      if (!audio) {
        audio = new Audio()
        audio.preload = 'auto'
        audio.addEventListener('ended', () => {
          notifyPreview(false, 'gui-player')
          setPreviewId(null)
          setPreviewPaused(false)
          setPreviewProgress(0)
        })
        audio.addEventListener('timeupdate', () => {
          const a = audioRef.current
          if (!a || !a.duration) return
          setPreviewProgress(a.currentTime / a.duration)
        })
        audioRef.current = audio
      }
      try {
        audio.pause()
        const vol = volumeRef.current > 0 ? volumeRef.current : 0.65
        audio.volume = vol
        audio.onerror = () => {
          notifyPreview(false, 'gui-player')
          if (audio && audio.src !== fallbackUrl) {
            audio.src = fallbackUrl
            void audio.play().then(() => {
              notifyPreview(true, 'gui-player')
            }).catch(() => {
              notifyPreview(false, 'gui-player')
              setPreviewId(null)
              setPreviewPaused(false)
              onToast('Не удалось воспроизвести превью', 'error')
            })
          } else {
            notifyPreview(false, 'gui-player')
            setPreviewId(null)
            setPreviewPaused(false)
            onToast('Не удалось воспроизвести превью', 'error')
          }
        }
        audio.src = primaryUrl
        setPreviewId(mapSet.id)
        setPreviewPaused(false)
        setPreviewProgress(0)
        void audio.play().then(() => {
          notifyPreview(true, 'gui-player')
        }).catch(() => {
          if (audio && audio.src !== fallbackUrl) {
            audio.src = fallbackUrl
            void audio.play().then(() => {
              notifyPreview(true, 'gui-player')
            }).catch(() => {
              notifyPreview(false, 'gui-player')
              setPreviewId(null)
              setPreviewPaused(false)
              onToast('Не удалось воспроизвести превью', 'error')
            })
          } else {
            notifyPreview(false, 'gui-player')
          }
        })
      } catch {
        notifyPreview(false, 'gui-player')
        setPreviewId(null)
        onToast('Не удалось воспроизвести превью', 'error')
      }
    },
    [onToast, notifyPreview]
  )

  const togglePreview = useCallback(
    (mapSet: MapSetSummary) => {
      if (previewId === mapSet.id) {
        const audio = audioRef.current
        if (!audio) return
        if (previewPaused || audio.paused) {
          setPreviewPaused(false)
          notifyPreview(true, 'gui-player')
          void audio.play().catch(() => stopPreview())
        } else {
          audio.pause()
          setPreviewPaused(true)
          notifyPreview(false, 'gui-player')
        }
        return
      }
      playSet(mapSet)
    },
    [previewId, previewPaused, playSet, stopPreview, notifyPreview]
  )

  const playAdjacent = useCallback(
    (delta: number) => {
      const list = setsRef.current
      if (!list.length) return
      let idx = list.findIndex((s) => s.id === previewId)
      if (idx < 0) idx = 0
      else idx = (idx + delta + list.length) % list.length
      playSet(list[idx])
    },
    [previewId, playSet]
  )

  const setVolumePersist = useCallback((v: number) => {
    const next = Math.min(1, Math.max(0, v))
    setVolume(next)
    try {
      localStorage.setItem(VOL_KEY, String(next))
    } catch {
      /* ignore */
    }
  }, [])

  const stopGameplay = useCallback(() => {
    notifyPreview(false, 'gui-gameplay')
    if (gpRafRef.current) {
      cancelAnimationFrame(gpRafRef.current)
      gpRafRef.current = 0
    }
    if (gpAudioRef.current) {
      try {
        gpAudioRef.current.pause()
        gpAudioRef.current.removeAttribute('src')
        gpAudioRef.current.load()
      } catch {
        /* ignore */
      }
      gpAudioRef.current = null
    }
    gpDataRef.current = null
  }, [notifyPreview])

  const closeGameplay = useCallback(() => {
    stopGameplay()
    setGpOpen(false)
    setGpSet(null)
    setGpBeatmapId(0)
    setGpStatus('')
    setGpLoading(false)
  }, [stopGameplay])

  const gpAudioSyncRef = useRef<{ audioStartPerf: number; lastAudioSec: number }>({
    audioStartPerf: 0,
    lastAudioSec: 0,
  })

  const drawGameplay = useCallback(
    (now: number) => {
      const canvas = gpCanvasRef.current
      const data = gpDataRef.current
      if (!canvas || !data) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const audio = gpAudioRef.current
      let elapsed = 0

      if (audio && !audio.paused && !audio.ended && Number.isFinite(audio.currentTime) && audio.currentTime > 0) {
        const curSec = audio.currentTime
        if (curSec !== gpAudioSyncRef.current.lastAudioSec) {
          gpAudioSyncRef.current.lastAudioSec = curSec
          gpAudioSyncRef.current.audioStartPerf = now - curSec * 1000
        }
        elapsed = Math.max(0, now - gpAudioSyncRef.current.audioStartPerf)
      } else {
        elapsed = Math.max(0, now - gpStartRef.current)
      }

      const t = data.previewTime + elapsed
      const cont = drawPreviewFrame(
        ctx,
        data,
        canvas.width,
        canvas.height,
        t,
        elapsed,
        gpRuntimeRef.current
      )

      if (!cont || (audio && audio.ended)) {
        closeGameplay()
        return
      }
      gpRafRef.current = requestAnimationFrame(drawGameplay)
    },
    [closeGameplay]
  )

  const loadGameplayDiff = useCallback(
    async (beatmapId: number, mapSet: MapSetSummary) => {
      setGpLoading(true)
      setGpStatus('Загрузка карты…')
      setGpBeatmapId(beatmapId)
      stopGameplay()
      try {
        const result = await window.tosuGui.fetchBeatmapOsu(beatmapId)
        const parsed = parseOsu(result.content)
        gpDataRef.current = parsed
        resetPreviewRuntime(gpRuntimeRef.current, volumeRef.current)
        setGpStatus('')
        setGpLoading(false)
        const audio = new Audio()
        const vol = volumeRef.current > 0 ? volumeRef.current : 0.65
        audio.volume = vol
        audio.preload = 'auto'
        const primaryUrl = mapSet.previewUrl || `https://b.ppy.sh/preview/${mapSet.id}.mp3`
        const fallbackUrl = `https://catboy.best/preview/audio/${mapSet.id}`
        audio.src = primaryUrl
        audio.addEventListener('error', () => {
          if (audio.src !== fallbackUrl) {
            audio.src = fallbackUrl
            void audio.play().catch(() => {})
          }
        })
        gpAudioRef.current = audio
        const now = performance.now()
        gpStartRef.current = now
        gpAudioSyncRef.current = { audioStartPerf: now, lastAudioSec: 0 }
        audio.addEventListener('playing', () => {
          notifyPreview(true, 'gui-gameplay')
          const pNow = performance.now()
          const cur = audio.currentTime || 0
          gpStartRef.current = pNow - cur * 1000
          gpAudioSyncRef.current = { audioStartPerf: pNow - cur * 1000, lastAudioSec: cur }
        })
        void audio.play().catch(() => {})
        gpRafRef.current = requestAnimationFrame(drawGameplay)
      } catch (err) {
        setGpLoading(false)
        setGpStatus(err instanceof Error ? err.message : 'Ошибка загрузки карты')
      }
    },
    [stopGameplay, drawGameplay, notifyPreview]
  )

  const openGameplayPreview = useCallback(
    (mapSet: MapSetSummary) => {
      const bms = mapSet.beatmaps || []
      if (!bms.length) {
        onToast('Нет сложностей для превью', 'error')
        return
      }
      stopPreview()
      stopGameplay()
      const pick =
        bms.find((b) => b.mode === 'osu' || b.mode === '0') ||
        bms[Math.floor(bms.length / 2)] ||
        bms[0]
      setGpSet(mapSet)
      setGpOpen(true)
      void loadGameplayDiff(pick.id, mapSet)
    },
    [onToast, stopPreview, stopGameplay, loadGameplayDiff]
  )

  // Stop preview when leaving the page or unmounting
  useEffect(() => {
    if (!visible) {
      stopPreview()
      closeGameplay()
    }
  }, [visible, stopPreview, closeGameplay])

  useEffect(() => {
    return () => {
      const audio = audioRef.current
      if (audio) {
        audio.pause()
        audio.removeAttribute('src')
        audioRef.current = null
      }
      stopGameplay()
    }
  }, [stopGameplay])

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
      if (propAccount === undefined) {
        setInternalAccount(info)
        try {
          if (info.loggedIn) localStorage.setItem('tosu_cached_osu_account', JSON.stringify(info))
          else localStorage.removeItem('tosu_cached_osu_account')
        } catch {}
      }
      return info
    } catch {
      return null
    } finally {
      setAuthReady(true)
    }
  }, [propAccount])

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
    if (propOnLogin) {
      try {
        await propOnLogin()
      } catch {
        /* handled by parent */
      }
      return
    }
    setInternalAuthBusy(true)
    try {
      const info = await window.tosuGui.loginOsu()
      setInternalAccount(info)
      try {
        if (info.loggedIn) localStorage.setItem('tosu_cached_osu_account', JSON.stringify(info))
        else localStorage.removeItem('tosu_cached_osu_account')
      } catch {}
      if (info.loggedIn) {
        onToast(info.username ? `Вошли как ${info.username}` : 'Вход выполнен', 'success')
      } else {
        onToast('Вход не выполнен', 'error')
      }
    } catch (err) {
      onToast(cleanIpcError(err) || 'Ошибка входа', 'error')
    } finally {
      setInternalAuthBusy(false)
    }
  }

  const handleLogout = async () => {
    if (propOnLogout) {
      try {
        await propOnLogout()
      } catch {
        /* handled by parent */
      }
    } else {
      setInternalAuthBusy(true)
      try {
        const info = await window.tosuGui.logoutOsu()
        setInternalAccount(info)
        try {
          localStorage.removeItem('tosu_cached_osu_account')
        } catch {}
        onToast('Вышли из osu!', 'success')
      } catch {
        onToast('Не удалось выйти', 'error')
      } finally {
        setInternalAuthBusy(false)
      }
    }
    setSets([])
    setCursor(null)
    cursorRef.current = null
    setHasMore(false)
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

  const { lang } = useI18n()

  const currentModeOptions = MODE_OPTIONS(lang)
  const currentMainStatusOptions = MAIN_STATUS_OPTIONS(lang)
  const currentMoreStatusOptions = MORE_STATUS_OPTIONS(lang)
  const currentLanguageOptions = LANGUAGE_OPTIONS(lang)

  return (
    <div className={`page maps-page${overlay ? ' -overlay' : ''}`}>
      <div className="maps-page-top">
        <div className="page-header maps-header">
          <div>
            <h1 className="page-title">{lang === 'en' ? 'Beatmaps' : 'Карты'}</h1>
            <p className="page-subtitle">
              {overlay
                ? (lang === 'en' ? 'osu.ppy.sh · overlay mode' : 'osu.ppy.sh · поверх игры')
                : (lang === 'en' ? 'Official osu.ppy.sh (login required)' : 'Официально с osu.ppy.sh (нужен вход)')}
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
                title={account?.username || (lang === 'en' ? 'Log out' : 'Выйти')}
              >
                {authBusy ? <Loader2 size={14} className="spin" /> : <LogOut size={14} strokeWidth={1.8} />}
                {account?.username || (lang === 'en' ? 'Log out' : 'Выйти')}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={authBusy}
                onClick={() => void handleLogin()}
              >
                {authBusy ? <Loader2 size={14} className="spin" /> : <LogIn size={14} strokeWidth={1.8} />}
                {lang === 'en' ? 'Log in' : 'Войти'}
              </button>
            )}
            <button
              type="button"
              className={`btn btn-sm ${songsPath ? 'btn-ghost' : 'btn-primary'}`}
              onClick={handleSongsClick}
              title={songsPath ? (lang === 'en' ? 'Open Songs folder' : 'Открыть Songs') : (lang === 'en' ? 'Choose Songs folder' : 'Указать папку Songs')}
            >
              <FolderOpen size={14} strokeWidth={1.8} />
              Songs
            </button>
          </div>
        </div>

        {authReady && !loggedIn && (
          <div className="maps-banner">
            <div className="maps-banner-text">
              <strong>{lang === 'en' ? 'Log in to osu!' : 'Войдите в osu!'}</strong>
              <span>{lang === 'en' ? 'Search and downloads work via your official osu.ppy.sh account' : 'Поиск и скачивание идут с osu.ppy.sh под вашим аккаунтом'}</span>
            </div>
            <div className="maps-banner-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={authBusy}
                onClick={() => void handleLogin()}
              >
                {authBusy ? <Loader2 size={14} className="spin" /> : <LogIn size={14} strokeWidth={1.8} />}
                {lang === 'en' ? 'Log in' : 'Войти'}
              </button>
            </div>
          </div>
        )}

        {authReady && loggedIn && !songsPath && (
          <div className="maps-banner">
            <div className="maps-banner-text">
              <strong>{lang === 'en' ? 'Songs folder required' : 'Нужна папка Songs'}</strong>
              <span>{lang === 'en' ? 'Where to save .osz (usually %LocalAppData%\\osu!\\Songs)' : 'Куда складывать .osz (обычно %LocalAppData%\\osu!\\Songs)'}</span>
            </div>
            <div className="maps-banner-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={() => void handlePickSongs()}>
                {lang === 'en' ? 'Choose folder' : 'Выбрать папку'}
              </button>
              {onOpenSettings && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenSettings}>
                  {lang === 'en' ? 'Settings' : 'Настройки'}
                </button>
              )}
            </div>
          </div>
        )}

        {rateLimitActive && (
          <div className="maps-banner maps-banner-warn">
            <div className="maps-banner-text">
              <strong>{lang === 'en' ? 'osu! Rate Limit' : 'Лимит osu!'}</strong>
              <span>{lang === 'en' ? `Please wait ~${rateLimitSec}s — too many requests` : `Подождите ~${rateLimitSec}с — слишком много запросов подряд`}</span>
            </div>
          </div>
        )}

        <div className="maps-toolbar">
          <div className="maps-search">
            <Search size={15} strokeWidth={1.8} className="maps-search-icon" />
            <input
              className="glass-input maps-search-input"
              placeholder={lang === 'en' ? 'Title, artist, mapper…' : 'Название, артист, mapper…'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              spellCheck={false}
              disabled={!authReady || !loggedIn}
            />
            {query ? (
              <button
                type="button"
                className="maps-search-clear"
                title={lang === 'en' ? 'Clear' : 'Очистить'}
                aria-label={lang === 'en' ? 'Clear search' : 'Очистить поиск'}
                disabled={!authReady || !loggedIn}
                onClick={() => setQuery('')}
              >
                <X size={14} strokeWidth={1.8} />
              </button>
            ) : null}
          </div>
          <select
            className="glass-input maps-select maps-select-lang"
            value={language}
            onChange={(e) => setLanguage(e.target.value as MapLanguageFilter)}
            disabled={!authReady || !loggedIn}
            title={lang === 'en' ? 'Language' : 'Язык'}
            aria-label={lang === 'en' ? 'Language' : 'Язык'}
          >
            {currentLanguageOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="maps-filter-row">
          <div className="tabs-inline maps-statuses">
            {currentMainStatusOptions.map((o) => (
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
            title={lang === 'en' ? 'More categories' : 'Другие категории'}
            aria-label={lang === 'en' ? 'More categories' : 'Другие категории'}
          >
            <option value="">{isMoreStatus(status) ? (lang === 'en' ? 'Other…' : 'Другие…') : (lang === 'en' ? 'More…' : 'Ещё…')}</option>
            {currentMoreStatusOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="tabs-inline maps-modes">
          {currentModeOptions.map((o) => (
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
            <Loader2 size={22} className="spin" />
            <p>{lang === 'en' ? 'Checking osu! login…' : 'Проверка входа в osu!…'}</p>
          </div>
        ) : !loggedIn ? (
          <div className="empty-state">
            <LogIn size={26} strokeWidth={1.5} style={{ opacity: 0.55 }} />
            <p>{lang === 'en' ? 'Log in to search and download maps' : 'Войдите, чтобы искать и скачивать карты'}</p>
            <span className="empty-state-subtitle">{lang === 'en' ? 'Search and downloads work through your official osu! account' : 'Поиск и загрузка работают через ваш официальный аккаунт'}</span>
          </div>
        ) : loading && sets.length === 0 ? (
          <div className="empty-state">
            <Loader2 size={22} className="spin" />
            <p>{lang === 'en' ? 'Searching beatmaps…' : 'Поиск карт…'}</p>
          </div>
        ) : error && sets.length === 0 ? (
          <div className="empty-state">
            <AlertCircle size={26} strokeWidth={1.5} style={{ color: 'var(--danger)', opacity: 0.8 }} />
            <p>{error}</p>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ marginTop: 6 }}
              disabled={rateLimitActive}
              onClick={() => void fetchPage(debouncedQuery, mode, status, language, false, null, 0)}
            >
              {lang === 'en' ? 'Retry search' : 'Повторить поиск'}
            </button>
          </div>
        ) : sets.length === 0 ? (
          <div className="empty-state">
            <MapIcon size={26} strokeWidth={1.5} style={{ opacity: 0.45 }} />
            <p>{lang === 'en' ? 'No beatmaps found' : 'Карты не найдены'}</p>
            <span className="empty-state-subtitle">{lang === 'en' ? 'Try adjusting your search query or filters' : 'Попробуйте изменить запрос или фильтры'}</span>
          </div>
        ) : (
          <>
            <div className={`maps-list ${loading && !loadingMore ? '-dim' : ''}`}>
              {sets.map((set) => (
                <MapRow
                  key={set.id}
                  set={set}
                  activeMode={mode}
                  owned={localIds.has(set.id)}
                  download={downloads[set.id]}
                  previewPlaying={previewId === set.id && !previewPaused}
                  onTogglePreview={togglePreview}
                  onGameplayPreview={openGameplayPreview}
                  canDownload={canDownload && !rateLimitActive}
                  onDownload={handleDownload}
                  onCancel={handleCancel}
                  lang={lang}
                />
              ))}
            </div>

            <div className="maps-load-more">
              {loadingMore ? (
                <div className="maps-load-more-status">
                  <Loader2 size={14} className="spin" />
                  {lang === 'en' ? 'Loading…' : 'Загрузка…'}
                </div>
              ) : rateLimitActive ? (
                <div className="maps-load-more-status -done">{lang === 'en' ? `Limit — ~${rateLimitSec}s` : `Лимит — ~${rateLimitSec}с`}</div>
              ) : hasMore ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={loading || loadingMore}
                  onClick={() => loadMore()}
                >
                  {lang === 'en' ? 'Show more' : 'Показать ещё'}
                </button>
              ) : (
                <div className="maps-load-more-status -done">{lang === 'en' ? 'All loaded' : 'Все загружено'}</div>
              )}
            </div>
          </>
        )}
      </div>

      <div className={`maps-miniplayer ${previewId ? '-active' : ''}`}>
        <div
          className="maps-miniplayer-bar"
          onClick={(e) => {
            const audio = audioRef.current
            if (!audio?.duration) return
            const rect = e.currentTarget.getBoundingClientRect()
            const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
            audio.currentTime = ratio * audio.duration
            setPreviewProgress(ratio)
          }}
        >
          <div className="maps-miniplayer-progress" style={{ width: `${previewProgress * 100}%` }} />
        </div>
        <div className="maps-miniplayer-body">
          <div className="maps-miniplayer-cover">
            {(() => {
              const cur = sets.find((s) => s.id === previewId)
              const cover = cur?.listCoverUrl || cur?.coverUrl
              return cover ? <img src={cover} alt="" draggable={false} /> : null
            })()}
          </div>
          <div className="maps-miniplayer-meta">
            <div className="maps-miniplayer-title">
              {(() => {
                const cur = sets.find((s) => s.id === previewId)
                return cur ? `${cur.artist} — ${cur.title}` : (lang === 'en' ? 'No track' : 'Нет трека')
              })()}
            </div>
            <div className="maps-miniplayer-sub">
              {(() => {
                const cur = sets.find((s) => s.id === previewId)
                return cur ? cur.creator : (lang === 'en' ? 'Select a beatmap to listen' : 'Выберите карту для прослушивания')
              })()}
            </div>
          </div>
          <div className="maps-miniplayer-controls">
            <button
              type="button"
              className="btn btn-ghost btn-sm map-preview-btn"
              onClick={() => playAdjacent(-1)}
              title={lang === 'en' ? 'Previous' : 'Предыдущая'}
              disabled={!sets.length}
            >
              <ChevronLeft size={16} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm map-preview-btn"
              onClick={() => {
                if (previewId) {
                  const cur = sets.find((s) => s.id === previewId)
                  if (cur) togglePreview(cur)
                } else if (sets[0]) {
                  playSet(sets[0])
                }
              }}
              title={previewId && !previewPaused ? (lang === 'en' ? 'Pause' : 'Пауза') : (lang === 'en' ? 'Play' : 'Играть')}
              disabled={!sets.length}
            >
              {previewId && !previewPaused ? (
                <Pause size={14} strokeWidth={2} />
              ) : (
                <Play size={14} strokeWidth={2} />
              )}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm map-preview-btn"
              onClick={() => playAdjacent(1)}
              title={lang === 'en' ? 'Next' : 'Следующая'}
              disabled={!sets.length}
            >
              <ChevronRight size={16} strokeWidth={2} />
            </button>
          </div>
          <div className="maps-miniplayer-vol">
            <button
              type="button"
              className={`btn btn-sm maps-mute-toggle ${muteOsu ? '-on' : 'btn-ghost'}`}
              onClick={toggleMuteOsu}
              title={muteOsu ? (lang === 'en' ? 'Mute osu! during preview (enabled)' : 'Заглушать osu! при превью (включено)') : (lang === 'en' ? 'Mute osu! during preview (disabled)' : 'Заглушать osu! при превью (выключено)')}
              aria-pressed={muteOsu}
            >
              {muteOsu ? <VolumeX size={14} strokeWidth={1.8} /> : <Volume2 size={14} strokeWidth={1.8} />}
              <span>{lang === 'en' ? 'Mute osu!' : 'Глушить osu!'}</span>
            </button>
            <Volume2 size={14} strokeWidth={1.8} />
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(e) => setVolumePersist((parseInt(e.target.value, 10) || 0) / 100)}
              aria-label={lang === 'en' ? 'Volume' : 'Громкость'}
            />
            <span>{Math.round(volume * 100)}%</span>
          </div>
        </div>
      </div>

      {gpOpen && gpSet && (
        <div className="maps-gp-modal" role="dialog" aria-modal="true">
          <div className="maps-gp-backdrop" onClick={closeGameplay} />
          <div className="maps-gp-panel">
            <div className="maps-gp-head">
              <div className="maps-gp-head-text">
                <div className="maps-gp-title">
                  {gpSet.artist} — {gpSet.title}
                </div>
                <div className="maps-gp-sub">
                  {gpLoading ? (
                    <>
                      <Loader2 size={13} className="spin" />
                      <span>{gpStatus || (lang === 'en' ? 'Loading…' : 'Загрузка…')}</span>
                    </>
                  ) : (() => {

                    const bm = gpSet.beatmaps?.find((b) => b.id === gpBeatmapId)
                    if (!bm) return <span>{gpStatus}</span>
                    return (
                      <>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{bm.version}</span>
                        <span>·</span>
                        <DiffIcon mode={bm.mode} stars={bm.stars || 0} size={15} />
                        <span>{(bm.stars || 0).toFixed(2)}★</span>
                        {gpStatus ? (
                          <>
                            <span>·</span>
                            <span>{gpStatus}</span>
                          </>
                        ) : null}
                      </>
                    )
                  })()}
                </div>
              </div>
              <button type="button" className="btn btn-ghost btn-sm map-preview-btn" onClick={closeGameplay}>
                <X size={16} strokeWidth={2} />
              </button>
            </div>
            <div className="maps-gp-diffs">
              {(gpSet.beatmaps || []).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`tab-btn ${gpBeatmapId === b.id ? '-active' : ''}`}
                  onClick={() => void loadGameplayDiff(b.id, gpSet)}
                  disabled={gpLoading}
                >
                  <DiffIcon mode={b.mode} stars={b.stars || 0} size={18} />
                  {b.version}
                </button>
              ))}
            </div>
            <canvas ref={gpCanvasRef} className="maps-gp-canvas" width={640} height={480} />
          </div>
        </div>
      )}
    </div>
  )
}
