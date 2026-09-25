/**
 * Official osu.ppy.sh beatmap search + download (website session).
 * Cancelable downloads; no community mirrors.
 */
import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { app, dialog, BrowserWindow } from 'electron'
import {
  buildOsuHeaders,
  getOsuSession,
  hasOsuSessionCookie,
  OSU_ORIGIN,
  osuJsonGet,
  osuTextGet,
  USER_AGENT,
} from './osu-session'

const MIN_OSZ_BYTES = 8_000

export type MapModeFilter = 'any' | 'osu' | 'taiko' | 'fruits' | 'mania'
/** Official website search `s` values (osu.ppy.sh/beatmapsets). */
export type MapStatusFilter =
  | 'any'
  | 'ranked'
  | 'qualified'
  | 'loved'
  | 'favourites'
  | 'pending'
  | 'wip'
  | 'graveyard'
  | 'mine'

/** Official website search `l` language ids. */
export type MapLanguageFilter =
  | 'any'
  | 'unspecified'
  | 'english'
  | 'japanese'
  | 'chinese'
  | 'instrumental'
  | 'korean'
  | 'french'
  | 'german'
  | 'swedish'
  | 'spanish'
  | 'italian'
  | 'russian'
  | 'polish'
  | 'other'

export interface MapSearchParams {
  query?: string
  mode?: MapModeFilter
  status?: MapStatusFilter
  language?: MapLanguageFilter
  /** 0-based page for official search `page` param (1-based on wire) */
  page?: number
  limit?: number
  /** official cursor_string from previous response */
  cursor?: string | null
}

export interface MapBeatmapSummary {
  id: number
  version: string
  mode: string
  stars: number
  /** Total length in seconds when available */
  totalLength: number
}

export interface MapSetSummary {
  id: number
  artist: string
  title: string
  creator: string
  status: string
  bpm: number
  favouriteCount: number
  playCount: number
  coverUrl: string | null
  listCoverUrl: string | null
  /** Official ~10s clip (b.ppy.sh/preview/…) */
  previewUrl: string | null
  maxStars: number
  minStars: number
  modes: string[]
  hasVideo: boolean
  lastUpdated: string | null
  /** Difficulties for in-overlay gameplay preview (no download) */
  beatmaps: MapBeatmapSummary[]
}

export interface MapSearchResult {
  sets: MapSetSummary[]
  cursor: string | null
  hasMore: boolean
  total: number | null
}

export type MapDownloadPhase =
  | 'queued'
  | 'downloading'
  | 'installing'
  | 'done'
  | 'error'
  | 'cancelled'

export interface MapDownloadProgress {
  setId: number
  phase: MapDownloadPhase
  progress: number
  message?: string
  error?: string
  filePath?: string
}

const MODE_INT: Record<Exclude<MapModeFilter, 'any'>, number> = {
  osu: 0,
  taiko: 1,
  fruits: 2,
  mania: 3,
}

/** official search `s` status filter */
const STATUS_PARAM: Record<Exclude<MapStatusFilter, 'any'>, string> = {
  ranked: 'ranked',
  qualified: 'qualified',
  loved: 'loved',
  favourites: 'favourites',
  pending: 'pending',
  wip: 'wip',
  graveyard: 'graveyard',
  mine: 'mine',
}

/** official search `l` language filter (omit when any) */
const LANGUAGE_PARAM: Record<Exclude<MapLanguageFilter, 'any'>, number> = {
  unspecified: 1,
  english: 2,
  japanese: 3,
  chinese: 4,
  instrumental: 5,
  korean: 6,
  french: 7,
  german: 8,
  swedish: 9,
  spanish: 10,
  italian: 11,
  russian: 12,
  polish: 13,
  other: 14,
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : fallback
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : v == null ? fallback : String(v)
}

