/**
 * Official osu.ppy.sh beatmap search + download (website session).
 * Cancelable downloads; no community mirrors.
 */
import fs from 'fs'
import http from 'http'
import https from 'https'
import path from 'path'
import { app, dialog, BrowserWindow } from 'electron'
import type { ClientRequest, IncomingMessage } from 'http'
import {
  buildOsuHeaders,
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

function normalizeBeatmap(raw: Record<string, unknown>): MapBeatmapSummary | null {
  const id = num(raw.id ?? raw.beatmap_id ?? raw.BeatmapID)
  if (!id) return null
  return {
    id,
    version: str(raw.version ?? raw.Version ?? raw.difficulty_name, 'Normal'),
    mode: str(raw.mode ?? raw.Mode, 'osu').toLowerCase(),
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
  const modes = [...new Set(beatmaps.map((b) => b.mode).filter(Boolean))]

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
  if (!(await hasOsuSessionCookie())) {
    throw new Error('Войдите в osu!, чтобы смотреть превью')
  }
  const content = await osuTextGet(`/osu/${id}`)
  if (!content || content.length < 40 || !content.includes('[HitObjects]')) {
    throw new Error('Не удалось загрузить .osu (пусто или недоступно)')
  }
  return { beatmapId: id, content }
}

export async function searchMapSets(params: MapSearchParams): Promise<MapSearchResult> {
  if (!(await hasOsuSessionCookie())) {
    throw new Error('Войдите в osu!, чтобы искать карты')
  }

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

  return {
    sets,
    cursor,
    hasMore,
    total: total >= 0 ? total : null,
  }
}

// --- Cancelable downloads ---

interface ActiveDownload {
  setId: number
  cancelled: boolean
  req: ClientRequest | null
  res: IncomingMessage | null
  tempPath: string | null
  file: fs.WriteStream | null
}

const activeDownloads = new Map<number, ActiveDownload>()

export function cancelMapDownload(setId: number): boolean {
  const active = activeDownloads.get(setId)
  if (!active) return false
  active.cancelled = true
  try {
    active.req?.destroy()
  } catch {
    /* ignore */
  }
  try {
    active.res?.destroy()
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

function downloadToFileCancelable(
  url: string,
  dest: string,
  headers: Record<string, string>,
  active: ActiveDownload,
  onProgress: (pct: number) => void,
  timeoutMs = 600_000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const follow = (fetchUrl: string, redirects = 0) => {
      if (active.cancelled) {
        reject(new DownloadCancelledError())
        return
      }
      if (redirects > 12) {
        reject(new Error('Слишком много редиректов'))
        return
      }

      const parsed = new URL(fetchUrl)
      const lib = parsed.protocol === 'https:' ? https : http

      const req = lib.get(
        fetchUrl,
        {
          headers: {
            ...headers,
            Accept: '*/*',
            // download endpoints sometimes want browser-like accept
            'User-Agent': headers['User-Agent'] || USER_AGENT,
          },
          timeout: timeoutMs,
        },
        (res) => {
          if (active.cancelled) {
            res.resume()
            reject(new DownloadCancelledError())
            return
          }

          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume()
            follow(new URL(res.headers.location, fetchUrl).href, redirects + 1)
            return
          }

          if (!res.statusCode || res.statusCode >= 400) {
            res.resume()
            if (res.statusCode === 401 || res.statusCode === 403) {
              reject(new Error('Нужно войти в osu! или нет доступа к скачиванию'))
              return
            }
            if (res.statusCode === 429) {
              reject(new Error('Лимит скачиваний osu! — подождите'))
              return
            }
            reject(new Error(`HTTP ${res.statusCode ?? '?'}`))
            return
          }

          const contentType = String(res.headers['content-type'] || '')
          if (contentType.includes('text/html')) {
            res.resume()
            reject(new Error('osu! вернул страницу вместо файла — войдите заново'))
            return
          }

          active.res = res
          const total = parseInt(res.headers['content-length'] || '0', 10)
          let received = 0
          const file = fs.createWriteStream(dest)
          active.file = file
          active.tempPath = dest

          res.on('data', (chunk: Buffer) => {
            if (active.cancelled) {
              res.destroy()
              file.destroy()
              return
            }
            received += chunk.length
            if (total > 0) onProgress(Math.min(96, (received / total) * 96))
            else onProgress(Math.min(90, received / (512 * 1024)))
          })

          res.pipe(file)

          file.on('finish', () => {
            file.close(() => {
              if (active.cancelled) {
                try {
                  fs.unlinkSync(dest)
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

          file.on('error', (err) => {
            try {
              fs.unlinkSync(dest)
            } catch {
              /* ignore */
            }
            if (active.cancelled) reject(new DownloadCancelledError())
            else reject(err)
          })

          res.on('error', (err) => {
            if (active.cancelled) reject(new DownloadCancelledError())
            else reject(err)
          })

          res.on('close', () => {
            if (active.cancelled) {
              try {
                if (fs.existsSync(dest)) fs.unlinkSync(dest)
              } catch {
                /* ignore */
              }
            }
          })
        }
      )

      active.req = req
      req.on('error', (err) => {
        if (active.cancelled) reject(new DownloadCancelledError())
        else reject(err)
      })
      req.on('timeout', () => {
        req.destroy()
        if (active.cancelled) reject(new DownloadCancelledError())
        else reject(new Error('Превышено время ожидания загрузки'))
      })
    }

    follow(url)
  })
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
    req: null,
    res: null,
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
    onProgress({ setId, phase: 'downloading', progress: 0, message: 'Скачивание с osu.ppy.sh…' })

    const headers = await buildOsuHeaders({
      Accept: 'application/octet-stream,application/x-osu-beatmap-archive,*/*',
      Referer: `${OSU_ORIGIN}/beatmapsets/${setId}`,
    })

    await downloadToFileCancelable(url, tempPath, headers, active, (pct) => {
      if (!active.cancelled) {
        onProgress({ setId, phase: 'downloading', progress: pct, message: 'Скачивание…' })
      }
    })

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

    return { filePath: finalPath, source: 'osu.ppy.sh' }
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

export function scanLocalSetIds(songsPath: string): number[] {
  const ids = new Set<number>()
  try {
    if (!songsPath || !fs.existsSync(songsPath)) return []
    const entries = fs.readdirSync(songsPath, { withFileTypes: true })
    for (const ent of entries) {
      const m = ent.name.match(/^(\d{1,9})(?:\s|[._-]|$)/)
      if (!m) continue
      const id = parseInt(m[1], 10)
      if (id > 0) ids.add(id)
    }
  } catch {
    return []
  }
  return [...ids]
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
