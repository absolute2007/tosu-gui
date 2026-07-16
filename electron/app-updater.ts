import { app } from 'electron'
import { execFile, spawn } from 'child_process'
import fs from 'fs'
import http from 'http'
import https from 'https'
import path from 'path'
import { compareVersions } from './tosu-updater'

const GITHUB_LATEST = 'https://api.github.com/repos/absolute2007/tosu-gui/releases/latest'
const GITHUB_LATEST_PAGE = 'https://github.com/absolute2007/tosu-gui/releases/latest'

export interface AppUpdateInfo {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  releaseUrl: string | null
  downloadUrl: string | null
  releaseNotes: string | null
  /** True when running unpackaged (dev) — install is unavailable */
  unsupported?: boolean
  error?: string
}

export type AppUpdatePhase =
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error'
  | 'not-available'

export interface AppUpdateProgress {
  phase: AppUpdatePhase
  progress: number
  message: string
}

interface GithubReleaseAsset {
  name: string
  browser_download_url: string
  size?: number
}

interface GithubRelease {
  tag_name: string
  html_url: string
  body?: string | null
  assets: GithubReleaseAsset[]
}

function normalizeVersion(version: string): string {
  return version.replace(/^v/i, '').trim()
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function releaseUrlFor(version: string | null): string | null {
  if (!version) return null
  const tag = version.startsWith('v') ? version : `v${version}`
  return `https://github.com/absolute2007/tosu-gui/releases/tag/${tag}`
}

/** Prefer NSIS Setup .exe; fall back to any .exe that is not a blockmap. */
function pickInstallerAsset(assets: GithubReleaseAsset[]): GithubReleaseAsset | null {
  const exes = assets.filter(
    (a) => a.name.toLowerCase().endsWith('.exe') && !a.name.toLowerCase().includes('blockmap')
  )
  if (exes.length === 0) return null

  const setup =
    exes.find((a) => /setup/i.test(a.name)) ||
    exes.find((a) => /tosu/i.test(a.name) && /gui/i.test(a.name)) ||
    exes[0]

  return setup
}

async function fetchLatestRelease(): Promise<GithubRelease> {
  try {
    const res = await fetch(GITHUB_LATEST, {
      headers: {
        'User-Agent': 'tosu-gui',
        Accept: 'application/vnd.github+json',
      },
    })
    if (res.ok) {
      return (await res.json()) as GithubRelease
    }
    // Fall through on rate limit / errors
  } catch {
    /* try HTML redirect below */
  }

  // Fallback: follow releases/latest redirect to get tag, then build download URL
  const page = await fetch(GITHUB_LATEST_PAGE, {
    redirect: 'follow',
    headers: { 'User-Agent': 'tosu-gui' },
  })
  const match = page.url.match(/\/tag\/(v[\d.]+)/i)
  if (!match) throw new Error('Не удалось определить версию релиза tosu GUI')

  const tag = match[1]
  const version = normalizeVersion(tag)
  // electron-builder names: "tosu GUI Setup 1.0.4.exe" → often published as dotted/spaced variants
  const candidates = [
    `tosu.GUI.Setup.${version}.exe`,
    `tosu GUI Setup ${version}.exe`,
    `tosu-GUI-Setup-${version}.exe`,
    `tosu.GUI.Setup.${version}.exe`.replace(/\s/g, '.'),
  ]

  return {
    tag_name: tag,
    html_url: page.url,
    body: null,
    assets: candidates.map((name) => ({
      name,
      browser_download_url: `https://github.com/absolute2007/tosu-gui/releases/download/${tag}/${encodeURIComponent(name)}`,
    })),
  }
}

function downloadFile(url: string, dest: string, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const follow = (fetchUrl: string, redirects = 0) => {
      if (redirects > 10) {
        reject(new Error('Слишком много редиректов'))
        return
      }

      const parsed = new URL(fetchUrl)
      const lib = parsed.protocol === 'https:' ? https : http

      const req = lib.get(fetchUrl, { headers: { 'User-Agent': 'tosu-gui' } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume()
          follow(new URL(res.headers.location, fetchUrl).href, redirects + 1)
          return
        }

        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`))
          return
        }

        const total = parseInt(res.headers['content-length'] || '0', 10)
        let received = 0
        const file = fs.createWriteStream(dest)

        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          if (total > 0) onProgress(Math.min(95, (received / total) * 95))
        })

        res.pipe(file)

        file.on('finish', () => {
          file.close(() => {
            try {
              const size = fs.statSync(dest).size
              if (size < 1_000_000) {
                reject(new Error('Загруженный установщик слишком маленький'))
                return
              }
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
          reject(err)
        })

        res.on('error', reject)
      })

      req.on('error', reject)
      req.setTimeout(600_000, () => {
        req.destroy()
        reject(new Error('Превышено время ожидания загрузки'))
      })
    }

    follow(url)
  })
}

/** Try multiple asset URLs until one downloads successfully. */
async function downloadFirstWorking(
  assets: GithubReleaseAsset[],
  dest: string,
  onProgress: (pct: number) => void
): Promise<GithubReleaseAsset> {
  let lastError: Error | null = null
  for (const asset of assets) {
    try {
      if (fs.existsSync(dest)) fs.unlinkSync(dest)
      await downloadFile(asset.browser_download_url, dest, onProgress)
      return asset
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      try {
        if (fs.existsSync(dest)) fs.unlinkSync(dest)
      } catch {
        /* ignore */
      }
    }
  }
  throw lastError || new Error('Не удалось скачать установщик')
}

let downloading = false

/** No-op setup for API symmetry with previous electron-updater wiring. */
export function setupAppUpdater(_getWindow?: () => unknown) {
  /* custom updater needs no global listeners */
}

export function getAppVersion(): string {
  return app.getVersion()
}

export async function checkAppUpdate(): Promise<AppUpdateInfo> {
  const currentVersion = normalizeVersion(app.getVersion())

  if (!app.isPackaged) {
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      releaseUrl: null,
      downloadUrl: null,
      releaseNotes: null,
      unsupported: true,
      error: 'Автообновление доступно только в установленной версии',
    }
  }

  try {
    const release = await fetchLatestRelease()
    const latestVersion = normalizeVersion(release.tag_name)
    const asset = pickInstallerAsset(release.assets || [])
    const updateAvailable = Boolean(latestVersion) && compareVersions(latestVersion, currentVersion) > 0

    return {
      currentVersion,
      latestVersion: latestVersion || null,
      updateAvailable,
      releaseUrl: release.html_url || releaseUrlFor(latestVersion),
      downloadUrl: asset?.browser_download_url ?? null,
      releaseNotes: typeof release.body === 'string' ? release.body.trim() || null : null,
    }
  } catch (err) {
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      releaseUrl: null,
      downloadUrl: null,
      releaseNotes: null,
      error: err instanceof Error ? err.message : 'Ошибка проверки обновлений',
    }
  }
}

/**
 * Download the Setup installer and launch it, then quit this app.
 * `beforeInstall` should stop child processes (tosu) cleanly.
 */
export async function downloadAndInstallAppUpdate(
  onProgress: (progress: AppUpdateProgress) => void,
  beforeInstall: () => Promise<void>
): Promise<void> {
  if (!app.isPackaged) {
    throw new Error('Автообновление доступно только в установленной версии')
  }
  if (downloading) {
    throw new Error('Обновление уже загружается')
  }

  downloading = true

  try {
    onProgress({ phase: 'checking', progress: 0, message: 'Проверка…' })
    const info = await checkAppUpdate()
    if (!info.updateAvailable || !info.latestVersion) {
      throw new Error(info.error || 'Обновление недоступно')
    }

    const release = await fetchLatestRelease()
    const assets = pickInstallerAsset(release.assets || [])
      ? release.assets.filter((a) => a.name.toLowerCase().endsWith('.exe'))
      : []

    // Prefer setup-named assets first
    const ordered = [...assets].sort((a, b) => {
      const score = (n: string) => (/setup/i.test(n) ? 0 : 1)
      return score(a.name) - score(b.name)
    })

    if (ordered.length === 0 && info.downloadUrl) {
      ordered.push({
        name: path.basename(new URL(info.downloadUrl).pathname),
        browser_download_url: info.downloadUrl,
      })
    }

    if (ordered.length === 0) {
      throw new Error('Установщик не найден в релизе')
    }

    const tempDir = path.join(app.getPath('temp'), 'tosu-gui-update')
    fs.mkdirSync(tempDir, { recursive: true })
    const dest = path.join(tempDir, `tosu-gui-setup-${info.latestVersion}.exe`)

    onProgress({ phase: 'downloading', progress: 2, message: 'Загрузка…' })
    await downloadFirstWorking(ordered, dest, (pct) => {
      onProgress({
        phase: 'downloading',
        progress: pct,
        message: `Загрузка… ${Math.round(pct)}%`,
      })
    })

    onProgress({ phase: 'downloaded', progress: 96, message: 'Загружено' })
    onProgress({ phase: 'installing', progress: 98, message: 'Запуск установщика…' })

    await beforeInstall()
    await sleep(300)

    // Launch NSIS installer and exit so files are not locked.
    // --updated is the flag electron-builder expects for in-app upgrades.
    await new Promise<void>((resolve, reject) => {
      try {
        if (process.platform === 'win32') {
          // ShellExecute-style: open installer elevated if needed
          const child = spawn(dest, ['--updated'], {
            detached: true,
            stdio: 'ignore',
            windowsHide: false,
          })
          child.once('error', () => {
            // Fallback: open via cmd start
            execFile(
              'cmd',
              ['/c', 'start', '', dest, '--updated'],
              { windowsHide: true },
              (execErr) => {
                if (execErr) reject(execErr)
                else resolve()
              }
            )
          })
          child.unref()
          // Give spawn a moment; don't wait for installer to finish
          setTimeout(() => resolve(), 400)
        } else {
          const child = spawn(dest, ['--updated'], { detached: true, stdio: 'ignore' })
          child.unref()
          setTimeout(() => resolve(), 400)
        }
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })

    onProgress({ phase: 'installing', progress: 100, message: 'Установка…' })
    app.quit()
  } finally {
    downloading = false
  }
}

export function isAppUpdateDownloading(): boolean {
  return downloading
}
