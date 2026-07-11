import { app, BrowserWindow, ipcMain, nativeImage, shell } from 'electron'
import type { Tray } from 'electron'
import path from 'path'
import { TosuProcess } from './tosu-process'
import { TosuApi } from './tosu-api'
import { readGuiSettings, writeGuiSettings } from './gui-settings'
import { setOverlayAntialiasing } from './overlay-style'
import { TosuSocketBridge } from './tosu-socket'
import { setupTray } from './tray'
import { ensureGameOverlay } from './overlay-cleanup'
import { patchIngameOverlay } from './overlay-patch'
import { getInstalledVersion, TosuUpdater } from './tosu-updater'

const isWin = process.platform === 'win32'
const isDevBuild = !app.isPackaged
const APP_NAME = isDevBuild ? 'tosu GUI Dev' : 'tosu GUI'

// Dev must NOT share single-instance lock / userData with the installed release,
// otherwise start-gui.bat focuses the old installed window and looks like "old build".
app.setName(APP_NAME)
process.title = APP_NAME
if (isDevBuild) {
  app.setPath('userData', path.join(app.getPath('appData'), 'tosu-gui-dev'))
}
if (isWin) {
  app.setAppUserModelId(isDevBuild ? 'app.tosu.gui.dev' : 'app.tosu.gui')
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  console.warn('[app] another instance holds the lock — quitting this process')
  app.quit()
  process.exit(0)
}

console.log(
  '[app] starting',
  APP_NAME,
  isDevBuild ? '(dev)' : '(packaged)',
  'main=',
  __filename
)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

const tosuProcess = new TosuProcess()
const tosuApi = new TosuApi()
const tosuSocket = new TosuSocketBridge()
const tosuUpdater = new TosuUpdater()
let lastAutoRecoverAt = 0

function startSocketBridge() {
  tosuSocket.setWindow(mainWindow)
  tosuSocket.connect(getTosuBaseUrl())
}

/** If tosu died and nobody is updating/restarting, try to bring it back (throttled). */
function maybeRecoverTosu() {
  // Never race with user restart / update / quit — force:true here used to kill a healthy start.
  if (
    isQuitting ||
    tosuProcess.isRunning() ||
    tosuProcess.isUpdating() ||
    tosuProcess.isBusy()
  ) {
    return
  }
  const now = Date.now()
  if (now - lastAutoRecoverAt < 20_000) return
  lastAutoRecoverAt = now
  console.log('[tosu] status poll: process down, attempting recover…')
  void tosuProcess
    .start()
    .then(() => {
      if (isQuitting) return
      tosuApi.setBaseUrl(getTosuBaseUrl())
      tosuApi.setEnvPath(tosuProcess.getEnvPath())
      startSocketBridge()
    })
    .catch((err) => {
      console.error('[tosu] auto-recover failed:', err)
    })
}

function getTosuBaseUrl() {
  return `http://127.0.0.1:${tosuProcess.port}`
}

function getRendererUrl() {
  return process.env.VITE_DEV_SERVER_URL ?? null
}

function getAppIcon() {
  const candidates = [
    path.join(process.resourcesPath, 'icons', 'icon.ico'),
    path.join(process.resourcesPath, 'icons', 'icon.png'),
    path.join(app.getAppPath(), 'resources', 'icon.ico'),
    path.join(app.getAppPath(), 'resources', 'icon.png'),
    path.join(app.getAppPath(), 'public', 'icon.png'),
    path.join(app.getAppPath(), 'public', 'icon.svg'),
  ]

  for (const iconPath of candidates) {
    const image = nativeImage.createFromPath(iconPath)
    if (!image.isEmpty()) return image
  }

  if (isWin) {
    const exeIcon = nativeImage.createFromPath(process.execPath)
    if (!exeIcon.isEmpty()) return exeIcon
  }

  return undefined
}

function hideToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  createTray()
  mainWindow.setSkipTaskbar(true)
  mainWindow.hide()
}

function requestAppClose() {
  if (!mainWindow) return

  const { closeToTray } = readGuiSettings()
  if (closeToTray) {
    hideToTray()
    return
  }

  isQuitting = true
  mainWindow.close()
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.setSkipTaskbar(false)
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.center()
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
  if (isWin) mainWindow.flashFrame(true)
}

