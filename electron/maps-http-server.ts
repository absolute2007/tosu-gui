/**
 * Localhost HTTP API for the in-game Maps counter (works in exclusive fullscreen
 * via tosu inject overlay). Electron always-on-top windows cannot draw over FS.
 */
import http from 'http'
import type { IncomingMessage, ServerResponse } from 'http'
import fs from 'fs'
import path from 'path'
import { app, BrowserWindow, shell } from 'electron'
import {
  cancelMapDownload,
  downloadMapSet,
  DownloadCancelledError,
  resolveSongsPath,
  scanLocalSetIds,
  searchMapSets,
  type MapDownloadProgress,
  type MapSearchParams,
} from './beatmap-maps'
import { fetchOsuAccount, loginWithOsuWindow } from './osu-session'
import { readGuiSettings } from './gui-settings'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

function getMapsUiDir(): string | null {
  const candidates = [
    path.join(process.resourcesPath, 'maps-counter'),
    path.join(app.getAppPath(), 'resources', 'maps-counter'),
    path.join(__dirname, '..', 'resources', 'maps-counter'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'index.html'))) return c
  }
  return null
}

function tryServeStatic(req: IncomingMessage, res: ServerResponse, urlPath: string): boolean {
  const dir = getMapsUiDir()
  if (!dir) return false

  let rel = decodeURIComponent(urlPath.split('?')[0] || '/')
  if (rel === '/' || rel === '') rel = '/index.html'
  // prevent path escape
  const safe = path.normalize(rel).replace(/^(\.\.[/\\])+/, '')
  const filePath = path.join(dir, safe)
  if (!filePath.startsWith(dir) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false
  }
  const ext = path.extname(filePath).toLowerCase()
  const body = fs.readFileSync(filePath)
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': body.length,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  })
  res.end(body)
  return true
}

export const MAPS_HTTP_PORT = 24777

let server: http.Server | null = null
const progressListeners = new Set<(p: MapDownloadProgress) => void>()
const lastProgress = new Map<number, MapDownloadProgress>()

export function emitMapsHttpProgress(p: MapDownloadProgress) {
  lastProgress.set(p.setId, p)
  for (const fn of progressListeners) {
    try {
      fn(p)
    } catch {
      /* ignore */
    }
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  })
  res.end(body)
}

function isLocal(req: IncomingMessage): boolean {
  const ra = req.socket.remoteAddress || ''
  return (
    ra === '127.0.0.1' ||
    ra === '::1' ||
    ra === '::ffff:127.0.0.1' ||
    ra.endsWith('127.0.0.1')
  )
}

function getSongsPath(): string | null {
  return resolveSongsPath(readGuiSettings().songsPath || null)
}

