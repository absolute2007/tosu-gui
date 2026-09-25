/**
 * Official osu! website session (cookies) for search + beatmap downloads.
 * API v2 /beatmapsets/{id}/download is lazer-only; website download works with login.
 */
import { BrowserWindow, app, session, shell } from 'electron'
import type { Session } from 'electron'
import fs from 'fs'
import path from 'path'

const OSU_ORIGIN = 'https://osu.ppy.sh'
const PARTITION = 'persist:osu-official'
export function getCleanUserAgent(ses?: Session): string {
  try {
    const target = ses || session.fromPartition(PARTITION)
    const raw = target.getUserAgent()
    return raw.replace(/Electron\/\S+\s*/g, '').replace(/tosu-gui\S*\s*/g, '').trim()
  } catch {
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
  }
}

export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'

export interface OsuAccountInfo {
  loggedIn: boolean
  userId: number | null
  username: string | null
  avatarUrl: string | null
}

export function isValidAccount(account: unknown): account is OsuAccountInfo {
  if (!account || typeof account !== 'object') return false
  const a = account as Record<string, unknown>
  return (
    a.loggedIn === true &&
    typeof a.userId === 'number' &&
    a.userId > 0 &&
    typeof a.username === 'string' &&
    a.username.trim().length > 0 &&
    a.username.trim().toLowerCase() !== 'osu!'
  )
}

function getOsuSession(): Session {
  const ses = session.fromPartition(PARTITION)
  try {
    ses.setUserAgent(getCleanUserAgent(ses))
  } catch {
    /* ignore */
  }
  return ses
}

export async function getCookieHeader(): Promise<string> {
  const cookies = await getOsuSession().cookies.get({ url: OSU_ORIGIN })
  return cookies.map((c) => `${c.name}=${c.value}`).join('; ')
}

export async function hasOsuSessionCookie(): Promise<boolean> {
  const cookies = await getOsuSession().cookies.get({ url: OSU_ORIGIN, name: 'osu_session' })
  return cookies.length > 0 && Boolean(cookies[0]?.value)
}

async function getCsrfToken(): Promise<string | null> {
  const cookies = await getOsuSession().cookies.get({ url: OSU_ORIGIN })
  const xsrf = cookies.find((c) => c.name === 'XSRF-TOKEN')
  if (!xsrf?.value) return null
  try {
    return decodeURIComponent(xsrf.value)
  } catch {
    return xsrf.value
  }
}

export async function buildOsuHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  const ses = getOsuSession()
  const ua = getCleanUserAgent(ses)
  const cookie = await getCookieHeader()
  const csrf = await getCsrfToken()
  const headers: Record<string, string> = {
    'User-Agent': ua,
    Accept: 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: `${OSU_ORIGIN}/beatmapsets`,
    Origin: OSU_ORIGIN,
    ...(cookie ? { Cookie: cookie } : {}),
    ...extra,
  }
  if (csrf) {
    headers['X-CSRF-TOKEN'] = csrf
    headers['X-XSRF-TOKEN'] = csrf
  }
  return headers
}

function parseErrorMessage(body: string, status?: number): string {
  try {
    const j = JSON.parse(body) as { error?: string; message?: string; authentication?: string }
    if (j.error) return j.error
    if (j.message) return j.message
    if (j.authentication) return 'Нужно войти в osu!'
  } catch {
    /* ignore */
  }
  if (status === 401 || status === 403) return 'Нужно войти в osu! (сессия истекла или нет доступа)'
  if (status === 429) return 'Слишком много запросов — подождите немного'
  return `osu.ppy.sh HTTP ${status ?? '?'}`
}

async function requestJson(url: string, headers: Record<string, string>, timeoutMs = 25_000): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await getOsuSession().fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(parseErrorMessage(text, res.status))
    }
    try {
      return JSON.parse(text)
    } catch {
      throw new Error('Некорректный JSON от osu.ppy.sh')
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Таймаут запроса к osu.ppy.sh')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

async function requestText(url: string, headers: Record<string, string>, timeoutMs = 25_000): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await getOsuSession().fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal,
    })
    const text = await res.text()
    if (!res.ok) {
      throw new Error(parseErrorMessage(text, res.status))
    }
    return text
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Таймаут запроса к osu.ppy.sh')
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

