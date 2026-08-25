const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const PATCHED_INDEX = path.join(__dirname, '..', 'resources', 'overlay-patch', 'index.js')
const PATCH_MARKER = '.tray-patch-v2'

function patchMarkerPath(gameOverlayDir) {
  return path.join(gameOverlayDir, 'resources', PATCH_MARKER)
}

function isAlreadyPatched(gameOverlayDir) {
  const markerPath = patchMarkerPath(gameOverlayDir)
  if (!fs.existsSync(markerPath)) return false

  const versionPath = path.join(gameOverlayDir, 'version')
  const overlayVersion = fs.existsSync(versionPath)
    ? fs.readFileSync(versionPath, 'utf8').trim()
    : 'unknown'
  return fs.readFileSync(markerPath, 'utf8').trim() === `${overlayVersion}:v2`
}

function patchOverlayInDir(gameOverlayDir) {
  const asarPath = path.join(gameOverlayDir, 'resources', 'app.asar')
  if (!fs.existsSync(asarPath)) return false
  if (isAlreadyPatched(gameOverlayDir)) return false

  const extractDir = path.join(gameOverlayDir, 'resources', '.asar-patch-tmp')
  const targetIndex = path.join(extractDir, 'dist', 'src', 'index.js')

  try {
    fs.rmSync(extractDir, { recursive: true, force: true })

    execSync(`npx --yes asar extract "${asarPath}" "${extractDir}"`, {
      stdio: 'pipe',
      windowsHide: true,
    })

    if (!fs.existsSync(targetIndex)) {
      console.warn('[overlay-patch] Target index.js not found in asar, skipping')
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

    const bytecodeLoader = path.join(extractDir, 'dist', 'src', 'bytecode-loader.cjs')
    const bytecodeIndex = path.join(extractDir, 'dist', 'src', 'index.jsc')
    if (fs.existsSync(bytecodeLoader)) fs.unlinkSync(bytecodeLoader)
    if (fs.existsSync(bytecodeIndex)) fs.unlinkSync(bytecodeIndex)

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
    fs.writeFileSync(patchMarkerPath(gameOverlayDir), `${overlayVersion}:v2`, 'utf8')

    return true
  } catch (err) {
    console.error('[overlay-patch] Failed:', err.message)
    return false
  } finally {
    fs.rmSync(extractDir, { recursive: true, force: true })
  }
}

function patchTosuOverlay(tosuDir) {
  const gameOverlayDir = path.join(tosuDir, 'game-overlay')
  if (!fs.existsSync(gameOverlayDir)) return false
  const ok = patchOverlayInDir(gameOverlayDir)
  if (ok) console.log('[overlay-patch] Removed ingame overlay tray icon')
  return ok
}

if (require.main === module) {
  const tosuDir = process.argv[2] || path.join(__dirname, '..', 'resources', 'tosu')
  patchTosuOverlay(tosuDir)
}

module.exports = { patchTosuOverlay, patchOverlayInDir }