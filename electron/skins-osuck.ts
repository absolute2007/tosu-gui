/**
 * Unofficial skins.osuck.net client (no public API).
 * Catalog + download resolution reverse-engineered from their Nuxt frontend.
 * Do not host skin files ourselves — only stream user downloads.
 */
import http from 'http'
import https from 'https'
import type { IncomingMessage } from 'http'
import type {
  SkinCreator,
  SkinDetail,
  SkinHost,
  SkinModeFilter,
  SkinPackageKind,
  SkinPackageLink,
  SkinSearchParams,
  SkinSearchResult,
  SkinSort,
  SkinSummary,
} from './skins-types'

export const OSUCK_ORIGIN = 'https://skins.osuck.net'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 tosu-gui'

const PACKAGE_KINDS: SkinPackageKind[] = ['osk', 'lite', 'ultra_lite', 'extras']
const HOST_INDEX: Record<SkinHost, number> = { google: 0, mega: 1, mediafire: 2 }
const HOST_BY_INDEX: SkinHost[] = ['google', 'mega', 'mediafire']

/** Prefer hosts we can download without a full browser (MEGA is last). */
const HOST_PRIORITY: SkinHost[] = ['google', 'mediafire', 'mega']

type CookieJar = Map<string, string>

function buildBoostParams(): string {
  const ts = Date.now()
  const w = 1920
  const h = 1080
  // Match site: 1 = "boost" fingerprint used for API calls
  return `1:_:true:::${w}:::${h}:::${w / h}:::${ts}:::0:::-1`
}

function buildDownloadAutem(): string {
  const ts = Date.now()
  const w = 1920
  const h = 1080
  // download.global hardcodes prefix "1:_" and trailing -1,-1
  return `1:_:true:::${w}:::${h}:::${w / h}:::${ts}:::-1:::-1`
}

function parseSetCookie(header: string | string[] | undefined, jar: CookieJar) {
  const list = !header ? [] : Array.isArray(header) ? header : [header]
  for (const raw of list) {
    const part = raw.split(';')[0]
    const eq = part.indexOf('=')
    if (eq <= 0) continue
    const name = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    jar.set(name, value)
  }
}

function cookieHeader(jar: CookieJar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
}

interface HttpResult {
  status: number
  headers: IncomingMessage['headers']
  body: Buffer
}

function request(
  method: string,
  urlStr: string,
  headers: Record<string, string>,
  body: string | Buffer | null,
  jar: CookieJar,
  maxRedirects = 0
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr)
    const lib = url.protocol === 'http:' ? http : https
    const cookie = cookieHeader(jar)
    const opts: https.RequestOptions = {
      method,
      hostname: url.hostname,
      port: url.port || undefined,
      path: url.pathname + url.search,
      headers: {
        'User-Agent': USER_AGENT,
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      timeout: 25_000,
    }

    const req = lib.request(opts, (res) => {
      parseSetCookie(res.headers['set-cookie'], jar)
      const chunks: Buffer[] = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        const status = res.statusCode || 0
        if (status >= 300 && status < 400 && res.headers.location && maxRedirects > 0) {
          const next = new URL(res.headers.location, urlStr).href
          resolve(request(method === 'POST' ? 'GET' : method, next, headers, null, jar, maxRedirects - 1))
          return
        }
        resolve({ status, headers: res.headers, body: buf })
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Превышено время ожидания запроса к skins.osuck.net'))
    })
    if (body) req.write(body)
    req.end()
  })
}

async function ensureSession(jar: CookieJar, location: string): Promise<void> {
  await request(
    'POST',
    `${OSUCK_ORIGIN}/api/views`,
    {
      'X-Request-Params': buildBoostParams(),
      'X-Request-Location': location,
    },
    null,
    jar,
    0
  )
}