function parseMode(raw: Record<string, unknown>): string {
  const m = raw.mode ?? raw.Mode ?? raw.mode_int ?? raw.ruleset_id ?? raw.RulesetID
  if (m === 0 || m === '0' || m === 'osu' || m === 'standard') return 'osu'
  if (m === 1 || m === '1' || m === 'taiko') return 'taiko'
  if (m === 2 || m === '2' || m === 'fruits' || m === 'ctb' || m === 'catch') return 'fruits'
  if (m === 3 || m === '3' || m === 'mania') return 'mania'
  if (typeof m === 'string' && m.trim()) {
    const s = m.trim().toLowerCase()
    if (s === '0' || s === 'osu' || s === 'standard') return 'osu'
    if (s === '1' || s === 'taiko') return 'taiko'
    if (s === '2' || s === 'fruits' || s === 'ctb' || s === 'catch') return 'fruits'
    if (s === '3' || s === 'mania') return 'mania'
    return s
  }
  return 'osu'
}

function normalizeBeatmap(raw: Record<string, unknown>): MapBeatmapSummary | null {
  const id = num(raw.id ?? raw.beatmap_id ?? raw.BeatmapID)
  if (!id) return null
  return {
    id,
    version: str(raw.version ?? raw.Version ?? raw.difficulty_name, 'Normal'),
    mode: parseMode(raw),
    stars: Math.round(num(raw.difficulty_rating ?? raw.DifficultyRating ?? raw.stars) * 100) / 100,
    totalLength: Math.round(num(raw.total_length ?? raw.TotalLength ?? raw.hit_length)),
  }
}

function normalizeSet(raw: Record<string, unknown>): MapSetSummary | null {
  const id = num(raw.id ?? raw.SetID ?? raw.set_id ?? raw.beatmapset_id)
  if (!id) return null

  const beatmapsRaw = Array.isArray(raw.beatmaps) ? (raw.beatmaps as Record<string, unknown>[]) : []
  const beatmaps = beatmapsRaw
    .map(normalizeBeatmap)
    .filter((b): b is MapBeatmapSummary => b != null)
    .sort((a, b) => a.stars - b.stars)
  const stars = beatmaps.map((b) => b.stars).filter((s) => s > 0)
  const setMode = parseMode(raw)
  const rawModes = [...new Set(beatmaps.map((b) => b.mode).filter(Boolean))]
  const modes = rawModes.length > 0 ? rawModes : [setMode]

  const covers =
    raw.covers && typeof raw.covers === 'object' ? (raw.covers as Record<string, unknown>) : null

  const rawPreview = str(raw.preview_url ?? raw.PreviewUrl, '')
  let previewUrl: string | null = null
  if (rawPreview) {
    previewUrl = rawPreview.startsWith('//') ? `https:${rawPreview}` : rawPreview
  } else if (id) {
    previewUrl = `https://b.ppy.sh/preview/${id}.mp3`
  }

  return {
    id,
    artist: str(raw.artist ?? raw.Artist, 'Unknown'),
    title: str(raw.title ?? raw.Title, 'Unknown'),
    creator: str(raw.creator ?? raw.Creator ?? raw.mapper, 'Unknown'),
    status: str(raw.status ?? raw.Status, 'unknown').toLowerCase(),
    bpm: Math.round(num(raw.bpm ?? raw.BPM) * 100) / 100,
    favouriteCount: Math.round(num(raw.favourite_count ?? raw.Favourites ?? raw.favourites)),
    playCount: Math.round(num(raw.play_count ?? raw.PlayCount ?? raw.playcount)),
    coverUrl: covers
      ? str(covers['list@2x'] || covers.list || covers.card || covers.cover, '') || null
      : str(raw.covers_list || raw.Cover, '') || null,
    listCoverUrl: covers ? str(covers['list@2x'] || covers.list, '') || null : null,
    previewUrl,
    maxStars: stars.length ? Math.max(...stars) : 0,
    minStars: stars.length ? Math.min(...stars) : 0,
    modes,
    hasVideo: Boolean(raw.video ?? raw.HasVideo),
    lastUpdated: str(raw.last_updated ?? raw.LastUpdate, '') || null,
    beatmaps,
  }
}

function extractCursorString(data: Record<string, unknown>): string | null {
  if (typeof data.cursor_string === 'string' && data.cursor_string.trim()) {
    return data.cursor_string.trim()
  }
  return null
}

/**
 * Append structured cursor fields when only `cursor` object is present
 * (some responses omit cursor_string).
 */
function appendCursorObject(sp: URLSearchParams, cursor: unknown) {
  if (!cursor || typeof cursor !== 'object') return
  for (const [key, value] of Object.entries(cursor as Record<string, unknown>)) {
    if (value == null) continue
    sp.set(`cursor[${key}]`, String(value))
  }
}