function createWindow() {
  const icon = getAppIcon()
  const isMac = process.platform === 'darwin'

  // Transparent HWND + CSS border-radius = real rounded corners.
  // Do NOT use backgroundMaterial here: DWM acrylic is always a full rectangle and
  // paints square wedges outside the CSS radius (or OS rounding fails on frameless).
  // Matte look comes from dense translucent CSS over the desktop.
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    center: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    roundedCorners: false,
    thickFrame: true,
    autoHideMenuBar: true,
    title: APP_NAME,
    icon,
    show: false,
    ...(isMac
      ? {
          vibrancy: 'under-window' as const,
          visualEffectState: 'active' as const,
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: true,
    },
  })

  mainWindow.once('ready-to-show', () => {
    showMainWindow()
    if (tosuProcess.isRunning()) startSocketBridge()
  })

  const devUrl = getRendererUrl()

  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[renderer] loaded:', mainWindow?.webContents.getURL())
    showMainWindow()
  })

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[renderer] did-fail-load:', code, desc, url)
  })

  mainWindow.webContents.on('console-message', (_e, _level, message) => {
    console.log('[renderer:console]', message)
  })

  mainWindow.on('close', (event) => {
    if (isQuitting) return

    const { closeToTray } = readGuiSettings()
    if (closeToTray) {
      event.preventDefault()
      hideToTray()
    } else {
      isQuitting = true
    }
  })

  mainWindow.on('closed', () => {
    tosuSocket.setWindow(null)
    mainWindow = null
  })

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized-changed', true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized-changed', false)
  })
}

function createTray() {
  if (tray) return
  try {
    tray = setupTray(
      () => mainWindow,
      getAppIcon,
      () => {
        isQuitting = true
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.destroy()
        }
        app.quit()
      }
    )
  } catch (err) {
    console.error('[tray] failed to create:', err)
    tray = null
  }
}

if (gotLock) {
  app.on('second-instance', () => {
    showMainWindow()
  })
}

if (gotLock) {
  app.whenReady().then(() => {
    createWindow()
    createTray()

    tosuApi.setBaseUrl(getTosuBaseUrl())
    tosuApi.setEnvPath(tosuProcess.getEnvPath())

    void (async () => {
      try {
        await tosuProcess.start()
        const guiSettings = readGuiSettings()
        setOverlayAntialiasing(tosuProcess.getTosuDir(), guiSettings.disableAntialiasing)
        startSocketBridge()
      } catch (err) {
        console.error('Failed to start tosu:', err)
      }
    })()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
      else showMainWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return
  if (isQuitting) {
    tosuSocket.disconnect()
    tosuProcess.stop()
    app.quit()
  }
})

app.on('before-quit', () => {
  isQuitting = true
  tosuSocket.disconnect()
  tosuProcess.stop()
  if (tray) {
    tray.destroy()
    tray = null
  }
})

ipcMain.handle('tosu:status', async () => {
  maybeRecoverTosu()
  return {
    running: tosuProcess.isRunning(),
    busy: tosuProcess.isBusy(),
    port: tosuProcess.port,
    baseUrl: getTosuBaseUrl(),
    pid: tosuProcess.pid,
    version: getInstalledVersion(tosuProcess.getTosuDir()),
  }
})

ipcMain.handle('tosu:restart', async () => {
  if (tosuProcess.isUpdating()) {
    throw new Error('Идёт обновление tosu — подождите окончания')
  }
  tosuSocket.disconnect()
  await tosuProcess.restart()
  tosuApi.setBaseUrl(getTosuBaseUrl())
  tosuApi.setEnvPath(tosuProcess.getEnvPath())
  startSocketBridge()
  return { ok: true }
})

ipcMain.handle('tosu:get-counters', async () => {
  try {
    return await tosuApi.getCounters()
  } catch (err) {
    console.warn('[tosu] get-counters failed:', err)
    return []
  }
})

ipcMain.handle('tosu:get-settings', async () => {
  const guiSettings = readGuiSettings()
  try {
    const settings = await tosuApi.getSettings()
    return {
      ...settings,
      INGAME_OVERLAY_DISABLE_ANTIALIASING: guiSettings.disableAntialiasing,
    }
  } catch (err) {
    console.warn('[tosu] get-settings failed:', err)
    return {
      ...(await tosuApi.getSettings()),
      INGAME_OVERLAY_DISABLE_ANTIALIASING: guiSettings.disableAntialiasing,
    }
  }
})

ipcMain.handle('tosu:save-settings', async (_e, settings: Record<string, string>) => {
  const { INGAME_OVERLAY_DISABLE_ANTIALIASING, ...tosuSettings } = settings
  let result = { status: 'ok' }

  if (Object.keys(tosuSettings).length > 0) {
    result = await tosuApi.saveSettings(tosuSettings)
  }

  if (INGAME_OVERLAY_DISABLE_ANTIALIASING !== undefined) {
    const disableAa = INGAME_OVERLAY_DISABLE_ANTIALIASING === 'true'
    writeGuiSettings({ disableAntialiasing: disableAa })
    setOverlayAntialiasing(tosuProcess.getTosuDir(), disableAa)
  }

  return result
})

ipcMain.handle('tosu:get-counter-settings', async (_e, name: string) => {
  return tosuApi.getCounterSettings(name)
})

ipcMain.handle('tosu:save-counter-settings', async (_e, name: string, settings: unknown[]) => {
  return tosuApi.saveCounterSettings(name, settings)
})

ipcMain.handle('tosu:delete-counter', async (_e, name: string) => {
  return tosuApi.deleteCounter(name)
})

ipcMain.handle('tosu:open-counter-folder', async (_e, name: string) => {
  return tosuApi.openCounterFolder(name)
})

ipcMain.handle('tosu:download-counter', async (_e, url: string, name: string, update?: boolean) => {
  return tosuApi.downloadCounter(url, name, update)
})

ipcMain.handle('tosu:search-available', async (_e, query: string) => {
  return tosuApi.searchAvailableCounters(query)
})

ipcMain.handle('window:is-maximized', () => mainWindow?.isMaximized() ?? false)

ipcMain.handle('window:minimize', () => mainWindow?.minimize())
ipcMain.handle('window:maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize()
  else mainWindow?.maximize()
})
ipcMain.handle('window:close', () => requestAppClose())

