import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export interface GuiSettings {
  disableAntialiasing: boolean
  /** Check for tosu GUI (this app) updates on GitHub */
  checkAppUpdates: boolean
  dismissedAppVersion: string | null
  closeToTray: boolean
  /** Right-side current beatmap panel. When false, panel is hidden and its data is not processed. */
  showBeatmapPanel: boolean
  /** Path to osu!stable Songs folder for map downloads. Empty = auto-detect. */
  songsPath: string
  /** Path to osu!stable Skins folder. Empty = auto-detect. */
  skinsPath: string
  /** Show Skins page in sidebar (feature flag / rollback). */
  skinsBrowserEnabled: boolean
  /**
   * Hotkey for Maps UI inside inject overlay (fullscreen-safe).
   * Written to tosu/maps-overlay-keybind.txt for tosu-ingame-overlay.
   */
  mapsOverlayKeybind: string
}

const DEFAULTS: GuiSettings = {
  disableAntialiasing: true,
  checkAppUpdates: true,
  dismissedAppVersion: null,
  closeToTray: false,
  showBeatmapPanel: true,
  songsPath: '',
  skinsPath: '',
  skinsBrowserEnabled: true,
  mapsOverlayKeybind: 'Control + Shift + M',
}

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'gui-settings.json')
}

export function readGuiSettings(): GuiSettings {
  try {
    const file = getSettingsPath()
    if (!fs.existsSync(file)) return { ...DEFAULTS }
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<GuiSettings>
    return { ...DEFAULTS, ...data }
  } catch {
    return { ...DEFAULTS }
  }
}

export function writeGuiSettings(updates: Partial<GuiSettings>) {
  const current = readGuiSettings()
  const next = { ...current, ...updates }
  const file = getSettingsPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf8')
  return next
}