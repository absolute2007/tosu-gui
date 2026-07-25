import fs from 'fs'
import path from 'path'
import { app, dialog, BrowserWindow } from 'electron'
import type { LocalSkinEntry } from './skins-types'
import { detectDefaultSongsPath, resolveSongsPath } from './beatmap-maps'
import { readGuiSettings } from './gui-settings'

export function detectDefaultSkinsPath(): string | null {
  const candidates: string[] = []

  // Sibling of configured/detected Songs
  const songs = resolveSongsPath(readGuiSettings().songsPath || null)
  if (songs) {
    candidates.push(path.join(path.dirname(songs), 'Skins'))
  }

  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || ''
    if (local) {
      candidates.push(path.join(local, 'osu!', 'Skins'))
      candidates.push(path.join(local, 'osu', 'Skins'))
    }
    const userProfile = process.env.USERPROFILE || ''
    if (userProfile) {
      candidates.push(path.join(userProfile, 'AppData', 'Local', 'osu!', 'Skins'))
      candidates.push(path.join(userProfile, 'osu!', 'Skins'))
      candidates.push(path.join(userProfile, 'Games', 'osu!', 'Skins'))
    }
  } else if (process.platform === 'darwin') {
    const home = app.getPath('home')
    candidates.push(path.join(home, 'Library', 'Application Support', 'osu!', 'Skins'))
  } else {
    const home = app.getPath('home')
    candidates.push(path.join(home, '.local', 'share', 'osu!', 'Skins'))
    candidates.push(path.join(home, 'osu!', 'Skins'))
  }

  // Also try songs auto-detect sibling if settings empty
  const autoSongs = detectDefaultSongsPath()
  if (autoSongs) candidates.push(path.join(path.dirname(autoSongs), 'Skins'))

  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p) && fs.statSync(p).isDirectory()) return p
    } catch {
      /* ignore */
    }
  }
  return null
}

export function resolveSkinsPath(configured: string | null | undefined): string | null {
  const trimmed = (configured || '').trim()
  if (trimmed) {
    try {
      if (fs.existsSync(trimmed) && fs.statSync(trimmed).isDirectory()) return trimmed
    } catch {
      /* fall through */
    }
  }
  return detectDefaultSkinsPath()
}

export function scanLocalSkins(skinsPath: string): LocalSkinEntry[] {
  const out: LocalSkinEntry[] = []
  try {
    if (!skinsPath || !fs.existsSync(skinsPath)) return []
    const entries = fs.readdirSync(skinsPath, { withFileTypes: true })
    for (const ent of entries) {
      if (ent.name.startsWith('.')) continue
      if (ent.isDirectory()) {
        out.push({
          name: ent.name,
          path: path.join(skinsPath, ent.name),
          isDirectory: true,
        })
      } else if (/\.(osk|zip)$/i.test(ent.name)) {
        out.push({
          name: ent.name.replace(/\.(osk|zip)$/i, ''),
          path: path.join(skinsPath, ent.name),
          isDirectory: false,
        })
      }
    }
  } catch {
    return []
  }
  out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  return out
}

export function normalizeSkinName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.osk$/i, '')
    .replace(/[^a-z0-9а-яё]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export async function pickSkinsDirectory(parent: BrowserWindow | null): Promise<string | null> {
  const opts = {
    title: 'Выберите папку Skins osu!',
    properties: ['openDirectory' as const],
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, opts)
    : await dialog.showOpenDialog(opts)
  if (result.canceled || !result.filePaths[0]) return null
  return result.filePaths[0]
}

export async function pickSkinFile(parent: BrowserWindow | null): Promise<string | null> {
  const opts = {
    title: 'Выберите файл скина (.osk / .zip)',
    properties: ['openFile' as const],
    filters: [
      { name: 'osu! skin', extensions: ['osk', 'zip'] },
      { name: 'All files', extensions: ['*'] },
    ],
  }
  const result = parent
    ? await dialog.showOpenDialog(parent, opts)
    : await dialog.showOpenDialog(opts)
  if (result.canceled || !result.filePaths[0]) return null
  return result.filePaths[0]
}
