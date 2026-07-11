import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { createPackage, extractAll } from '@electron/asar'

const PATCH_MARKER = '.tray-patch-v1'

function getPatchedIndexPath() {
  const candidates = [
    // packaged extraResources
    path.join(process.resourcesPath, 'overlay-patch', 'index.js'),
    // dev / unpackaged
    path.join(app.getAppPath(), 'resources', 'overlay-patch', 'index.js'),
    // fallback relative to compiled main
    path.join(__dirname, '..', 'resources', 'overlay-patch', 'index.js'),
  ]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }

  return candidates[0]
}

function patchMarkerPath(gameOverlayDir: string) {
  return path.join(gameOverlayDir, 'resources', PATCH_MARKER)
}

function isAlreadyPatched(gameOverlayDir: string, patchedIndex: string): boolean {
  const markerPath = patchMarkerPath(gameOverlayDir)
  if (!fs.existsSync(markerPath)) return false

  const versionPath = path.join(gameOverlayDir, 'version')
  const overlayVersion = fs.existsSync(versionPath)
    ? fs.readFileSync(versionPath, 'utf8').trim()
    : 'unknown'
  const patchHash = createHash('sha256').update(fs.readFileSync(patchedIndex)).digest('hex')
  const expected = `${overlayVersion}:${patchHash}`

  return fs.readFileSync(markerPath, 'utf8').trim() === expected
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Replace a file that may be briefly locked on Windows (AV, explorer, etc.). */
async function replaceFile(src: string, dest: string) {
  const maxAttempts = 8
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (fs.existsSync(dest)) {
        const backup = `${dest}.bak-${Date.now()}`
        try {
          fs.renameSync(dest, backup)
          fs.rmSync(backup, { force: true })
        } catch {
          try {
            fs.unlinkSync(dest)
          } catch {
            /* fall through to copy overwrite */
          }
        }
      }

      try {
        fs.renameSync(src, dest)
      } catch {
        fs.copyFileSync(src, dest)
        fs.unlinkSync(src)
      }
      return
    } catch (err) {
      if (attempt === maxAttempts - 1) throw err
      await sleep(150 * (attempt + 1))
    }
  }
}

async function patchOverlayInDir(gameOverlayDir: string): Promise<boolean> {
  const asarPath = path.join(gameOverlayDir, 'resources', 'app.asar')
  const patchedIndex = getPatchedIndexPath()

  if (!fs.existsSync(asarPath) || !fs.existsSync(patchedIndex)) {
    if (!fs.existsSync(patchedIndex)) {
      console.warn('[overlay-patch] patch source missing:', patchedIndex)
    }
    return false
  }
  if (isAlreadyPatched(gameOverlayDir, patchedIndex)) return false

  const extractDir = path.join(gameOverlayDir, 'resources', '.asar-patch-tmp')
  const targetIndex = path.join(extractDir, 'dist', 'src', 'index.js')
  const patchedAsar = `${asarPath}.patched`

  try {
    fs.rmSync(extractDir, { recursive: true, force: true })
    if (fs.existsSync(patchedAsar)) fs.unlinkSync(patchedAsar)
    fs.mkdirSync(path.dirname(targetIndex), { recursive: true })

    extractAll(asarPath, extractDir)

    fs.copyFileSync(patchedIndex, targetIndex)

    for (const extra of ['bytecode-loader.cjs', 'index.jsc']) {
      const file = path.join(extractDir, 'dist', 'src', extra)
      if (fs.existsSync(file)) fs.unlinkSync(file)
    }

    await createPackage(extractDir, patchedAsar)
    await replaceFile(patchedAsar, asarPath)

    const versionPath = path.join(gameOverlayDir, 'version')
    const overlayVersion = fs.existsSync(versionPath)
      ? fs.readFileSync(versionPath, 'utf8').trim()
      : 'unknown'
    const patchHash = createHash('sha256').update(fs.readFileSync(patchedIndex)).digest('hex')
    fs.writeFileSync(patchMarkerPath(gameOverlayDir), `${overlayVersion}:${patchHash}`, 'utf8')

    console.log('[overlay-patch] ingame overlay tray removed')
    return true
  } catch (err) {
    console.error('[overlay-patch] failed:', err)
    return false
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true })
    if (fs.existsSync(patchedAsar)) {
      try {
        fs.unlinkSync(patchedAsar)
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Patch the in-game overlay asar (remove tray) if needed.
 * Must run while tosu-ingame-overlay is NOT running — call before spawning tosu.
 */
export async function patchIngameOverlay(tosuDir: string): Promise<boolean> {
  const gameOverlayDir = path.join(tosuDir, 'game-overlay')
  if (!fs.existsSync(gameOverlayDir)) return false
  return patchOverlayInDir(gameOverlayDir)
}
