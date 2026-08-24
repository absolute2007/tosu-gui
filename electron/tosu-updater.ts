import { execSync } from 'child_process'
import fs from 'fs'
import http from 'http'
import https from 'https'
import path from 'path'

const GITHUB_LATEST = 'https://github.com/tosuapp/tosu/releases/latest'
const PRESERVE_NAMES = new Set(['static', 'settings', 'logs', '.cache', 'tosu.env', '.update-backup'])

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

export function normalizeVersion(version: string): string {
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
    if (!out || out === '0.0.0.0') return null
    return normalizeVersion(out)
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

export function formatUserFacingError(err: unknown, defaultMessage = 'Ошибка обновления'): string {
  if (!err) return defaultMessage

  const raw = err instanceof Error ? err.message : String(err)

  if (/EBUSY|EPERM|EACCES|занят другим процессом|access is denied/i.test(raw)) {
    return 'Файлы tosu заняты другим процессом. Закройте osu! и повторите попытку.'
  }
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|ECONNREFUSED|fetch failed|socket hang up/i.test(raw)) {
    return 'Не удалось загрузить файлы обновления (ошибка соединения). Проверьте интернет.'
  }
  if (/HTTP 403|rate limit/i.test(raw)) {
    return 'Превышен лимит запросов к GitHub. Пожалуйста, попробуйте через несколько минут.'
  }
  if (/HTTP 404/i.test(raw)) {
    return 'Файл обновления не найден на сервере GitHub.'
  }
  if (/слишком маленький|архив.*повреждён|archive entry was incomplete|end of central directory/i.test(raw)) {
    return 'Загруженный архив обновления повреждён или неполон. Попробуйте снова.'
  }
  if (/timed? ?out|превышено время ожидания/i.test(raw)) {
    return 'Превышено время ожидания при загрузке или запуске обновления.'
  }

  // Strip multi-line powershell/stack dumps
  const firstLine = raw.split('\n')[0].replace(/^Error:\s*/i, '').trim()
  if (firstLine.length > 0 && firstLine.length < 120 && !firstLine.includes('powershell -NoProfile')) {
    return firstLine
  }

  return defaultMessage
}

async function fetchLatestReleaseTag(): Promise<{ tag: string; url: string }> {
  const res = await fetch(GITHUB_LATEST, {
    redirect: 'follow',
    headers: { 'User-Agent': 'tosu-gui' },
  })

  const match = res.url.match(/\/tag\/(v[\d.]+)/i)
  if (!match) throw new Error('Не удалось определить версию релиза tosu')
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function extractZip(zipPath: string, destDir: string): void {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true })
  }

  // Fast path: use built-in tar (available in Win10+, macOS, Linux)
  try {
    const escapedDest = destDir.replace(/\\/g, '/')
    execSync(`tar -xf "${zipPath}" -C "${escapedDest}"`, {
      stdio: 'pipe',
      windowsHide: true,
      timeout: 60_000,
    })
    return
  } catch (tarErr) {
    console.warn('[tosu-updater] tar extraction failed, trying fallback:', tarErr)
  }

  // Fallback on Windows: PowerShell Expand-Archive
  if (process.platform === 'win32') {
    try {
      const escapedZip = zipPath.replace(/'/g, "''")
      const escapedDest = destDir.replace(/'/g, "''")
      execSync(
        `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${escapedZip}' -DestinationPath '${escapedDest}' -Force"`,
        { stdio: 'pipe', windowsHide: true, timeout: 120_000 }
      )
      return
    } catch (psErr) {
      throw new Error(`Ошибка распаковки архива: ${formatUserFacingError(psErr)}`)
    }
  }

  // Fallback on Unix: unzip
  try {
    execSync(`unzip -o "${zipPath}" -d "${destDir}"`, {
      stdio: 'pipe',
      windowsHide: true,
      timeout: 60_000,
    })
  } catch (unzipErr) {
    throw new Error(`Ошибка распаковки архива: ${formatUserFacingError(unzipErr)}`)
  }
}

function downloadFile(
  url: string,
  dest: string,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const follow = (fetchUrl: string, redirects = 0) => {
      if (redirects > 10) {
        reject(new Error('Слишком много перенаправлений при скачивании'))
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
          reject(new Error(`Сервер вернул ошибку HTTP ${res.statusCode}`))
          return
        }

        const total = parseInt(res.headers['content-length'] || '0', 10)
        let received = 0
        const fileStream = fs.createWriteStream(dest)

        res.on('data', (chunk: Buffer) => {
          received += chunk.length
          if (total > 0) {
            onProgress(Math.min(80, (received / total) * 80))
          }
        })

        res.pipe(fileStream)

        fileStream.on('finish', () => {
          fileStream.close(() => {
            try {
              if (!fs.existsSync(dest)) {
                reject(new Error('Файл обновления не был сохранён'))
                return
              }
              const size = fs.statSync(dest).size
              if (size < 1_000_000) {
                try { fs.unlinkSync(dest) } catch { /* ignore */ }
                reject(new Error('Загруженный архив обновления повреждён (размер слишком мал)'))
                return
              }
              if (total > 0 && received < total) {
                try { fs.unlinkSync(dest) } catch { /* ignore */ }
                reject(new Error('Загрузка обновления была прервана'))
                return
              }
              resolve()
            } catch (err) {
              reject(err)
            }
          })
        })

        fileStream.on('error', (err) => {
          try { fs.unlinkSync(dest) } catch { /* ignore */ }
          reject(err)
        })

        res.on('error', (err) => {
          try { fs.unlinkSync(dest) } catch { /* ignore */ }
          reject(err)
        })
      })

      req.on('error', (err) => {
        try { fs.unlinkSync(dest) } catch { /* ignore */ }
        reject(err)
      })

      req.setTimeout(300_000, () => {
        req.destroy()
        try { fs.unlinkSync(dest) } catch { /* ignore */ }
        reject(new Error('Превышено время ожидания загрузки'))
      })
    }

    follow(url)
  })
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
        throw new Error(formatUserFacingError(err, `Не удалось обновить «${name}»`))
      }
      await sleep(300 * (attempt + 1))
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
 * Creates a backup snapshot of current tosu executables & overlay
 * into `.update-backup` for safe rollback if update fails.
 */
