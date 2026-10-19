import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export interface GuiSettings {
  language: 'ru' | 'en'
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
  /** In-game Maps Browser panel. When false the hotkey is ignored and nothing is preloaded. */
  mapsOverlayEnabled: boolean
  /**
   * Mute osu! audio while previewing beatmaps (mini-player or gameplay preview).
   */
  muteOsuOnPreview: boolean
  /**
   * Disable GPU hardware acceleration in Electron (recommended for osu! to minimize frametime/latency).
   */
  disableHardwareAcceleration: boolean
}

const DEFAULTS: GuiSettings = {
  language: 'ru',
  disableAntialiasing: true,
  checkAppUpdates: true,
  dismissedAppVersion: null,
  closeToTray: false,
  showBeatmapPanel: true,
  songsPath: '',
  skinsPath: '',
  skinsBrowserEnabled: true,
  mapsOverlayKeybind: 'Control + Shift + M',
  mapsOverlayEnabled: true,
  muteOsuOnPreview: true,
  disableHardwareAcceleration: false,
}

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'gui-settings.json')
}

/** This process is the only writer, so the parsed file is cached instead of re-read on every call. */
let cached: GuiSettings | null = null

export function readGuiSettings(): GuiSettings {
  if (cached) return { ...cached }
  try {
    const file = getSettingsPath()
    const data = fs.existsSync(file)
      ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<GuiSettings>)
      : {}
    cached = { ...DEFAULTS, ...data }
  } catch {
    cached = { ...DEFAULTS }
  }
  return { ...cached }
}

export function writeGuiSettings(updates: Partial<GuiSettings>) {
  const next = { ...readGuiSettings(), ...updates }
  const file = getSettingsPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf8')
  cached = next
  return { ...next }
}