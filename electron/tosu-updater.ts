import { execSync } from 'child_process'
import fs from 'fs'
import http from 'http'
import https from 'https'
import path from 'path'

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

function extractZip(zipPath: string, destDir: string): void {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true })
  }

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

  if (process.platform === 'win32') {
    const escapedZip = zipPath.replace(/'/g, "''")
    const escapedDest = destDir.replace(/'/g, "''")
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${escapedZip}' -DestinationPath '${escapedDest}' -Force"`,
      { stdio: 'pipe', windowsHide: true, timeout: 120_000 }
    )
    return
  }

  execSync(`unzip -o "${zipPath}" -d "${destDir}"`, {
    stdio: 'pipe',
    windowsHide: true,
    timeout: 60_000,
  })
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const follow = (fetchUrl: string, redirects = 0) => {
      if (redirects > 10) {
        reject(new Error('Too many redirects'))
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

        const fileStream = fs.createWriteStream(dest)
        res.pipe(fileStream)

        fileStream.on('finish', () => {
          fileStream.close(() => {
            if (!fs.existsSync(dest) || fs.statSync(dest).size < 100_000) {
              try { fs.unlinkSync(dest) } catch { /* ignore */ }
              reject(new Error('Downloaded file too small'))
              return
            }
            resolve()
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
        reject(new Error('Download timeout'))
      })
    }

    follow(url)
  })
}

function copyDirOverwriteSync(srcDir: string, destDir: string) {
  fs.mkdirSync(destDir, { recursive: true })
  const entries = fs.readdirSync(srcDir, { withFileTypes: true })
  for (const entry of entries) {
    const src = path.join(srcDir, entry.name)
    const dst = path.join(destDir, entry.name)
    if (entry.isDirectory()) {
      copyDirOverwriteSync(src, dst)
    } else {
      fs.copyFileSync(src, dst)
    }
  }
}

export async function installMatchingOverlay(
  tosuDir: string,
  version: string
): Promise<boolean> {
  const tag = `v${normalizeVersion(version)}`
  const assetName = `tosu-overlay-${tag}.zip`
  const downloadUrl = `https://github.com/tosuapp/tosu/releases/download/${tag}/${assetName}`
  const zipPath = path.join(tosuDir, `.update-${assetName}`)
  const extractDir = path.join(tosuDir, '.update-overlay-tmp')
  const destOverlay = path.join(tosuDir, 'game-overlay')

  try {
    await downloadFile(downloadUrl, zipPath)

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
      throw new Error('tosu-ingame-overlay.exe not found')
    }

    copyDirOverwriteSync(sourceRoot, destOverlay)

    const versionFile = path.join(destOverlay, 'version')
    fs.writeFileSync(versionFile, normalizeVersion(version), 'utf8')

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