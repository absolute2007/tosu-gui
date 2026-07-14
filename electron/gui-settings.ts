import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export interface GuiSettings {
  disableAntialiasing: boolean
  checkTosuUpdates: boolean
  dismissedTosuVersion: string | null
  closeToTray: boolean
  /** Right-side current beatmap panel. When false, panel is hidden and its data is not processed. */
  showBeatmapPanel: boolean
}

const DEFAULTS: GuiSettings = {
  disableAntialiasing: true,
  checkTosuUpdates: true,
  dismissedTosuVersion: null,
  closeToTray: false,
  showBeatmapPanel: true,
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