async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  getParent: () => BrowserWindow | null
): Promise<void> {
  const pathName = url.pathname.replace(/\/+$/, '') || '/'

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  if (pathName === '/api/maps/ping' && req.method === 'GET') {
    sendJson(res, 200, { ok: true, port: MAPS_HTTP_PORT })
    return
  }

  if (pathName === '/api/maps/config' && req.method === 'GET') {
    const gui = readGuiSettings()
    const layoutKeybind = mapsHttpDeps?.getOverlayKeybind?.() || 'Control + Shift + Space'
    const mapsKeybind = gui.mapsOverlayKeybind || 'Control + Shift + M'
    sendJson(res, 200, {
      /** Hotkey that opens THIS maps UI inside inject overlay */
      mapsKeybind,
      /** tosu layout editor hotkey (not for maps) */
      overlayKeybind: layoutKeybind,
      port: MAPS_HTTP_PORT,
    })
    return
  }

  if (pathName === '/api/maps/auth' && req.method === 'GET') {
    sendJson(res, 200, await fetchOsuAccount())
    return
  }

  if (pathName === '/api/maps/login' && req.method === 'POST') {
    const account = await loginWithOsuWindow(getParent())
    sendJson(res, 200, account)
    return
  }

  // Logout intentionally not exposed to in-game counter

  if (pathName === '/api/maps/songs' && req.method === 'GET') {
    const resolved = getSongsPath()
    sendJson(res, 200, { resolved, configured: readGuiSettings().songsPath || '' })
    return
  }

  if (pathName === '/api/maps/local-sets' && req.method === 'GET') {
    const songs = getSongsPath()
    sendJson(res, 200, {
      songsPath: songs,
      setIds: songs ? scanLocalSetIds(songs) : [],
    })
    return
  }

  if (pathName === '/api/maps/search' && req.method === 'GET') {
    const params: MapSearchParams = {
      query: url.searchParams.get('q') || '',
      mode: (url.searchParams.get('mode') as MapSearchParams['mode']) || 'any',
      status: (url.searchParams.get('status') as MapSearchParams['status']) || 'ranked',
      page: Math.max(0, parseInt(url.searchParams.get('page') || '0', 10) || 0),
      cursor: url.searchParams.get('cursor') || null,
      limit: Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '24', 10) || 24)),
    }
    try {
      const result = await searchMapSets(params)
      sendJson(res, 200, result)
    } catch (err) {
      sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) })
    }
    return
  }

  if (pathName === '/api/maps/download' && req.method === 'POST') {
    const raw = await readBody(req)
    let body: { setId?: number; artist?: string; title?: string } = {}
    try {
      body = JSON.parse(raw || '{}') as typeof body
    } catch {
      sendJson(res, 400, { error: 'Bad JSON' })
      return
    }
    const setId = Number(body.setId) || 0
    const songs = getSongsPath()
    if (!setId) {
      sendJson(res, 400, { error: 'setId required' })
      return
    }
    if (!songs) {
      sendJson(res, 400, { error: 'Укажите папку Songs в tosu GUI' })
      return
    }
    try {
      const result = await downloadMapSet(
        setId,
        songs,
        (p) => emitMapsHttpProgress(p),
        { artist: body.artist || '', title: body.title || '' }
      )
      try {
        await shell.openPath(result.filePath)
      } catch {
        /* ignore */
      }
      sendJson(res, 200, { ok: true, ...result })
    } catch (err) {
      if (err instanceof DownloadCancelledError) {
        sendJson(res, 200, { ok: false, cancelled: true })
        return
      }
      sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) })
    }
    return
  }

  if (pathName === '/api/maps/cancel' && req.method === 'POST') {
    const raw = await readBody(req)
    let body: { setId?: number } = {}
    try {
      body = JSON.parse(raw || '{}') as typeof body
    } catch {
      sendJson(res, 400, { error: 'Bad JSON' })
      return
    }
    const setId = Number(body.setId) || 0
    const ok = cancelMapDownload(setId)
    if (ok) {
      emitMapsHttpProgress({
        setId,
        phase: 'cancelled',
        progress: 0,
        message: 'Отменено',
      })
    }
    sendJson(res, 200, { ok })
    return
  }

  if (pathName === '/api/maps/progress' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    })
    res.write(': ok\n\n')
    for (const p of lastProgress.values()) {
      res.write(`data: ${JSON.stringify(p)}\n\n`)
    }
    const onP = (p: MapDownloadProgress) => {
      res.write(`data: ${JSON.stringify(p)}\n\n`)
    }
    progressListeners.add(onP)
    req.on('close', () => {
      progressListeners.delete(onP)
    })
    return
  }

  // Static maps UI for inject overlay (full-screen page)
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (tryServeStatic(req, res, url.pathname)) return
  }

  sendJson(res, 404, { error: 'Not found' })
}

export type MapsHttpDeps = {
  getParent: () => BrowserWindow | null
  /** Current in-game overlay keybind, e.g. "Control + Shift + Space" */
  getOverlayKeybind: () => string
}

let mapsHttpDeps: MapsHttpDeps | null = null

export function startMapsHttpServer(deps: MapsHttpDeps): void {
  if (server) return
  mapsHttpDeps = deps

  server = http.createServer((req, res) => {
    if (!isLocal(req)) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }
    const host = req.headers.host || `127.0.0.1:${MAPS_HTTP_PORT}`
    const url = new URL(req.url || '/', `http://${host}`)
    void handleApi(req, res, url, () => mapsHttpDeps?.getParent() ?? null).catch((err) => {
      console.error('[maps-http]', err)
      try {
        sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) })
      } catch {
        /* ignore */
      }
    })
  })

  server.on('error', (err) => {
    console.error('[maps-http] server error:', err)
  })

  server.listen(MAPS_HTTP_PORT, '127.0.0.1', () => {
    console.log(`[maps-http] listening on http://127.0.0.1:${MAPS_HTTP_PORT}`)
  })
}

export function stopMapsHttpServer(): void {
  if (!server) return
  server.close()
  server = null
  progressListeners.clear()
}