/**
 * Fetch difficulty .osu text for in-app gameplay preview (osu!preview-style).
 * Uses website endpoint /osu/{beatmapId} — no full set download.
 */
export async function fetchBeatmapOsuFile(beatmapId: number): Promise<{
  beatmapId: number
  content: string
}> {
  const id = Math.floor(Number(beatmapId) || 0)
  if (!id) throw new Error('beatmapId required')

  const fetchWithTimeout = async (url: string, headers?: Record<string, string>): Promise<string | null> => {
    try {
      const res = await fetch(url, {
        headers: headers || { 'User-Agent': 'tosu-gui' },
        signal: AbortSignal.timeout(4000),
      })
      if (res.ok) {
        const text = await res.text()
        if (text && text.length > 40 && text.includes('[HitObjects]')) {
          return text
        }
      }
    } catch {
      /* ignore */
    }
    return null
  }

  // 1. Try with active osu! session if present
  if (await hasOsuSessionCookie()) {
    try {
      const content = await osuTextGet(`/osu/${id}`)
      if (content && content.length > 40 && content.includes('[HitObjects]')) {
        return { beatmapId: id, content }
      }
    } catch {
      /* fallback to public mirrors */
    }
  }

  // 2. Try direct public osu.ppy.sh /osu/{id}
  const publicOsu = await fetchWithTimeout(`https://osu.ppy.sh/osu/${id}`)
  if (publicOsu) return { beatmapId: id, content: publicOsu }

  // 3. Try osu.direct mirror
  const directOsu = await fetchWithTimeout(`https://osu.direct/api/osu/${id}`)
  if (directOsu) return { beatmapId: id, content: directOsu }

  // 4. Try catboy mirror
  const catboyOsu = await fetchWithTimeout(`https://catboy.best/osu/${id}`)
  if (catboyOsu) return { beatmapId: id, content: catboyOsu }

  // 5. Try nerinyan mirror
  const neriOsu = await fetchWithTimeout(`https://api.nerinyan.moe/osu/${id}`)
  if (neriOsu) return { beatmapId: id, content: neriOsu }

  throw new Error('Не удалось загрузить .osu файл карты для предпросмотра')
}

interface SearchCacheEntry {
  timestamp: number
  data: MapSearchResult
}

const searchCache = new Map<string, SearchCacheEntry>()
const SEARCH_CACHE_TTL_MS = 60_000

function getSearchCacheKey(params: MapSearchParams): string {
  return [
    params.query ?? '',
    params.mode ?? 'any',
    params.status ?? 'any',
    params.language ?? 'any',
    params.page ?? 0,
    params.cursor ?? '',
    params.limit ?? 24,
  ].join('|')
}

export async function searchMapSetsMirror(params: MapSearchParams): Promise<MapSearchResult> {
  const page = Math.max(params.page ?? 0, 0)
  const q = (params.query ?? '').trim()
  const modeInt = params.mode && params.mode !== 'any' ? MODE_INT[params.mode] : undefined
  const statusStr = params.status && params.status !== 'any' ? STATUS_PARAM[params.status] : 'ranked'

  // 1. Try Nerinyan search mirror
  try {
    const sp = new URLSearchParams()
    if (q) sp.set('q', q)
    if (modeInt != null) sp.set('m', String(modeInt))
    if (statusStr && statusStr !== 'any') sp.set('s', statusStr)
    sp.set('p', String(page))
    sp.set('limit', String(params.limit || 24))

    const res = await fetch(`https://api.nerinyan.moe/search?${sp.toString()}`, {
      headers: { 'User-Agent': 'tosu-gui' },
      signal: AbortSignal.timeout(6000),
    })
    if (res.ok) {
      const data = (await res.json()) as unknown
      const rawList: Record<string, unknown>[] = Array.isArray(data)
        ? (data as Record<string, unknown>[])
        : data && typeof data === 'object' && Array.isArray((data as { data?: unknown[] }).data)
          ? ((data as { data: Record<string, unknown>[] }).data)
          : []
      const sets: MapSetSummary[] = []
      for (const item of rawList) {
        const norm = normalizeSet(item)
        if (norm) sets.push(norm)
      }
      if (sets.length > 0 || !q) {
        return {
          sets,
          cursor: null,
          hasMore: sets.length >= (params.limit || 24),
          total: null,
        }
      }
    }
  } catch (err) {
    console.warn('[maps] nerinyan mirror search failed:', err)
  }

  // 2. Try Mino (catboy.best) search mirror
  try {
    const sp = new URLSearchParams()
    if (q) sp.set('q', q)
    if (modeInt != null) sp.set('mode', String(modeInt))
    if (statusStr && statusStr !== 'any') sp.set('status', statusStr)
    sp.set('p', String(page))

    const res = await fetch(`https://catboy.best/api/v2/search?${sp.toString()}`, {
      headers: { 'User-Agent': 'tosu-gui' },
      signal: AbortSignal.timeout(6000),
    })
    if (res.ok) {
      const data = (await res.json()) as unknown
      const rawList: Record<string, unknown>[] = Array.isArray(data)
        ? (data as Record<string, unknown>[])
        : data && typeof data === 'object' && Array.isArray((data as { sets?: unknown[] }).sets)
          ? ((data as { sets: Record<string, unknown>[] }).sets)
          : []
      const sets: MapSetSummary[] = []
      for (const item of rawList) {
        const norm = normalizeSet(item)
        if (norm) sets.push(norm)
      }
      return {
        sets,
        cursor: null,
        hasMore: sets.length >= 20,
        total: null,
      }
    }
  } catch (err) {
    console.warn('[maps] catboy mirror search failed:', err)
  }

  return { sets: [], cursor: null, hasMore: false, total: 0 }
}

