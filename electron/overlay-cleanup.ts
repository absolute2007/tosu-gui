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

function writeOverlayVersion(tosuDir: string, tosuVersion: string) {
  const versionPath = path.join(getGameOverlayDir(tosuDir), 'version')
  try {
    fs.writeFileSync(versionPath, normalizeVersion(tosuVersion), 'utf8')
  } catch (err) {
    console.warn('[overlay] could not write version file:', err)
  }
}

function findBundledOverlaySeed(): string | null {
  // Packaged: we only have resources/tosu; if overlay is complete there, no seed needed.
  // Dev: allow copying from a known-good sibling install.
  for (const seed of SEED_OVERLAY_PATHS) {
    if (fs.existsSync(path.join(seed, 'tosu-ingame-overlay.exe'))) return seed
  }
  return null
}

export async function seedGameOverlayIfMissing(tosuDir: string): Promise<boolean> {
  if (isGameOverlayValid(tosuDir)) return true

  if (isGameOverlayBroken(tosuDir)) {
    await removeGameOverlay(tosuDir)
  }

  // If still present and still broken, cannot seed into it cleanly
  if (isGameOverlayValid(tosuDir)) return true
  if (fs.existsSync(getGameOverlayDir(tosuDir)) && isGameOverlayBroken(tosuDir)) {
    console.warn('[overlay] broken game-overlay still present; skip seed')
    return false
  }

  const seed = findBundledOverlaySeed()
  if (!seed) return false

  const dest = getGameOverlayDir(tosuDir)
  try {
    if (fs.existsSync(dest)) {
      await removeGameOverlay(tosuDir)
    }
    if (fs.existsSync(dest)) return false
    fs.cpSync(seed, dest, { recursive: true })
    console.log('[overlay] seeded game-overlay from', seed)
    return isGameOverlayValid(tosuDir)
  } catch (err) {
    console.warn('[overlay] seed failed:', err)
    return false
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
      console.log('[overlay] broken game-overlay detected, trying to remove…')
      await removeGameOverlay(tosuDir)
    }

    let seeded = false
    if (!isGameOverlayValid(tosuDir)) {
      seeded = await seedGameOverlayIfMissing(tosuDir)
      if (!seeded) {
        console.warn('[overlay] game-overlay missing/invalid — tosu will start without it')
        return false
      }
    }

    if (tosuVersion && seeded) {
      writeOverlayVersion(tosuDir, tosuVersion)
    }

    return isGameOverlayValid(tosuDir)
  } catch (err) {
    console.warn('[overlay] ensureGameOverlay failed (non-fatal):', err)
    return isGameOverlayValid(tosuDir)
  }
}
