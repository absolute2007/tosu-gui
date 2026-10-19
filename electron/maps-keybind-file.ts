import fs from 'fs'
import path from 'path'
import { readGuiSettings } from './gui-settings'

/** Written instead of a hotkey when the Maps panel is turned off in Settings. */
export const MAPS_KEYBIND_DISABLED = 'disabled'

/** File read by patched tosu-ingame-overlay for Maps hotkey. */
export function writeMapsKeybindFile(tosuDir: string) {
  const gui = readGuiSettings()
  const bind = gui.mapsOverlayEnabled
    ? (gui.mapsOverlayKeybind || 'Control + Shift + M').trim()
    : MAPS_KEYBIND_DISABLED
  const targets = [
    path.join(tosuDir, 'maps-overlay-keybind.txt'),
    path.join(tosuDir, 'game-overlay', 'maps-overlay-keybind.txt'),
  ]
  for (const file of targets) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, bind + '\n', 'utf8')
    } catch (err) {
      console.warn('[maps-keybind] write failed', file, err)
    }
  }
}