export async function searchMapSets(params: MapSearchParams): Promise<MapSearchResult> {
  const cacheKey = getSearchCacheKey(params)
  const cached = searchCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS) {
    return cached.data
  }

  const isLogged = await hasOsuSessionCookie()

  // If not logged in, try mirror search
  if (!isLogged) {
    const mirrorResult = await searchMapSetsMirror(params)
    if (mirrorResult.sets.length > 0) {
      searchCache.set(cacheKey, { timestamp: Date.now(), data: mirrorResult })
      return mirrorResult
    }
    throw new Error('Войдите в osu!, чтобы искать карты')
  }

  try {
    const page = Math.max(params.page ?? 0, 0)
    const sp = new URLSearchParams()
    sp.set('q', (params.query ?? '').trim())
    if (params.mode && params.mode !== 'any') {
      sp.set('m', String(MODE_INT[params.mode]))
    }
    if (params.status && params.status !== 'any') {
      sp.set('s', STATUS_PARAM[params.status] ?? 'any')
    } else {
      sp.set('s', 'any')
    }
    if (params.language && params.language !== 'any') {
      const langId = LANGUAGE_PARAM[params.language]
      if (langId != null) sp.set('l', String(langId))
    }

    // Pagination: prefer opaque cursor_string; else page number (1-based on wire).
    // Do NOT JSON.stringify the cursor object into cursor_string — API rejects it.
    if (params.cursor) {
      if (params.cursor.startsWith('{')) {
        try {
          appendCursorObject(sp, JSON.parse(params.cursor) as unknown)
        } catch {
          sp.set('cursor_string', params.cursor)
        }
      } else {
        sp.set('cursor_string', params.cursor)
      }
    } else if (page > 0) {
      sp.set('page', String(page + 1))
    }

    const data = (await osuJsonGet(`${OSU_ORIGIN}/beatmapsets/search?${sp.toString()}`)) as Record<
      string,
      unknown
    >

    const rawList = Array.isArray(data.beatmapsets)
      ? (data.beatmapsets as Record<string, unknown>[])
      : Array.isArray(data)
        ? (data as Record<string, unknown>[])
        : []

    const sets = rawList.map(normalizeSet).filter((s): s is MapSetSummary => s != null)
    let cursor = extractCursorString(data)
    // Keep structured cursor for next request if string missing
    if (!cursor && data.cursor && typeof data.cursor === 'object') {
      try {
        cursor = JSON.stringify(data.cursor)
      } catch {
        cursor = null
      }
    }

    const total = num(data.total, -1)
    // Full page ≈ more results exist (osu default page size is often 50)
    const looksFull = sets.length >= 20
    const hasMore = Boolean(cursor) || looksFull

    const result: MapSearchResult = {
      sets,
      cursor,
      hasMore,
      total: total >= 0 ? total : null,
    }

    searchCache.set(cacheKey, { timestamp: Date.now(), data: result })
    return result
  } catch (err) {
    console.warn('[maps] osu.ppy.sh search failed, falling back to mirrors:', err)
    const mirrorResult = await searchMapSetsMirror(params)
    if (mirrorResult.sets.length > 0) {
      searchCache.set(cacheKey, { timestamp: Date.now(), data: mirrorResult })
      return mirrorResult
    }
    throw err
  }
}