export async function backupCurrentInstall(tosuDir: string): Promise<string> {
  const backupDir = path.join(tosuDir, '.update-backup')
  try {
    if (fs.existsSync(backupDir)) {
      fs.rmSync(backupDir, { recursive: true, force: true })
    }
    fs.mkdirSync(backupDir, { recursive: true })

    const filesToBackup = ['tosu.exe', 'tosu', 'version']
    for (const file of filesToBackup) {
      const src = path.join(tosuDir, file)
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(backupDir, file))
      }
    }

    const overlayDir = path.join(tosuDir, 'game-overlay')
    if (fs.existsSync(overlayDir)) {
      fs.cpSync(overlayDir, path.join(backupDir, 'game-overlay'), { recursive: true })
    }

    return backupDir
  } catch (err) {
    console.warn('[tosu-updater] backup failed:', err)
    return backupDir
  }
}

/**
 * Restores previous tosu files from `.update-backup` if an update failed.
 */
export async function restoreBackup(tosuDir: string): Promise<boolean> {
  const backupDir = path.join(tosuDir, '.update-backup')
  if (!fs.existsSync(backupDir)) {
    console.warn('[tosu-updater] rollback: no backup found at', backupDir)
    return false
  }

  try {
    console.log('[tosu-updater] rolling back tosu from backup...')
    const backupEntries = fs.readdirSync(backupDir, { withFileTypes: true })

    for (const entry of backupEntries) {
      const src = path.join(backupDir, entry.name)
      const dst = path.join(tosuDir, entry.name)
      await replacePath(src, dst, entry.name)
    }

    console.log('[tosu-updater] rollback completed successfully')
    return true
  } catch (err) {
    console.error('[tosu-updater] rollback failed:', err)
    return false
  }
}

export function cleanupBackup(tosuDir: string): void {
  const backupDir = path.join(tosuDir, '.update-backup')
  if (fs.existsSync(backupDir)) {
    try {
      fs.rmSync(backupDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

export function cleanupUpdateTemp(tosuDir: string): void {
  try {
    for (const name of fs.readdirSync(tosuDir)) {
      if (name.startsWith('.update-') && name !== '.update-backup') {
        const full = path.join(tosuDir, name)
        try {
          fs.rmSync(full, { recursive: true, force: true })
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
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
  const extractDir = path.join(tosuDir, '.update-overlay-tmp')
  const destOverlay = path.join(tosuDir, 'game-overlay')

  onProgress?.({
    phase: 'installing',
    progress: 91,
    message: 'Загрузка in-game overlay…',
  })

  try {
    await downloadFile(downloadUrl, zipPath, (pct) => {
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
        error: formatUserFacingError(err, 'Ошибка проверки обновлений'),
      }
    }
  }

  /**
   * Staged installation: downloads and extracts new tosu and matching overlay,
   * then merges into tosuDir. Note: version file is deliberately NOT committed
   * here — caller must verify successful launch before calling commitUpdate().
   */
  async stageAndInstall(
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

    onProgress({ phase: 'downloading', progress: 0, message: 'Загрузка обновления tosu…' })

    try {
      cleanupUpdateTemp(tosuDir)

      await downloadFile(info.downloadUrl, zipPath, (pct) => {
        onProgress({
          phase: 'downloading',
          progress: pct,
          message: `Загрузка… ${Math.round(pct)}%`,
        })
      })

      onProgress({ phase: 'extracting', progress: 82, message: 'Распаковка архива…' })
      fs.rmSync(extractDir, { recursive: true, force: true })
      fs.mkdirSync(extractDir, { recursive: true })
      extractZip(zipPath, extractDir)

      const sourceRoot = findTosuRoot(extractDir)
      if (!sourceRoot) throw new Error('tosu.exe не найден в загруженном архиве')

      onProgress({ phase: 'installing', progress: 90, message: 'Установка файлов…' })
      await mergeInstall(sourceRoot, tosuDir)

      // Overlay installation
      await installMatchingOverlay(tosuDir, info.latestVersion, onProgress)

      if (fs.existsSync(zipPath)) {
        try { fs.unlinkSync(zipPath) } catch { /* ignore */ }
      }
      fs.rmSync(extractDir, { recursive: true, force: true })

      return info.latestVersion
    } catch (err) {
      fs.rmSync(extractDir, { recursive: true, force: true })
      if (fs.existsSync(zipPath)) {
        try { fs.unlinkSync(zipPath) } catch { /* ignore */ }
      }
      throw new Error(formatUserFacingError(err, 'Ошибка при установке обновления'))
    }
  }

  /**
   * Finalizes the update after tosu has successfully started and responded.
   */
  commitUpdate(tosuDir: string, version: string): void {
    try {
      fs.writeFileSync(path.join(tosuDir, 'version'), normalizeVersion(version), 'utf8')
    } catch (err) {
      console.warn('[tosu-updater] commit version write failed:', err)
    }
    cleanupBackup(tosuDir)
    cleanupUpdateTemp(tosuDir)
  }
}