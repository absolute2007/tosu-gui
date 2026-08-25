import fs from 'fs'
import path from 'path'
import { createPackage, extractAll } from '@electron/asar'

const PATCH_MARKER = '.tray-patch-v2'

function patchMarkerPath(gameOverlayDir: string) {
  return path.join(gameOverlayDir, 'resources', PATCH_MARKER)
}

function isAlreadyPatched(gameOverlayDir: string): boolean {
  const markerPath = patchMarkerPath(gameOverlayDir)
  if (!fs.existsSync(markerPath)) return false

  const versionPath = path.join(gameOverlayDir, 'version')
  const overlayVersion = fs.existsSync(versionPath)
    ? fs.readFileSync(versionPath, 'utf8').trim()
    : 'unknown'

  return fs.readFileSync(markerPath, 'utf8').trim() === `${overlayVersion}:v2`
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
  if (!fs.existsSync(asarPath)) return false
  if (isAlreadyPatched(gameOverlayDir)) return false

  const extractDir = path.join(gameOverlayDir, 'resources', '.asar-patch-tmp')
  const targetIndex = path.join(extractDir, 'dist', 'src', 'index.js')
  const patchedAsar = `${asarPath}.patched`

  try {
    fs.rmSync(extractDir, { recursive: true, force: true })
    if (fs.existsSync(patchedAsar)) fs.unlinkSync(patchedAsar)

    extractAll(asarPath, extractDir)

    if (!fs.existsSync(targetIndex)) {
      console.warn('[overlay-patch] target index.js not found in asar')
      return false
    }

    const code = fs.readFileSync(targetIndex, 'utf8')
    if (!code.includes('__TosuGuiDummyTray')) {
      const dummyClass =
        'class __TosuGuiDummyTray{constructor(){this.isDummy=true}setToolTip(){}setContextMenu(){}on(){}once(){}destroy(){}};'
      const patched =
        dummyClass + code.replace(/new\s+(?:[a-zA-Z0-9_$]+\.)?Tray\s*\(/g, 'new __TosuGuiDummyTray(')
      fs.writeFileSync(targetIndex, patched, 'utf8')
    }

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
    fs.writeFileSync(patchMarkerPath(gameOverlayDir), `${overlayVersion}:v2`, 'utf8')

    console.log('[overlay-patch] ingame overlay tray removed successfully')
    return true
  } catch (err) {
    console.error('[overlay-patch] failed (non-fatal):', err)
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