async function apiDetails(
  jar: CookieJar,
  location: string,
  body: string | null
): Promise<unknown> {
  await ensureSession(jar, location)
  const res = await request(
    'POST',
    `${OSUCK_ORIGIN}/api/details`,
    {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Request-Params': buildBoostParams(),
      'X-Request-Location': location,
      Origin: OSUCK_ORIGIN,
      Referer: `${OSUCK_ORIGIN}${location}`,
    },
    body ?? '{}',
    jar,
    0
  )
  if (res.status === 429) throw new Error('Слишком много запросов к osuck — подождите')
  if (res.status === 401) throw new Error('osuck требует авторизацию для этого действия')
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`osuck API error ${res.status}`)
  }
  const text = res.body.toString('utf8')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Некорректный ответ osuck')
  }
}

/**
 * osuck mode slug.
 * Browse paths: /skins/osu|ctb|taiko|mania
 * Search query `mode=`: same names (Catch = ctb, not fruits).
 */
function modeSlug(mode: SkinModeFilter | undefined): string | null {
  switch (mode) {
    case 'osu':
      return 'osu'
    case 'taiko':
      return 'taiko'
    case 'fruits':
      return 'ctb'
    case 'mania':
      return 'mania'
    default:
      return null
  }
}

function isPopularSort(sort: SkinSort | undefined): boolean {
  return sort === 'popular' || sort === 'downloads' || sort === 'likes' || sort === 'views'
}

function popularTab(sort: SkinSort | undefined): string {
  if (!sort || sort === 'popular' || sort === 'recent') return 'downloads'
  return sort
}

/**
 * Search-page sort ids (cookie sit2 / query.sort on /search):
 * 0 downloads, 1 views, 2 likes, 3 size, 4 released, 5 created (default), 6 name
 */
function searchSortId(sort: SkinSort | undefined): string | null {
  switch (sort) {
    case 'downloads':
    case 'popular':
      return '0'
    case 'views':
      return '1'
    case 'likes':
      return '2'
    case 'recent':
    default:
      return null // site default = created
  }
}

/**
 * Build X-Request-Location for osuck catalog.
 *
 * Search (important): only `/search?query=…` filters text.
 * `/skins/ctb?search=…` is IGNORED by the API (returns unfiltered mode list).
 * Mode with search: `/search?query=…&mode=ctb`
 */
export function buildOsuckLocation(params: SkinSearchParams): string {
  const query = (params.query || '').trim()
  const mode = modeSlug(params.mode)
  const sort = params.sort || 'recent'

  if (query) {
    const sp = new URLSearchParams()
    // Match site: query param name is `query` (not `q`)
    sp.set('query', query)
    if (mode) sp.set('mode', mode)
    const sid = searchSortId(sort)
    if (sid) sp.set('sort', sid)
    return `/search?${sp.toString()}`
  }

  if (isPopularSort(sort)) {
    const tab = popularTab(sort)
    if (mode) return `/skins/${mode}/popular?tab=${tab}`
    return `/skins/popular?tab=${tab}`
  }

  if (mode) return `/skins/${mode}`
  return '/skins'
}

function asArray(data: unknown): Record<string, unknown>[] {
  if (!Array.isArray(data)) return []
  // popular: [total, [...skins]] or nested [[...skins]]
  if (data.length >= 2 && typeof data[0] === 'number' && Array.isArray(data[1])) {
    return data[1] as Record<string, unknown>[]
  }
  if (data.length > 0 && Array.isArray(data[0])) {
    return data[0] as Record<string, unknown>[]
  }
  return data as Record<string, unknown>[]
}

function extractTotal(data: unknown): number | null {
  if (Array.isArray(data) && typeof data[0] === 'number') return data[0]
  return null
}

