/**
 * Install "Maps Browser" counter into tosu static/ so it shows in the
 * in-game overlay (works in exclusive fullscreen via inject).
 */
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

const COUNTER_FOLDER = 'Maps Browser by tosu-gui'

function getSourceDir(): string | null {
  const candidates = [
    path.join(process.resourcesPath, 'maps-counter'),
    path.join(app.getAppPath(), 'resources', 'maps-counter'),
    path.join(__dirname, '..', 'resources', 'maps-counter'),
  ]
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'index.html'))) return c
  }
  return null
}

export function ensureMapsCounter(tosuDir: string): boolean {
  const src = getSourceDir()
  if (!src) {
    console.warn('[maps-counter] source missing')
    return false
  }

  const dest = path.join(tosuDir, 'static', COUNTER_FOLDER)
  try {
    copyDirRecursive(src, dest)
    console.log('[maps-counter] installed →', dest)
    return true
  } catch (err) {
    console.warn('[maps-counter] install failed:', err)
    return false
  }
}

function copyDirRecursive(fromDir: string, toDir: string) {
  fs.mkdirSync(toDir, { recursive: true })
  for (const name of fs.readdirSync(fromDir)) {
    const from = path.join(fromDir, name)
    const to = path.join(toDir, name)
    if (fs.statSync(from).isDirectory()) {
      copyDirRecursive(from, to)
    } else {
      fs.copyFileSync(from, to)
    }
  }
}

export function getMapsCounterFolderName() {
  return COUNTER_FOLDER
}

/** Built-in Maps counter — may not be deleted from GUI. */
export function isProtectedMapsCounter(folderOrName: string): boolean {
  const n = (folderOrName || '').toLowerCase()
  return (
    n === COUNTER_FOLDER.toLowerCase() ||
    n === 'maps browser by tosu-gui' ||
    (n.includes('maps browser') && n.includes('tosu-gui'))
  )
}