function parseUserFromHtml(html: string): Pick<OsuAccountInfo, 'userId' | 'username' | 'avatarUrl'> | null {
  // osu-web embeds current user as JSON in several places
  const scriptMatch = html.match(
    /<script id="json-current-user"[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/i
  )
  if (scriptMatch?.[1]) {
    try {
      const data = JSON.parse(scriptMatch[1]) as Record<string, unknown>
      const id = Number(data.id) || 0
      const username = typeof data.username === 'string' ? data.username.trim() : null
      if (id > 0 && username && username.toLowerCase() !== 'osu!') {
        return {
          userId: id,
          username,
          avatarUrl: typeof data.avatar_url === 'string' ? data.avatar_url : null,
        }
      }
      // If script is present with {} or id=0, this is definitively a guest page
      return null
    } catch {
      return null
    }
  }

  return null
}

function getAccountCachePath(): string {
  try {
    return path.join(app.getPath('userData'), 'osu-account.json')
  } catch {
    return ''
  }
}

let memoryAccountCache: OsuAccountInfo | null = null

function readPersistedAccountCache(): OsuAccountInfo | null {
  if (memoryAccountCache) {
    if (isValidAccount(memoryAccountCache)) return memoryAccountCache
    memoryAccountCache = null
  }
  try {
    const p = getAccountCachePath()
    if (p && fs.existsSync(p)) {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as unknown
      if (isValidAccount(parsed)) {
        memoryAccountCache = parsed
        return parsed
      }
      try {
        fs.unlinkSync(p)
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return null
}

function writePersistedAccountCache(account: OsuAccountInfo | null): void {
  if (isValidAccount(account)) {
    memoryAccountCache = account
    try {
      const p = getAccountCachePath()
      if (!p) return
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, JSON.stringify(account, null, 2), 'utf8')
    } catch {
      /* ignore */
    }
  } else {
    memoryAccountCache = null
    try {
      const p = getAccountCachePath()
      if (p && fs.existsSync(p)) fs.unlinkSync(p)
    } catch {
      /* ignore */
    }
  }
}

let backgroundRefreshInFlight = false
let lastAccountRefreshOnlineAt = 0
const ACCOUNT_REFRESH_TTL_MS = 5 * 60 * 1000

async function refreshOsuAccountInBackground(): Promise<void> {
  if (backgroundRefreshInFlight) return
  if (Date.now() - lastAccountRefreshOnlineAt < ACCOUNT_REFRESH_TTL_MS) return
  backgroundRefreshInFlight = true
  try {
    if (await hasOsuSessionCookie()) {
      await queryOsuAccountOnline()
      lastAccountRefreshOnlineAt = Date.now()
    }
  } catch {
    /* ignore background errors */
  } finally {
    backgroundRefreshInFlight = false
  }
}

async function queryOsuAccountOnline(): Promise<OsuAccountInfo> {
  const empty: OsuAccountInfo = { loggedIn: false, userId: null, username: null, avatarUrl: null }
  if (!(await hasOsuSessionCookie())) {
    writePersistedAccountCache(null)
    return empty
  }

  try {
    const headers = await buildOsuHeaders({ Accept: 'text/html,application/xhtml+xml' })
    const html = await requestText(`${OSU_ORIGIN}/home`, headers, 12_000)
    const parsed = parseUserFromHtml(html)
    if (parsed?.username && parsed?.userId) {
      const account: OsuAccountInfo = {
        loggedIn: true,
        userId: parsed.userId,
        username: parsed.username,
        avatarUrl: parsed.avatarUrl,
      }
      writePersistedAccountCache(account)
      lastAccountRefreshOnlineAt = Date.now()
      return account
    }
  } catch {
    const cached = readPersistedAccountCache()
    if (cached && isValidAccount(cached)) {
      return cached
    }
  }

  writePersistedAccountCache(null)
  return empty
}

export async function fetchOsuAccount(options?: { forceRefresh?: boolean }): Promise<OsuAccountInfo> {
  const empty: OsuAccountInfo = { loggedIn: false, userId: null, username: null, avatarUrl: null }
  if (!(await hasOsuSessionCookie())) {
    writePersistedAccountCache(null)
    return empty
  }

  const cached = readPersistedAccountCache()
  if (!options?.forceRefresh && cached && isValidAccount(cached)) {
    if (Date.now() - lastAccountRefreshOnlineAt >= ACCOUNT_REFRESH_TTL_MS) {
      setTimeout(() => {
        void refreshOsuAccountInBackground()
      }, 1200)
    }
    return cached
  }

  return await queryOsuAccountOnline()
}

export async function osuJsonGet(pathOrUrl: string): Promise<unknown> {
  if (!(await hasOsuSessionCookie())) {
    throw new Error('Войдите в osu!, чтобы искать и скачивать карты')
  }
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${OSU_ORIGIN}${pathOrUrl}`
  const headers = await buildOsuHeaders()
  return requestJson(url, headers)
}

/** Raw text from osu.ppy.sh (e.g. /osu/{beatmapId} difficulty file). */
export async function osuTextGet(pathOrUrl: string): Promise<string> {
  if (!(await hasOsuSessionCookie())) {
    throw new Error('Войдите в osu!, чтобы искать и скачивать карты')
  }
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${OSU_ORIGIN}${pathOrUrl}`
  const headers = await buildOsuHeaders({
    Accept: 'text/plain,text/*,*/*',
  })
  return requestText(url, headers)
}

export async function clearOsuSession(): Promise<void> {
  writePersistedAccountCache(null)
  await getOsuSession().clearStorageData({
    storages: ['cookies', 'localstorage', 'cachestorage', 'indexdb', 'websql', 'serviceworkers'],
  })
}

let loginWindow: BrowserWindow | null = null

/**
 * Open a login window. Resolves when user is logged in or window closed.
 */
export function loginWithOsuWindow(parent: BrowserWindow | null): Promise<OsuAccountInfo> {
  return new Promise((resolve) => {
    if (loginWindow && !loginWindow.isDestroyed()) {
      loginWindow.focus()
      const prevClosed = loginWindow
      prevClosed.once('closed', () => {
        void fetchOsuAccount({ forceRefresh: true }).then(resolve)
      })
      return
    }

    const ses = getOsuSession()
    loginWindow = new BrowserWindow({
      width: 980,
      height: 720,
      minWidth: 640,
      minHeight: 520,
      parent: parent ?? undefined,
      modal: false,
      autoHideMenuBar: true,
      title: 'Вход в osu!',
      backgroundColor: '#1a1a1a',
      webPreferences: {
        session: ses,
        contextIsolation: false,
        nodeIntegration: false,
        sandbox: false,
      },
    })

    let settled = false
    const finish = (account: OsuAccountInfo) => {
      if (settled) return
      settled = true
      stopPoll()
      writePersistedAccountCache(isValidAccount(account) ? account : null)
      resolve(account)
      if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.close()
      }
      loginWindow = null
    }

    let pollTimer: ReturnType<typeof setInterval> | null = null
    const stopPoll = () => {
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
    }

    const checkWindowLogin = async () => {
      if (!loginWindow || loginWindow.isDestroyed()) return
      const currentUrl = loginWindow.webContents.getURL()
      if (currentUrl.includes('challenges.cloudflare.com')) return
      try {
        const user = await loginWindow.webContents.executeJavaScript(`
          (() => {
            const el = document.getElementById('json-current-user');
            if (el) {
              try {
                const data = JSON.parse(el.textContent || '{}');
                if (data && Number(data.id) > 0 && typeof data.username === 'string' && data.username.trim() && data.username.trim().toLowerCase() !== 'osu!') {
                  return {
                    loggedIn: true,
                    userId: Number(data.id),
                    username: String(data.username).trim(),
                    avatarUrl: data.avatar_url ? String(data.avatar_url) : null
                  };
                }
              } catch {}
            }
            return null;
          })()
        `)
        if (user && isValidAccount(user)) {
          finish(user)
        }
      } catch {
        /* page might be navigating, ignore */
      }
    }

    loginWindow.webContents.on('dom-ready', () => {
      loginWindow?.webContents
        .executeJavaScript(
          `try {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
          } catch {}`
        )
        .catch(() => {})
    })

    loginWindow.webContents.on('did-navigate', () => {
      void checkWindowLogin()
    })
    loginWindow.webContents.on('did-navigate-in-page', () => {
      void checkWindowLogin()
    })

    pollTimer = setInterval(() => {
      void checkWindowLogin()
    }, 2000)

    loginWindow.on('closed', () => {
      stopPoll()
      if (!settled) {
        settled = true
        void queryOsuAccountOnline().then(resolve)
      }
      loginWindow = null
    })

    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: 'deny' }
    })

    void loginWindow.loadURL(`${OSU_ORIGIN}/home`)
  })
}

export { OSU_ORIGIN, getOsuSession }
