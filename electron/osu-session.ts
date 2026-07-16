/**
 * Official osu! website session (cookies) for search + beatmap downloads.
 * API v2 /beatmapsets/{id}/download is lazer-only; website download works with login.
 */
import { BrowserWindow, session, shell } from 'electron'
import type { Session } from 'electron'
import http from 'http'
import https from 'https'
import { URL } from 'url'

const OSU_ORIGIN = 'https://osu.ppy.sh'
const PARTITION = 'persist:osu-official'
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 tosu-gui'

export interface OsuAccountInfo {
  loggedIn: boolean
  userId: number | null
  username: string | null
  avatarUrl: string | null
}

function getOsuSession(): Session {
  return session.fromPartition(PARTITION)
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
  const cookie = await getCookieHeader()
  const csrf = await getCsrfToken()
  const headers: Record<string, string> = {
    'User-Agent': USER_AGENT,
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

function requestJson(url: string, headers: Record<string, string>, timeoutMs = 25_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const lib = parsed.protocol === 'https:' ? https : http
    const req = lib.get(
      url,
      {
        headers,
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          requestJson(new URL(res.headers.location, url).href, headers, timeoutMs).then(resolve, reject)
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          if (!res.statusCode || res.statusCode >= 400) {
            reject(new Error(parseErrorMessage(text, res.statusCode)))
            return
          }
          try {
            resolve(JSON.parse(text))
          } catch {
            reject(new Error('Некорректный JSON от osu.ppy.sh'))
          }
        })
        res.on('error', reject)
      }
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Таймаут запроса к osu.ppy.sh'))
    })
  })
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

function requestText(url: string, headers: Record<string, string>, timeoutMs = 25_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const lib = parsed.protocol === 'https:' ? https : http
    const req = lib.get(url, { headers, timeout: timeoutMs }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        requestText(new URL(res.headers.location, url).href, headers, timeoutMs).then(resolve, reject)
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8')
        if (!res.statusCode || res.statusCode >= 400) {
          reject(new Error(parseErrorMessage(text, res.statusCode)))
          return
        }
        resolve(text)
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Таймаут запроса к osu.ppy.sh'))
    })
  })
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
      if (id) {
        return {
          userId: id,
          username: typeof data.username === 'string' ? data.username : null,
          avatarUrl: typeof data.avatar_url === 'string' ? data.avatar_url : null,
        }
      }
    } catch {
      /* fall through */
    }
  }

  const userMatch = html.match(/"username"\s*:\s*"([^"\\]+)"/)
  const idMatch = html.match(/"id"\s*:\s*(\d{1,12})/)
  const avatarMatch = html.match(/"avatar_url"\s*:\s*"([^"\\]+)"/)
  if (userMatch || idMatch) {
    return {
      userId: idMatch ? parseInt(idMatch[1], 10) : null,
      username: userMatch ? userMatch[1] : null,
      avatarUrl: avatarMatch ? avatarMatch[1].replace(/\\u002F/g, '/') : null,
    }
  }
  return null
}

export async function fetchOsuAccount(): Promise<OsuAccountInfo> {
  const empty: OsuAccountInfo = { loggedIn: false, userId: null, username: null, avatarUrl: null }
  if (!(await hasOsuSessionCookie())) return empty

  try {
    const headers = await buildOsuHeaders({ Accept: 'text/html,application/xhtml+xml' })
    const html = await requestText(`${OSU_ORIGIN}/home`, headers)
    const parsed = parseUserFromHtml(html)
    if (parsed?.username || parsed?.userId) {
      return {
        loggedIn: true,
        userId: parsed.userId,
        username: parsed.username,
        avatarUrl: parsed.avatarUrl,
      }
    }
  } catch {
    /* cookie may still be valid for downloads */
  }

  // Session cookie present — enough for downloads
  return { loggedIn: true, userId: null, username: 'osu!', avatarUrl: null }
}

export async function osuJsonGet(pathOrUrl: string): Promise<unknown> {
  if (!(await hasOsuSessionCookie())) {
    throw new Error('Войдите в osu!, чтобы искать и скачивать карты')
  }
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${OSU_ORIGIN}${pathOrUrl}`
  const headers = await buildOsuHeaders()
  return requestJson(url, headers)
}

export async function clearOsuSession(): Promise<void> {
  await getOsuSession().clearStorageData({
    storages: ['cookies', 'localstorage', 'cachestorage', 'indexdb', 'websql', 'serviceworkers'],
  })
}

let loginWindow: BrowserWindow | null = null

/**
 * Open a login window. Resolves when user is logged in (osu_session cookie) or window closed.
 */
export function loginWithOsuWindow(parent: BrowserWindow | null): Promise<OsuAccountInfo> {
  return new Promise((resolve) => {
    if (loginWindow && !loginWindow.isDestroyed()) {
      loginWindow.focus()
      // Wait for the existing window to finish
      const prevClosed = loginWindow
      prevClosed.once('closed', () => {
        void fetchOsuAccount().then(resolve)
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
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    })

    let settled = false
    const finish = async () => {
      if (settled) return
      settled = true
      stopPoll()
      try {
        const account = await fetchOsuAccount()
        resolve(account)
      } catch {
        resolve({ loggedIn: false, userId: null, username: null, avatarUrl: null })
      }
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

    const checkLoggedIn = async () => {
      if (await hasOsuSessionCookie()) {
        // Give site a moment to set all cookies after login redirect
        const account = await fetchOsuAccount()
        if (account.loggedIn) {
          await finish()
        }
      }
    }

    pollTimer = setInterval(() => {
      void checkLoggedIn()
    }, 800)

    loginWindow.on('closed', () => {
      stopPoll()
      if (!settled) {
        settled = true
        void fetchOsuAccount().then(resolve)
      }
      loginWindow = null
    })

    loginWindow.webContents.setWindowOpenHandler(({ url }) => {
      void shell.openExternal(url)
      return { action: 'deny' }
    })

    void loginWindow.loadURL(`${OSU_ORIGIN}/home`)
    // If already logged in in this partition
    void checkLoggedIn()
  })
}

export { OSU_ORIGIN, USER_AGENT, getOsuSession }