// --- Cancelable downloads ---

interface ActiveDownload {
  setId: number
  cancelled: boolean
  abortController: AbortController | null
  tempPath: string | null
  file: fs.WriteStream | null
}

const activeDownloads = new Map<number, ActiveDownload>()

export function cancelMapDownload(setId: number): boolean {
  const active = activeDownloads.get(setId)
  if (!active) return false
  active.cancelled = true
  try {
    active.abortController?.abort()
  } catch {
    /* ignore */
  }
  try {
    active.file?.destroy()
  } catch {
    /* ignore */
  }
  if (active.tempPath) {
    try {
      if (fs.existsSync(active.tempPath)) fs.unlinkSync(active.tempPath)
    } catch {
      /* ignore */
    }
  }
  return true
}

export function isMapDownloadActive(setId: number): boolean {
  return activeDownloads.has(setId)
}

function safeFileName(artist: string, title: string, setId: number): string {
  const base = `${setId} ${artist} - ${title}`
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
  return `${base || String(setId)}.osz`
}

class DownloadCancelledError extends Error {
  constructor() {
    super('Загрузка отменена')
    this.name = 'DownloadCancelledError'
  }
}

async function downloadToFileCancelable(
  url: string,
  dest: string,
  headers: Record<string, string>,
  active: ActiveDownload,
  onProgress: (pct: number) => void,
  timeoutMs = 600_000
): Promise<void> {
  const controller = new AbortController()
  active.abortController = controller
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    if (active.cancelled) {
      throw new DownloadCancelledError()
    }

    const ses = getOsuSession()
    const res = await ses.fetch(url, {
      method: 'GET',
      headers: {
        ...headers,
        Accept: '*/*',
        'User-Agent': headers['User-Agent'] || USER_AGENT,
      },
      signal: controller.signal,
    })

    if (active.cancelled) {
      throw new DownloadCancelledError()
    }

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw new Error('Нужно войти в osu! или нет доступа к скачиванию')
      }
      if (res.status === 429) {
        throw new Error('Лимит скачиваний osu! — подождите')
      }
      throw new Error(`HTTP ${res.status}`)
    }

    const contentType = String(res.headers.get('content-type') || '')
    if (contentType.includes('text/html')) {
      throw new Error('osu! вернул страницу вместо файла — войдите заново')
    }

    if (!res.body) {
      throw new Error('Пустой ответ от сервера osu!')
    }

    const total = parseInt(res.headers.get('content-length') || '0', 10)
    let received = 0
    const file = fs.createWriteStream(dest)
    active.file = file
    active.tempPath = dest

    const nodeStream = Readable.fromWeb(res.body as import('stream/web').ReadableStream)

    await new Promise<void>((resolve, reject) => {
      nodeStream.on('data', (chunk: Buffer) => {
        if (active.cancelled) {
          nodeStream.destroy()
          file.destroy()
          return
        }
        received += chunk.length
        if (total > 0) onProgress(Math.min(96, (received / total) * 96))
        else onProgress(Math.min(90, received / (512 * 1024)))
      })

      nodeStream.pipe(file)

      file.on('finish', () => {
        file.close(() => {
          if (active.cancelled) {
            try {
              if (fs.existsSync(dest)) fs.unlinkSync(dest)
            } catch {
              /* ignore */
            }
            reject(new DownloadCancelledError())
            return
          }
          try {
            const size = fs.statSync(dest).size
            if (size < MIN_OSZ_BYTES) {
              try {
                fs.unlinkSync(dest)
              } catch {
                /* ignore */
              }
              reject(new Error('Файл слишком маленький — скачивание не удалось'))
              return
            }
            onProgress(98)
            resolve()
          } catch (err) {
            reject(err)
          }
        })
      })

      nodeStream.on('error', (err) => {
        try {
          file.destroy()
          if (fs.existsSync(dest)) fs.unlinkSync(dest)
        } catch {
          /* ignore */
        }
        if (active.cancelled) reject(new DownloadCancelledError())
        else reject(err)
      })

      file.on('error', (err) => {
        try {
          nodeStream.destroy()
          if (fs.existsSync(dest)) fs.unlinkSync(dest)
        } catch {
          /* ignore */
        }
        if (active.cancelled) reject(new DownloadCancelledError())
        else reject(err)
      })
    })
  } catch (err) {
    if (active.cancelled || (err instanceof Error && err.name === 'AbortError' && active.cancelled)) {
      try {
        if (fs.existsSync(dest)) fs.unlinkSync(dest)
      } catch {
        /* ignore */
      }
      throw new DownloadCancelledError()
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export async function downloadMapSet(
  setId: number,
  songsPath: string,
  onProgress: (p: MapDownloadProgress) => void,
  meta?: { artist?: string; title?: string; noVideo?: boolean }
): Promise<{ filePath: string; source: string }> {
  if (!setId || setId < 1) throw new Error('Некорректный set id')
  if (!songsPath || !fs.existsSync(songsPath)) {
    throw new Error('Папка Songs не найдена — укажите путь в Настройках')
  }
  if (!(await hasOsuSessionCookie())) {
    throw new Error('Войдите в osu!, чтобы скачивать карты')
  }
  if (activeDownloads.has(setId)) {
    throw new Error('Эта карта уже скачивается')
  }

  const active: ActiveDownload = {
    setId,
    cancelled: false,
    abortController: null,
    tempPath: null,
    file: null,
  }
  activeDownloads.set(setId, active)

  const destName = safeFileName(meta?.artist ?? '', meta?.title ?? '', setId)
  const destPath = path.join(songsPath, destName)
  const tempPath = path.join(app.getPath('temp'), `tosu-gui-map-${setId}-${Date.now()}.osz`)
  active.tempPath = tempPath

  const noVideo = meta?.noVideo !== false
  const url = `${OSU_ORIGIN}/beatmapsets/${setId}/download${noVideo ? '?noVideo=1' : ''}`

  try {
    let downloadSource = 'osu.ppy.sh'
    onProgress({ setId, phase: 'downloading', progress: 0, message: 'Скачивание с osu.ppy.sh…' })

    try {
      const headers = await buildOsuHeaders({
        Accept: 'application/octet-stream,application/x-osu-beatmap-archive,*/*',
        Referer: `${OSU_ORIGIN}/beatmapsets/${setId}`,
      })

      await downloadToFileCancelable(url, tempPath, headers, active, (pct) => {
        if (!active.cancelled) {
          onProgress({ setId, phase: 'downloading', progress: pct, message: 'Скачивание…' })
        }
      })
    } catch (officialErr) {
      if (active.cancelled || officialErr instanceof DownloadCancelledError) throw officialErr
      console.warn('[maps] osu.ppy.sh download failed, trying mirrors:', officialErr)

      const mirrorUrls = [
        `https://api.nerinyan.moe/d/${setId}${noVideo ? '?noVideo=true' : ''}`,
        `https://catboy.best/d/${setId}`,
      ]

      let downloaded = false
      for (const mUrl of mirrorUrls) {
        if (active.cancelled) throw new DownloadCancelledError()
        try {
          const mirrorName = mUrl.includes('nerinyan') ? 'Nerinyan' : 'Catboy'
          onProgress({ setId, phase: 'downloading', progress: 0, message: `Скачивание с зеркала (${mirrorName})…` })
          await downloadToFileCancelable(mUrl, tempPath, { 'User-Agent': 'tosu-gui' }, active, (pct) => {
            if (!active.cancelled) {
              onProgress({ setId, phase: 'downloading', progress: pct, message: `Скачивание (${mirrorName})…` })
            }
          })
          downloaded = true
          downloadSource = mirrorName
          break
        } catch (mErr) {
          if (active.cancelled || mErr instanceof DownloadCancelledError) throw mErr
          console.warn('[maps] mirror download failed:', mUrl, mErr)
        }
      }

      if (!downloaded) {
        throw officialErr
      }
    }

    if (active.cancelled) throw new DownloadCancelledError()

    onProgress({ setId, phase: 'installing', progress: 99, message: 'В Songs…' })

    let finalPath = destPath
    try {
      if (fs.existsSync(destPath)) {
        try {
          fs.unlinkSync(destPath)
        } catch {
          finalPath = path.join(songsPath, `${setId}-${Date.now()}.osz`)
        }
      }
      try {
        fs.renameSync(tempPath, finalPath)
      } catch {
        fs.copyFileSync(tempPath, finalPath)
        try {
          fs.unlinkSync(tempPath)
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
      } catch {
        /* ignore */
      }
      throw err
    }

    onProgress({
      setId,
      phase: 'done',
      progress: 100,
      message: 'Готово',
      filePath: finalPath,
    })

    return { filePath: finalPath, source: downloadSource }
  } catch (err) {
    if (err instanceof DownloadCancelledError || active.cancelled) {
      onProgress({ setId, phase: 'cancelled', progress: 0, message: 'Отменено' })
      throw new DownloadCancelledError()
    }
    const message = err instanceof Error ? err.message : String(err)
    onProgress({ setId, phase: 'error', progress: 0, error: message })
    throw err instanceof Error ? err : new Error(message)
  } finally {
    activeDownloads.delete(setId)
  }
}

export function detectDefaultSongsPath(): string | null {
  const candidates: string[] = []

  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || ''
    if (local) {
      candidates.push(path.join(local, 'osu!', 'Songs'))
      candidates.push(path.join(local, 'osu', 'Songs'))
    }
    const userProfile = process.env.USERPROFILE || ''
    if (userProfile) {
      candidates.push(path.join(userProfile, 'AppData', 'Local', 'osu!', 'Songs'))
      candidates.push(path.join(userProfile, 'osu!', 'Songs'))
      candidates.push(path.join(userProfile, 'Games', 'osu!', 'Songs'))
    }
  } else if (process.platform === 'darwin') {
    const home = app.getPath('home')
    candidates.push(path.join(home, 'Library', 'Application Support', 'osu!', 'Songs'))
  } else {
    const home = app.getPath('home')
    candidates.push(path.join(home, '.local', 'share', 'osu!', 'Songs'))
    candidates.push(path.join(home, 'osu!', 'Songs'))
  }

  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p) && fs.statSync(p).isDirectory()) return p
    } catch {
      /* ignore */
    }
  }
  return null
}

