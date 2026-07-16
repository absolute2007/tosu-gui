import fs from 'fs'
import path from 'path'
import { readGuiSettings } from './gui-settings'

/** File read by patched tosu-ingame-overlay for Maps hotkey. */
export function writeMapsKeybindFile(tosuDir: string, keybind?: string) {
  const bind = (keybind || readGuiSettings().mapsOverlayKeybind || 'Control + Shift + M').trim()
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
