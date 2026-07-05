const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const PATCHED_INDEX = path.join(__dirname, '..', 'resources', 'overlay-patch', 'index.js')
const PATCH_MARKER = '.tray-patch-v1'

function patchMarkerPath(gameOverlayDir) {
  return path.join(gameOverlayDir, 'resources', PATCH_MARKER)
}

function isAlreadyPatched(gameOverlayDir) {
  const markerPath = patchMarkerPath(gameOverlayDir)
  if (!fs.existsSync(markerPath) || !fs.existsSync(PATCHED_INDEX)) return false

  const versionPath = path.join(gameOverlayDir, 'version')
  const overlayVersion = fs.existsSync(versionPath)
    ? fs.readFileSync(versionPath, 'utf8').trim()
    : 'unknown'
  const patchHash = crypto.createHash('sha256').update(fs.readFileSync(PATCHED_INDEX)).digest('hex')
  return fs.readFileSync(markerPath, 'utf8').trim() === `${overlayVersion}:${patchHash}`
}

function patchOverlayInDir(gameOverlayDir) {
  const asarPath = path.join(gameOverlayDir, 'resources', 'app.asar')
  if (!fs.existsSync(asarPath)) return false
  if (!fs.existsSync(PATCHED_INDEX)) {
    console.warn('[overlay-patch] Patched index.js not found, skipping')
    return false
  }
  if (isAlreadyPatched(gameOverlayDir)) return false

  const extractDir = path.join(gameOverlayDir, 'resources', '.asar-patch-tmp')
  const targetIndex = path.join(extractDir, 'dist', 'src', 'index.js')

  try {
    fs.rmSync(extractDir, { recursive: true, force: true })
    fs.mkdirSync(path.dirname(targetIndex), { recursive: true })

    execSync(`npx --yes asar extract "${asarPath}" "${extractDir}"`, {
      stdio: 'pipe',
      windowsHide: true,
    })

    fs.copyFileSync(PATCHED_INDEX, targetIndex)

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
    const patchHash = crypto.createHash('sha256').update(fs.readFileSync(PATCHED_INDEX)).digest('hex')
    fs.writeFileSync(patchMarkerPath(gameOverlayDir), `${overlayVersion}:${patchHash}`, 'utf8')

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