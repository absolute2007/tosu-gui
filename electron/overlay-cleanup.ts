import fs from 'fs'
import path from 'path'

const SEED_OVERLAY_PATHS = [
  path.join(process.env.USERPROFILE || '', 'Desktop', 'Folders', 'Tosu', 'game-overlay'),
  path.join(process.env.USERPROFILE || '', 'Documents', 'dev-projects', 'osu-auto', 'tosu_bin', 'game-overlay'),
]

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function getGameOverlayDir(tosuDir: string) {
  return path.join(tosuDir, 'game-overlay')
}

export function isGameOverlayValid(tosuDir: string) {
  const overlayDir = getGameOverlayDir(tosuDir)
  if (!fs.existsSync(overlayDir)) return false
  return fs.existsSync(path.join(overlayDir, 'tosu-ingame-overlay.exe'))
}

export function isGameOverlayBroken(tosuDir: string) {
  const overlayDir = getGameOverlayDir(tosuDir)
  if (!fs.existsSync(overlayDir)) return false
  if (isGameOverlayValid(tosuDir)) return false
  return fs.readdirSync(overlayDir).length > 0
}

export async function removeGameOverlay(tosuDir: string) {
  const overlayDir = getGameOverlayDir(tosuDir)
  if (!fs.existsSync(overlayDir)) return

  const maxAttempts = 12
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      fs.rmSync(overlayDir, { recursive: true, force: true })
      return
    } catch {
      await sleep(500 * (attempt + 1))
    }
  }

  throw new Error('Не удалось очистить game-overlay — закройте osu! и перезапустите tosu GUI')
}

function normalizeVersion(version: string) {
  return version.replace(/^v/i, '').trim()
}

function writeOverlayVersion(tosuDir: string, tosuVersion: string) {
  const versionPath = path.join(getGameOverlayDir(tosuDir), 'version')
  fs.writeFileSync(versionPath, normalizeVersion(tosuVersion), 'utf8')
}

export async function seedGameOverlayIfMissing(tosuDir: string) {
  if (isGameOverlayValid(tosuDir)) return true

  if (isGameOverlayBroken(tosuDir)) {
    await removeGameOverlay(tosuDir)
  }

  const dest = getGameOverlayDir(tosuDir)
  for (const seed of SEED_OVERLAY_PATHS) {
    if (!fs.existsSync(path.join(seed, 'tosu-ingame-overlay.exe'))) continue
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true })
    }
    fs.cpSync(seed, dest, { recursive: true })
    console.log('[overlay] seeded game-overlay from', seed)
    return true
  }

  return false
}

/** Restore overlay after tosu.exe-only updates and skip broken built-in overlay updater. */
export async function ensureGameOverlay(tosuDir: string, tosuVersion?: string | null) {
  if (isGameOverlayBroken(tosuDir)) {
    await removeGameOverlay(tosuDir)
  }

  let seeded = false
  if (!isGameOverlayValid(tosuDir)) {
    seeded = await seedGameOverlayIfMissing(tosuDir)
    if (!seeded) return false
  }

  if (tosuVersion && seeded) {
    writeOverlayVersion(tosuDir, tosuVersion)
  }

  return isGameOverlayValid(tosuDir)
}