ipcMain.handle('shell:open-external', async (_e, url: string) => {
  await shell.openExternal(url)
})

ipcMain.handle('gui:get-settings', async () => readGuiSettings())

ipcMain.handle('gui:save-settings', async (_e, updates: Partial<ReturnType<typeof readGuiSettings>>) => {
  return writeGuiSettings(updates)
})

ipcMain.handle('tosu:check-update', async () => {
  return tosuUpdater.checkForUpdate(tosuProcess.getTosuDir())
})

ipcMain.handle('tosu:dismiss-update', async (_e, version: string) => {
  writeGuiSettings({ dismissedTosuVersion: version })
})

ipcMain.handle('tosu:install-update', async () => {
  if (tosuProcess.isUpdating()) {
    throw new Error('Обновление уже выполняется')
  }

  const tosuDir = tosuProcess.getTosuDir()
  const sendProgress = (progress: import('./tosu-updater').UpdateProgress) => {
    mainWindow?.webContents.send('tosu:update-progress', progress)
  }

  tosuSocket.disconnect()

  let installedVersion: string | null = null

  try {
    sendProgress({ phase: 'installing', progress: 2, message: 'Остановка tosu…' })
    await tosuProcess.stopForUpdate()

    installedVersion = await tosuUpdater.installUpdate(tosuDir, sendProgress)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Ошибка обновления'
    sendProgress({ phase: 'error', progress: 0, message })
    tosuProcess.endUpdate()

    try {
      await tosuProcess.startAfterUpdate({ startupTimeoutMs: 60_000 })
      tosuApi.setBaseUrl(getTosuBaseUrl())
      tosuApi.setEnvPath(tosuProcess.getEnvPath())
      startSocketBridge()
    } catch (restartErr) {
      console.error('[tosu] failed to restart after update error:', restartErr)
    }

    throw new Error(message)
  }

  // Overlay prep is best-effort only — never abort the update restart because of it
  sendProgress({ phase: 'restarting', progress: 93, message: 'Подготовка оверлея…' })
  try {
    await ensureGameOverlay(tosuDir, installedVersion)
    await patchIngameOverlay(tosuDir)
  } catch (overlayErr) {
    console.warn('[tosu] overlay prepare after update failed (non-fatal):', overlayErr)
  }

  sendProgress({ phase: 'restarting', progress: 95, message: 'Перезапуск tosu…' })
  const guiSettings = readGuiSettings()
  setOverlayAntialiasing(tosuDir, guiSettings.disableAntialiasing)

  let restartFailed = false
  try {
    // Always force-respawn after files were replaced (even if a stale child ref exists)
    await tosuProcess.startAfterUpdate({ startupTimeoutMs: 30_000 })
    tosuApi.setBaseUrl(getTosuBaseUrl())
    tosuApi.setEnvPath(tosuProcess.getEnvPath())
    startSocketBridge()
    sendProgress({ phase: 'done', progress: 100, message: 'Готово' })
  } catch (restartErr) {
    restartFailed = true
    tosuProcess.endUpdate()
    console.error('[tosu] restart after update failed:', restartErr)
  }

  writeGuiSettings({ dismissedTosuVersion: null })
  return { ok: true, version: installedVersion, restartFailed }
})