function num(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

function screenshotUrl(checksum: string, size: 'full' | 'md' | 'xs' = 'md'): string {
  if (!checksum) return ''
  const suffix = size === 'full' ? '' : `_${size}`
  return `${OSUCK_ORIGIN}/images/screenshots/${checksum}${suffix}.webp`
}

function mapCreators(raw: unknown): SkinCreator[] {
  if (!Array.isArray(raw)) return []
  return raw.map((c) => {
    const o = c as Record<string, unknown>
    return {
      id: num(o.id),
      name: str(o.name),
      avatarUrl: typeof o.avatar_url === 'string' ? o.avatar_url : null,
    }
  })
}

function mapSummary(raw: Record<string, unknown>): SkinSummary | null {
  const id = num(raw.id)
  if (!id) return null
  const stats = (raw.stats || {}) as Record<string, unknown>
  const shots = Array.isArray(raw.screenshots) ? (raw.screenshots as Record<string, unknown>[]) : []
  const firstShot = shots[0]
  const checksum = firstShot ? str(firstShot.checksum) : ''
  return {
    id,
    docId: str(raw._id),
    name: str(raw.name) || `Skin #${id}`,
    version: str(raw.version),
    creators: mapCreators(raw.creators),
    likes: num(stats.likes),
    views: num(stats.views),
    downloads: num(stats.downloads),
    sizeLabel: str(stats.size),
    thumbUrl: checksum ? screenshotUrl(checksum, 'xs') : null,
    coverUrl: checksum ? screenshotUrl(checksum, 'md') : null,
    pageUrl: `${OSUCK_ORIGIN}/skins/${id}`,
    modes: [],
    releasedAt: typeof raw.released_at === 'string' ? raw.released_at : null,
  }
}

const SEARCH_CACHE_TTL_MS = 5 * 60_000
const searchCache = new Map<string, { at: number; result: SkinSearchResult }>()

function searchCacheKey(params: SkinSearchParams): string {
  return [
    buildOsuckLocation(params),
    params.cursorId || '',
    params.cursorValue || '',
  ].join('\0')
}

export async function searchOsuckSkins(params: SkinSearchParams): Promise<SkinSearchResult> {
  const location = buildOsuckLocation(params)
  const cached = searchCache.get(searchCacheKey(params))
  if (cached && Date.now() - cached.at < SEARCH_CACHE_TTL_MS) {
    return cached.result
  }
  // Fresh jar per request so download cookies / pagination never leak into catalog
  const jar: CookieJar = new Map()
  if (params.cursorId) jar.set('lacus', params.cursorId)
  else jar.set('lacus', '')
  if (params.cursorValue) jar.set('fuga', params.cursorValue)
  else jar.set('fuga', '')

  // Search page defaults (sit2/modi2); listing uses sit/modi — set both harmlessly
  const isSearch = location.startsWith('/search')
  if (isSearch) {
    const sid = searchSortId(params.sort) ?? '5'
    jar.set('sit2', sid)
    jar.set('modi2', '1')
  } else {
    jar.set('sit', isPopularSort(params.sort) ? '0' : '5')
    jar.set('modi', '1')
  }

  const data = await apiDetails(jar, location, null)
  const rows = asArray(data)
  const skins = rows.map(mapSummary).filter((s): s is SkinSummary => !!s)
  const last = skins[skins.length - 1]
  // Search page treats <20 as end; mode lists are denser
  const pageSize = isSearch ? 12 : 16
  const result: SkinSearchResult = {
    skins,
    hasMore: skins.length >= pageSize,
    total: extractTotal(data),
    cursorId: last?.docId || null,
    cursorValue: last?.releasedAt || null,
    source: 'osuck',
  }
  const cacheKey = searchCacheKey(params)
  searchCache.set(cacheKey, { at: Date.now(), result })
  if (searchCache.size > 40) {
    const oldest = searchCache.keys().next().value
    if (oldest) searchCache.delete(oldest)
  }
  return result
}

function mapPackages(files: Record<string, unknown>[]): SkinPackageLink[] {
  const out: SkinPackageLink[] = []
  for (const file of files) {
    const checksum = str(file.checksum)
    if (!checksum) continue
    const google = Array.isArray(file.google) ? (file.google as boolean[]) : []
    const mega = Array.isArray(file.mega) ? (file.mega as boolean[]) : []
    const mediafire = Array.isArray(file.mediafire) ? (file.mediafire as boolean[]) : []
    const size = (file.size || {}) as Record<string, unknown>
    const fileName = str(file.name)

    for (let c = 0; c < PACKAGE_KINDS.length; c++) {
      const hosts: SkinHost[] = []
      if (google[c]) hosts.push('google')
      if (mediafire[c]) hosts.push('mediafire')
      if (mega[c]) hosts.push('mega')
      if (hosts.length === 0) continue

      const kind = PACKAGE_KINDS[c]
      const sizeBytes = num(size[kind] ?? size.osk)
      // Only expose "full" osk packages in v1 primary UI (still allow lite if only option)
      const label =
        kind === 'osk'
          ? fileName || 'osk'
          : `${kind}${fileName ? ` · ${fileName}` : ''}`

      out.push({
        kind,
        label,
        sizeBytes,
        hosts,
        checksum,
        variantIndex: c,
      })
    }
  }
  // Prefer full osk packages first
  out.sort((a, b) => {
    if (a.kind === 'osk' && b.kind !== 'osk') return -1
    if (b.kind === 'osk' && a.kind !== 'osk') return 1
    return 0
  })
  return out
}

export async function getOsuckSkinDetail(skinId: number): Promise<SkinDetail> {
  const id = Math.floor(Number(skinId) || 0)
  if (!id) throw new Error('Некорректный id скина')
  const location = `/skins/${id}`
  const jar: CookieJar = new Map()
  const data = (await apiDetails(
    jar,
    location,
    JSON.stringify({ a: 'd', b: id, c: 0 })
  )) as Record<string, unknown>

  const base = mapSummary(data)
  if (!base) throw new Error('Скин не найден')

  const shots = Array.isArray(data.screenshots)
    ? (data.screenshots as Record<string, unknown>[])
        .map((s) => str(s.checksum))
        .filter(Boolean)
        .map((c) => screenshotUrl(c, 'md'))
    : []

  const filesRaw = Array.isArray(data.files) ? (data.files as Record<string, unknown>[]) : []
  const packages = mapPackages(filesRaw)

  return {
    ...base,
    description: str(data.description),
    screenshots: shots,
    packages,
    files: filesRaw.map((f) => ({
      name: str(f.name),
      checksum: str(f.checksum),
      modes: Array.isArray(f.modes) ? f.modes.map((m) => num(m)) : [],
    })),
  }
}

export interface ResolvedSkinDownload {
  /** Final direct (or near-direct) URL to binary */
  url: string
  host: SkinHost
  fileName: string
  /** Headers to send when downloading the binary */
  headers: Record<string, string>
  /** If true, caller should open URL externally (MEGA etc.) */
  openExternalOnly?: boolean
}

function extractDriveId(url: string): string | null {
  const m =
    url.match(/\/file\/d\/([^/]+)/) ||
    url.match(/[?&]id=([^&]+)/) ||
    url.match(/drive\.google\.com\/open\?id=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

/**
 * Resolve osuck download hop → cloud URL → preferably a direct binary URL.
 * Warms session once, then tries only available hosts (short-circuit).
 */
export async function resolveOsuckDownload(options: {
  skinId: number
  checksum: string
  variantIndex: number
  preferredHost?: SkinHost
  /** Only try these hosts (from package metadata). */
  hosts?: SkinHost[]
  fileName?: string
}): Promise<ResolvedSkinDownload> {
  const skinId = Math.floor(Number(options.skinId) || 0)
  const checksum = (options.checksum || '').trim()
  const variant = Math.max(0, Math.min(3, Math.floor(options.variantIndex || 0)))
  if (!skinId || !checksum) throw new Error('Недостаточно данных для скачивания')

  const available =
    options.hosts && options.hosts.length
      ? options.hosts
      : ([...HOST_PRIORITY] as SkinHost[])

  const ordered: SkinHost[] = []
  if (options.preferredHost && available.includes(options.preferredHost)) {
    ordered.push(options.preferredHost)
  }
  for (const h of HOST_PRIORITY) {
    if (available.includes(h) && !ordered.includes(h)) ordered.push(h)
  }
  // Never spend minutes on MEGA auto-download — only if it's the sole host
  const tryHosts =
    ordered.length === 1 && ordered[0] === 'mega'
      ? ordered
      : ordered.filter((h) => h !== 'mega').concat(ordered.includes('mega') ? ['mega'] : [])

  const location = `/skins/${skinId}?tab=downloads`
  const jar: CookieJar = new Map()

  // One warm session for all host attempts
  await request(
    'GET',
    `${OSUCK_ORIGIN}${location}`,
    {
      Accept: 'text/html,application/xhtml+xml',
      'X-Request-Params': buildBoostParams(),
      'X-Request-Location': location,
    },
    null,
    jar,
    0
  )
  await ensureSession(jar, location)
  await request(
    'POST',
    `${OSUCK_ORIGIN}/api/details`,
    {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Request-Params': buildBoostParams(),
      'X-Request-Location': location,
      Origin: OSUCK_ORIGIN,
      Referer: `${OSUCK_ORIGIN}${location}`,
    },
    JSON.stringify({ a: 'd', b: skinId, c: 0 }),
    jar,
    0
  )

  const fileName = options.fileName || `skin-${skinId}.osk`
  let lastErr: Error | null = null

  for (const host of tryHosts) {
    try {
      // Refresh download cookies each attempt
      jar.set('autem', buildDownloadAutem())
      jar.set('lorem2', encodeURIComponent(location))
      jar.set('sit', '0')
      jar.set('modi', '1')

      const dlPath = `/downloads/skin-${variant}${checksum}${HOST_INDEX[host]}`
      const res = await request(
        'GET',
        `${OSUCK_ORIGIN}${dlPath}`,
        {
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          Referer: `${OSUCK_ORIGIN}${location}`,
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1',
        },
        null,
        jar,
        0
      )

      if (res.status === 429) throw new Error('Rate limit osuck download')
      if (res.status === 403) throw new Error(`osuck отказал (${host})`)
      if (res.status === 500) {
        throw new Error(
          res.body.toString('utf8').includes('Unknown behavior')
            ? `Хост ${host} недоступен (osuck)`
            : `osuck download 500 (${host})`
        )
      }

      const cloudUrl = res.headers.location ? String(res.headers.location) : ''
      if (!cloudUrl) throw new Error(`Нет redirect (${host}, ${res.status})`)

      if (host === 'mega' || /mega\.nz/i.test(cloudUrl)) {
        return {
          url: cloudUrl,
          host: 'mega',
          fileName,
          headers: {},
          openExternalOnly: true,
        }
      }

      if (host === 'google' || /drive\.google\.com|drive\.usercontent/i.test(cloudUrl)) {
        const driveId = extractDriveId(cloudUrl)
        if (!driveId) throw new Error('Не удалось разобрать Google Drive id')
        return {
          url: `https://drive.usercontent.google.com/download?id=${driveId}&export=download&confirm=t`,
          host: 'google',
          fileName: fileName.endsWith('.osk') ? fileName : `${fileName}.osk`,
          headers: {
            'User-Agent': USER_AGENT,
            Accept: '*/*',
            Referer: 'https://drive.google.com/',
          },
        }
      }

      return {
        url: cloudUrl,
        host: 'mediafire',
        fileName: fileName.endsWith('.osk') ? fileName : `${fileName}.osk`,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: '*/*',
          Referer: cloudUrl,
        },
      }
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
    }
  }
  throw lastErr || new Error('Не удалось получить ссылку на файл')
}

export function pickBestPackage(detail: SkinDetail): SkinPackageLink | null {
  if (!detail.packages.length) return null
  // Prefer osk with google or mediafire
  const ranked = [...detail.packages].sort((a, b) => {
    const score = (p: SkinPackageLink) => {
      let s = p.kind === 'osk' ? 100 : p.kind === 'lite' ? 50 : 10
      if (p.hosts.includes('google')) s += 20
      if (p.hosts.includes('mediafire')) s += 10
      return s
    }
    return score(b) - score(a)
  })
  return ranked[0] || null
}

export function hostIndex(host: SkinHost): number {
  return HOST_INDEX[host]
}

export function hostByIndex(i: number): SkinHost {
  return HOST_BY_INDEX[i] || 'google'
}

/** Headers for loading osuck screenshots from the renderer / net. */
export function osuckImageHeaders(refererPath = '/skins'): Record<string, string> {
  return {
    'User-Agent': USER_AGENT,
    Accept: 'image/webp,image/*,*/*',
    Referer: `${OSUCK_ORIGIN}${refererPath}`,
    'X-Request-Params': buildBoostParams(),
    'X-Request-Location': refererPath,
  }
}
