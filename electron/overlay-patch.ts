import { createHash } from 'crypto'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { execSync } from 'child_process'

const PATCH_MARKER = '.tray-patch-v1'

function getPatchedIndexPath() {
  return path.join(app.getAppPath(), 'resources', 'overlay-patch', 'index.js')
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

function patchOverlayInDir(gameOverlayDir: string): boolean {
  const asarPath = path.join(gameOverlayDir, 'resources', 'app.asar')
  const patchedIndex = getPatchedIndexPath()

  if (!fs.existsSync(asarPath) || !fs.existsSync(patchedIndex)) return false
  if (isAlreadyPatched(gameOverlayDir, patchedIndex)) return false

  const extractDir = path.join(gameOverlayDir, 'resources', '.asar-patch-tmp')
  const targetIndex = path.join(extractDir, 'dist', 'src', 'index.js')

  try {
    fs.rmSync(extractDir, { recursive: true, force: true })
    fs.mkdirSync(path.dirname(targetIndex), { recursive: true })

    execSync(`npx --yes asar extract "${asarPath}" "${extractDir}"`, {
      stdio: 'pipe',
      windowsHide: true,
    })

    fs.copyFileSync(patchedIndex, targetIndex)

    for (const extra of ['bytecode-loader.cjs', 'index.jsc']) {
      const file = path.join(extractDir, 'dist', 'src', extra)
      if (fs.existsSync(file)) fs.unlinkSync(file)
    }

    const patchedAsar = `${asarPath}.patched`
    execSync(`npx --yes asar pack "${extractDir}" "${patchedAsar}"`, {
      stdio: 'pipe',
      windowsHide: true,
    })

    fs.renameSync(patchedAsar, asarPath)

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
  }
}

export function patchIngameOverlay(tosuDir: string): boolean {
  const gameOverlayDir = path.join(tosuDir, 'game-overlay')
  if (!fs.existsSync(gameOverlayDir)) return false
  return patchOverlayInDir(gameOverlayDir)
}