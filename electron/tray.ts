import { BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import type { NativeImage } from 'electron'

export function createTrayIcon(getIcon: () => NativeImage | undefined): NativeImage {
  const icon = getIcon()
  if (icon && !icon.isEmpty()) {
    return icon.resize({ width: 16, height: 16 })
  }
  return nativeImage.createEmpty()
}

export function setupTray(
  getWindow: () => BrowserWindow | null,
  getIcon: () => NativeImage | undefined,
  onQuit: () => void
): Tray | null {
  const icon = createTrayIcon(getIcon)
  if (icon.isEmpty()) {
    console.warn('[tray] icon missing, tray disabled')
    return null
  }

  const tray = new Tray(icon)
  tray.setToolTip('tosu GUI')

  const showWindow = () => {
    const win = getWindow()
    if (!win) return
    if (!win.isVisible()) win.show()
    if (win.isMinimized()) win.restore()
    win.focus()
  }

  const menu = Menu.buildFromTemplate([
    { label: 'Открыть', click: showWindow },
    { type: 'separator' },
    {
      label: 'Выход',
      click: () => {
        onQuit()
      },
    },
  ])

  tray.setContextMenu(menu)
  tray.on('double-click', showWindow)
  tray.on('click', showWindow)

  return tray
}