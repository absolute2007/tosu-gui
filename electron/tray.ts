import { BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import type { NativeImage } from 'electron'

/** Minimal 16×16 PNG fallback so tray still works if app icons fail to load. */
function createFallbackTrayIcon(): NativeImage {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAKElEQVQ4T2NkYGD4z0ABYBzVMKoBBg0cNQAGDRw1AAYNHDUABg0cGAAAp78DAdW2n5kAAAAASUVORK5CYII=',
    'base64'
  )
  return nativeImage.createFromBuffer(png)
}

export function createTrayIcon(getIcon: () => NativeImage | undefined): NativeImage {
  const icon = getIcon()
  if (icon && !icon.isEmpty()) {
    try {
      const resized = icon.resize({ width: 16, height: 16 })
      if (!resized.isEmpty()) return resized
    } catch {
      /* fall through */
    }
    return icon
  }
  return createFallbackTrayIcon()
}

export function setupTray(
  getWindow: () => BrowserWindow | null,
  getIcon: () => NativeImage | undefined,
  onQuit: () => void
): Tray {
  const icon = createTrayIcon(getIcon)
  const tray = new Tray(icon.isEmpty() ? createFallbackTrayIcon() : icon)
  tray.setToolTip('tosu GUI')

  const showWindow = () => {
    const win = getWindow()
    if (!win || win.isDestroyed()) return
    win.setSkipTaskbar(false)
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