export function resolveSongsPath(configured: string | null | undefined): string | null {
  const trimmed = (configured || '').trim()
  if (trimmed) {
    try {
      if (fs.existsSync(trimmed) && fs.statSync(trimmed).isDirectory()) return trimmed
    } catch {
      /* fall through */
    }
  }
  return detectDefaultSongsPath()
}

let cachedSongsPath = ''
let cachedMtimeMs = 0
let cachedSetIds: number[] = []

export function invalidateLocalSetIdsCache(): void {
  cachedSongsPath = ''
  cachedMtimeMs = 0
  cachedSetIds = []
}

export function scanLocalSetIds(songsPath: string): number[] {
  try {
    if (!songsPath || !fs.existsSync(songsPath)) return []
    const stat = fs.statSync(songsPath)
    if (cachedSongsPath === songsPath && cachedMtimeMs === stat.mtimeMs && cachedSetIds.length > 0) {
      return cachedSetIds
    }
    const entries = fs.readdirSync(songsPath, { withFileTypes: true })
    const ids = new Set<number>()
    for (const ent of entries) {
      const m = ent.name.match(/^(\d{1,9})(?:\s|[._-]|$)/)
      if (!m) continue
      const id = parseInt(m[1], 10)
      if (id > 0) ids.add(id)
    }
    cachedSongsPath = songsPath
    cachedMtimeMs = stat.mtimeMs
    cachedSetIds = [...ids]
    return cachedSetIds
  } catch {
    return []
  }
}

export async function pickSongsDirectory(parent: BrowserWindow | null): Promise<string | null> {
  const opts = {
    title: 'Выберите папку Songs osu!',
    properties: ['openDirectory' as const],
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, opts)
    : await dialog.showOpenDialog(opts)
  if (result.canceled || !result.filePaths[0]) return null
  return result.filePaths[0]
}

export { DownloadCancelledError }
