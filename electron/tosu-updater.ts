import { execSync } from 'child_process'
import fs from 'fs'
import http from 'http'
import https from 'https'
import path from 'path'


const GITHUB_LATEST = 'https://github.com/tosuapp/tosu/releases/latest'
const PRESERVE_NAMES = new Set(['static', 'settings', 'logs', '.cache', 'tosu.env'])

export interface TosuUpdateInfo {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  releaseUrl: string | null
  downloadUrl: string | null
  error?: string
}

export type UpdatePhase = 'downloading' | 'extracting' | 'installing' | 'restarting' | 'done' | 'error'

export interface UpdateProgress {
  phase: UpdatePhase
  progress: number
  message: string
}

function normalizeVersion(version: string): string {
  return version.replace(/^v/i, '').trim()
}

export function compareVersions(a: string, b: string): number {
  const pa = normalizeVersion(a).split('.').map((part) => parseInt(part, 10) || 0)
  const pb = normalizeVersion(b).split('.').map((part) => parseInt(part, 10) || 0)
  const len = Math.max(pa.length, pb.length)

  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da > db) return 1
    if (da < db) return -1
  }

  return 0
}

function getExeVersionWin(exePath: string): string | null {
  try {
    const escaped = exePath.replace(/'/g, "''")
    const out = execSync(
      `powershell -NoProfile -Command "(Get-Item -LiteralPath '${escaped}').VersionInfo.ProductVersion"`,
      { encoding: 'utf8', windowsHide: true }
    ).trim()
    return out ? normalizeVersion(out) : null
  } catch {
    return null
  }
}

export function getInstalledVersion(tosuDir: string): string | null {
  const versionFile = path.join(tosuDir, 'version')
  if (fs.existsSync(versionFile)) {
    const version = fs.readFileSync(versionFile, 'utf8').trim()
    if (version) return normalizeVersion(version)
  }

  const exeName = process.platform === 'win32' ? 'tosu.exe' : 'tosu'
  const exePath = path.join(tosuDir, exeName)
  if (fs.existsSync(exePath) && process.platform === 'win32') {
    const version = getExeVersionWin(exePath)
    if (version) return version
  }

  const overlayPkg = path.join(tosuDir, 'game-overlay', 'resources', 'app-extracted', 'package.json')
  if (fs.existsSync(overlayPkg)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(overlayPkg, 'utf8')) as { version?: string }
      if (pkg.version) return normalizeVersion(pkg.version)
    } catch {
      /* ignore */
    }
  }

  return null
}

async function fetchLatestReleaseTag(): Promise<{ tag: string; url: string }> {
  const res = await fetch(GITHUB_LATEST, {
    redirect: 'follow',
    headers: { 'User-Agent': 'tosu-gui' },
  })

  const match = res.url.match(/\/tag\/(v[\d.]+)/i)
  if (!match) throw new Error('Не удалось определить версию релиза')
  return { tag: match[1], url: res.url }
}

function findTosuRoot(dir: string): string | null {
  const exeName = process.platform === 'win32' ? 'tosu.exe' : 'tosu'
  const direct = path.join(dir, exeName)
  if (fs.existsSync(direct)) return dir

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const found = findTosuRoot(path.join(dir, entry.name))
    if (found) return found
  }

  return null
}

function extractZip(zipPath: string, destDir: string) {
  if (process.platform === 'win32') {
    const escapedZip = zipPath.replace(/'/g, "''")
    const escapedDest = destDir.replace(/'/g, "''")
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${escapedZip}' -DestinationPath '${escapedDest}' -Force"`,
      { stdio: 'pipe', windowsHide: true }
    )
    return
  }

  execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: 'pipe', windowsHide: true })
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatFsError(err: unknown, targetName: string) {
  const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : ''
  if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
    return `Файл «${targetName}» занят другим процессом. Закройте osu! и повторите.`
  }
  if (err instanceof Error) return err.message
  return `Не удалось обновить «${targetName}»`
}

