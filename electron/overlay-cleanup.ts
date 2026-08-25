import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { getInstalledVersion, installMatchingOverlay } from './tosu-updater'

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
  try {
    return fs.readdirSync(overlayDir).length > 0
  } catch {
    return true
  }
}

/**
 * Best-effort delete. Never throws — overlay must not block tosu start.
 * Returns true if the directory is gone.
 */
export async function removeGameOverlay(tosuDir: string): Promise<boolean> {
  const overlayDir = getGameOverlayDir(tosuDir)
  if (!fs.existsSync(overlayDir)) return true

  const maxAttempts = 4
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      fs.rmSync(overlayDir, { recursive: true, force: true })
      if (!fs.existsSync(overlayDir)) return true
    } catch (err) {
      console.warn('[overlay] remove attempt failed:', err)
    }

    // Windows often holds locks briefly — try rename-aside as fallback
    try {
      const aside = `${overlayDir}.old-${Date.now()}`
      fs.renameSync(overlayDir, aside)
      // delete renamed copy in background-ish (sync, short)
      try {
        fs.rmSync(aside, { recursive: true, force: true })
      } catch {
        console.warn('[overlay] left aside dir for later cleanup:', aside)
      }
      if (!fs.existsSync(overlayDir)) return true
    } catch {
      /* continue */
    }

    await sleep(200 * (attempt + 1))
  }

  console.warn('[overlay] could not fully remove game-overlay — continuing without it')
  return !fs.existsSync(overlayDir)
}

/**
 * Clean up leftover game-overlay.old-* dirs from failed removals (best effort).
 */
export function cleanupOverlayAsideDirs(tosuDir: string) {
  try {
    for (const name of fs.readdirSync(tosuDir)) {
      if (!name.startsWith('game-overlay.old-') && !name.startsWith('game-overlay.broken-')) continue
      const full = path.join(tosuDir, name)
      try {
        fs.rmSync(full, { recursive: true, force: true })
      } catch {
        /* leave for next run */
      }
    }
  } catch {
    /* ignore */
  }
}

function normalizeVersion(version: string) {
  return version.replace(/^v/i, '').trim()
}

/** Read game-overlay/version written by tosu's own overlay installer. */
export function getGameOverlayVersion(tosuDir: string): string | null {
  const versionPath = path.join(getGameOverlayDir(tosuDir), 'version')
  if (!fs.existsSync(versionPath)) return null
  try {
    const version = fs.readFileSync(versionPath, 'utf8').trim()
    return version ? normalizeVersion(version) : null
  } catch {
    return null
  }
}

/**
 * tosu redownloads game-overlay when version file is missing or differs from
 * its own version. Never stamp a fake version onto an old overlay binary —
 * that was causing invisible overlays after tosu.exe updates.
 */
export function isGameOverlayVersionMatch(tosuDir: string, tosuVersion?: string | null): boolean {
  if (!tosuVersion) return true
  const overlayVersion = getGameOverlayVersion(tosuDir)
  if (!overlayVersion) return false
  return normalizeVersion(tosuVersion) === overlayVersion
}

function findBundledOverlaySeed(tosuDir: string): string | null {
  const candidates = [
    path.join(process.resourcesPath || '', 'tosu', 'game-overlay'),
    path.join(app.getAppPath ? app.getAppPath() : '', 'resources', 'tosu', 'game-overlay'),
    path.join(__dirname, '..', 'resources', 'tosu', 'game-overlay'),
    path.join(process.env.USERPROFILE || '', 'Desktop', 'Folders', 'Tosu', 'game-overlay'),
    path.join(process.env.USERPROFILE || '', 'Documents', 'dev-projects', 'osu-auto', 'tosu_bin', 'game-overlay'),
  ]

  for (const seed of candidates) {
    if (path.resolve(seed) === path.resolve(getGameOverlayDir(tosuDir))) continue
    if (fs.existsSync(path.join(seed, 'tosu-ingame-overlay.exe'))) return seed
  }
  return null
}

export async function seedGameOverlayIfMissing(tosuDir: string): Promise<boolean> {
  if (isGameOverlayValid(tosuDir)) return true

  const seed = findBundledOverlaySeed(tosuDir)
  if (!seed) return false

  const dest = getGameOverlayDir(tosuDir)
  try {
    if (isGameOverlayBroken(tosuDir)) {
      await removeGameOverlay(tosuDir)
    }
    fs.mkdirSync(dest, { recursive: true })
    fs.cpSync(seed, dest, { recursive: true })
    console.log('[overlay] seeded game-overlay from', seed)
    return isGameOverlayValid(tosuDir)
  } catch (err) {
    console.warn('[overlay] seed failed:', err)
    return isGameOverlayValid(tosuDir)
  }
}

/**
 * Best-effort overlay restore. Never throws.
 * Returns true only if a valid overlay exists after the call.
 */
export async function ensureGameOverlay(tosuDir: string, tosuVersion?: string | null): Promise<boolean> {
  try {
    cleanupOverlayAsideDirs(tosuDir)

    if (isGameOverlayBroken(tosuDir)) {
      console.log('[overlay] broken game-overlay detected, cleaning up…')
      await removeGameOverlay(tosuDir)
    }

    if (!isGameOverlayValid(tosuDir)) {
      // Try seeding from packaged resources
      await seedGameOverlayIfMissing(tosuDir)
    }

    // If still missing and version is known, download matching overlay
    if (!isGameOverlayValid(tosuDir)) {
      const ver = tosuVersion || getInstalledVersion(tosuDir)
      if (ver) {
        console.log('[overlay] missing overlay; downloading matching overlay for v' + ver)
        await installMatchingOverlay(tosuDir, ver)
      }
    }

    // Ensure game-overlay/version file exists and has correct version so tosu does NOT delete it on startup
    if (isGameOverlayValid(tosuDir)) {
      const ver = tosuVersion || getInstalledVersion(tosuDir)
      if (ver) {
        const verFile = path.join(getGameOverlayDir(tosuDir), 'version')
        try {
          fs.writeFileSync(verFile, normalizeVersion(ver), 'utf8')
        } catch {
          /* ignore */
        }
      }
    }

    return isGameOverlayValid(tosuDir)
  } catch (err) {
    console.warn('[overlay] ensureGameOverlay failed (non-fatal):', err)
    return isGameOverlayValid(tosuDir)
  }
}