async function replacePath(src: string, dst: string, name: string) {
  const isDir = fs.statSync(src).isDirectory()
  const maxAttempts = 10

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (fs.existsSync(dst)) {
        const backup = `${dst}.bak-${Date.now()}`
        try {
          fs.renameSync(dst, backup)
          fs.rmSync(backup, { recursive: true, force: true })
        } catch {
          if (fs.statSync(dst).isDirectory()) {
            fs.rmSync(dst, { recursive: true, force: true })
          } else {
            fs.unlinkSync(dst)
          }
        }
      }

      if (isDir) {
        fs.cpSync(src, dst, { recursive: true })
      } else {
        fs.copyFileSync(src, dst)
      }
      return
    } catch (err) {
      if (attempt === maxAttempts - 1) {
        throw new Error(formatFsError(err, name))
      }
      await sleep(400 * (attempt + 1))
    }
  }
}

async function mergeInstall(sourceRoot: string, destDir: string) {
  const sourceEntries = fs.readdirSync(sourceRoot, { withFileTypes: true })

  for (const entry of sourceEntries) {
    if (PRESERVE_NAMES.has(entry.name)) continue

    const src = path.join(sourceRoot, entry.name)
    const dst = path.join(destDir, entry.name)
    await replacePath(src, dst, entry.name)
  }

}

/**
 * Install the matching in-game overlay package for a tosu version.
 * Recent tosu releases ship tosu.exe alone; the overlay is a separate
 * asset (`tosu-overlay-vX.Y.Z.zip`) and must track the same version.
 */
export async function installMatchingOverlay(
  tosuDir: string,
  version: string,
  onProgress?: (progress: UpdateProgress) => void
): Promise<boolean> {
  const tag = `v${normalizeVersion(version)}`
  const assetName = `tosu-overlay-${tag}.zip`
  const downloadUrl = `https://github.com/tosuapp/tosu/releases/download/${tag}/${assetName}`
  const zipPath = path.join(tosuDir, `.update-${assetName}`)
  const extractDir = path.join(tosuDir, '.overlay-update-tmp')
  const destOverlay = path.join(tosuDir, 'game-overlay')

  onProgress?.({
    phase: 'installing',
    progress: 91,
    message: 'Загрузка in-game overlay…',
  })

  try {
    await downloadFile(downloadUrl, zipPath, (pct) => {
      // Map 0–80 download scale into a narrow install band
      const mapped = 91 + (pct / 80) * 3
      onProgress?.({
        phase: 'installing',
        progress: Math.min(94, mapped),
        message: `Загрузка overlay… ${Math.round(pct)}%`,
      })
    })

    fs.rmSync(extractDir, { recursive: true, force: true })
    fs.mkdirSync(extractDir, { recursive: true })
    extractZip(zipPath, extractDir)

    // Archive is the game-overlay folder contents (exe + resources + version)
    const hasExe = fs.existsSync(path.join(extractDir, 'tosu-ingame-overlay.exe'))
    const nested = path.join(extractDir, 'game-overlay')
    const sourceRoot = hasExe
      ? extractDir
      : fs.existsSync(path.join(nested, 'tosu-ingame-overlay.exe'))
        ? nested
        : null

    if (!sourceRoot) {
      throw new Error('tosu-ingame-overlay.exe не найден в архиве overlay')
    }

    if (fs.existsSync(destOverlay)) {
      await replacePath(sourceRoot, destOverlay, 'game-overlay')
    } else {
      fs.cpSync(sourceRoot, destOverlay, { recursive: true })
    }

    // Ensure version file matches (archive usually includes it)
    const versionFile = path.join(destOverlay, 'version')
    if (!fs.existsSync(versionFile)) {
      fs.writeFileSync(versionFile, normalizeVersion(version), 'utf8')
    }

    // Drop tray-patch marker so the new asar is re-patched on next start
    const marker = path.join(destOverlay, 'resources', '.tray-patch-v1')
    if (fs.existsSync(marker)) {
      try {
        fs.unlinkSync(marker)
      } catch {
        /* ignore */
      }
    }

    onProgress?.({
      phase: 'installing',
      progress: 94,
      message: 'Overlay установлен',
    })
    return true
  } catch (err) {
    console.warn('[tosu-updater] overlay install failed (non-fatal):', err)
    // Leave version-mismatched or missing overlay for tosu to fetch on start
    return false
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true })
    if (fs.existsSync(zipPath)) {
      try {
        fs.unlinkSync(zipPath)
      } catch {
        /* ignore */
      }
    }
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
        const chunks: Buffer[] = []

        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          chunks.push(chunk)
          if (total > 0) onProgress(Math.min(80, (received / total) * 80))
        })

        res.on('end', () => {
          const buffer = Buffer.concat(chunks)
          if (buffer.length < 10_000) {
            reject(new Error('Загруженный файл слишком маленький'))
            return
          }
          fs.writeFileSync(dest, buffer)
          resolve()
        })

        res.on('error', reject)
      })

      req.on('error', reject)
      req.setTimeout(300_000, () => {
        req.destroy()
        reject(new Error('Превышено время ожидания загрузки'))
      })
    }

    follow(url)
  })
}

export class TosuUpdater {
  async checkForUpdate(tosuDir: string): Promise<TosuUpdateInfo> {
    const currentVersion = getInstalledVersion(tosuDir)
    if (!currentVersion) {
      return {
        currentVersion: 'unknown',
        latestVersion: null,
        updateAvailable: false,
        releaseUrl: null,
        downloadUrl: null,
        error: 'Версия tosu не определена',
      }
    }

    try {
      const { tag, url } = await fetchLatestReleaseTag()
      const latestVersion = normalizeVersion(tag)
      const updateAvailable = compareVersions(latestVersion, currentVersion) > 0
      const assetName =
        process.platform === 'win32' ? `tosu-windows-${tag}.zip` : `tosu-linux-${tag}.zip`
      const downloadUrl = `https://github.com/tosuapp/tosu/releases/download/${tag}/${assetName}`

      return {
        currentVersion,
        latestVersion,
        updateAvailable,
        releaseUrl: url,
        downloadUrl,
      }
    } catch (err) {
      return {
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        releaseUrl: null,
        downloadUrl: null,
        error: err instanceof Error ? err.message : 'Ошибка проверки обновлений',
      }
    }
  }

  async installUpdate(
    tosuDir: string,
    onProgress: (progress: UpdateProgress) => void
  ): Promise<string> {
    const info = await this.checkForUpdate(tosuDir)
    if (!info.updateAvailable || !info.latestVersion || !info.downloadUrl) {
      throw new Error('Обновление недоступно')
    }

    const tag = `v${info.latestVersion}`
    const zipName =
      process.platform === 'win32' ? `tosu-windows-${tag}.zip` : `tosu-linux-${tag}.zip`
    const zipPath = path.join(tosuDir, `.update-${zipName}`)
    const extractDir = path.join(tosuDir, '.update-tmp')

    onProgress({ phase: 'downloading', progress: 0, message: 'Загрузка обновления…' })

    try {
      await downloadFile(info.downloadUrl, zipPath, (pct) => {
        onProgress({
          phase: 'downloading',
          progress: pct,
          message: `Загрузка… ${Math.round(pct)}%`,
        })
      })

      onProgress({ phase: 'extracting', progress: 82, message: 'Распаковка…' })
      fs.rmSync(extractDir, { recursive: true, force: true })
      fs.mkdirSync(extractDir, { recursive: true })
      extractZip(zipPath, extractDir)

      const sourceRoot = findTosuRoot(extractDir)
      if (!sourceRoot) throw new Error('tosu.exe не найден в архиве')

      onProgress({ phase: 'installing', progress: 90, message: 'Установка…' })
      await mergeInstall(sourceRoot, tosuDir)
      fs.writeFileSync(path.join(tosuDir, 'version'), info.latestVersion, 'utf8')

      // tosu-windows zip no longer embeds game-overlay — fetch the matching
      // overlay package so version stamps stay in sync and rendering works.
      await installMatchingOverlay(tosuDir, info.latestVersion, onProgress)

      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath)
      fs.rmSync(extractDir, { recursive: true, force: true })

      onProgress({ phase: 'done', progress: 100, message: 'Обновление установлено' })
      return info.latestVersion
    } catch (err) {
      fs.rmSync(extractDir, { recursive: true, force: true })
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath)
      throw err
    }
  }
}