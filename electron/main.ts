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
const APP_NAME = 'tosu GUI'

app.setName(APP_NAME)
process.title = APP_NAME
if (isWin) {
  app.setAppUserModelId('app.tosu.gui')
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  process.exit(0)
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

const tosuProcess = new TosuProcess()
const tosuApi = new TosuApi()
const tosuSocket = new TosuSocketBridge()
const tosuUpdater = new TosuUpdater()

function startSocketBridge() {
  tosuSocket.setWindow(mainWindow)
  tosuSocket.connect(getTosuBaseUrl())
}

function getTosuBaseUrl() {
  return `http://127.0.0.1:${tosuProcess.port}`
}

function getRendererUrl() {
  return process.env.VITE_DEV_SERVER_URL ?? null
}

function getAppIcon() {
  const candidates = [
    path.join(app.getAppPath(), 'resources', 'icon.ico'),
    path.join(app.getAppPath(), 'resources', 'icon.png'),
    path.join(app.getAppPath(), 'public', 'icon.png'),
    path.join(app.getAppPath(), 'public', 'icon.svg'),
  ]

  for (const iconPath of candidates) {
    const image = nativeImage.createFromPath(iconPath)
    if (!image.isEmpty()) return image
  }

  return undefined
}

function showMainWindow() {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.center()
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
  if (isWin) mainWindow.flashFrame(true)
}

function createWindow() {
  const icon = getAppIcon()

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    center: true,
    frame: false,
    transparent: false,
    backgroundColor: '#1e1e1e',
    autoHideMenuBar: true,
    title: APP_NAME,
    icon,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
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
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.minimize()
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
  return {
    running: tosuProcess.isRunning(),
    port: tosuProcess.port,
    baseUrl: getTosuBaseUrl(),
    pid: tosuProcess.pid,
    version: getInstalledVersion(tosuProcess.getTosuDir()),
  }
})

ipcMain.handle('tosu:restart', async () => {
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
ipcMain.handle('window:close', () => mainWindow?.minimize())

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

    try {
      await tosuProcess.start({ startupTimeoutMs: 60_000 })
      tosuApi.setBaseUrl(getTosuBaseUrl())
      tosuApi.setEnvPath(tosuProcess.getEnvPath())
      startSocketBridge()
    } catch (restartErr) {
      console.error('[tosu] failed to restart after update error:', restartErr)
    }

    throw new Error(message)
  }

  sendProgress({ phase: 'restarting', progress: 93, message: 'Подготовка оверлея…' })
  await ensureGameOverlay(tosuDir, installedVersion)
  patchIngameOverlay(tosuDir)

  sendProgress({ phase: 'restarting', progress: 95, message: 'Перезапуск tosu…' })
  const guiSettings = readGuiSettings()
  setOverlayAntialiasing(tosuDir, guiSettings.disableAntialiasing)

  let restartFailed = false
  try {
    await tosuProcess.start({ startupTimeoutMs: 60_000 })
    tosuApi.setBaseUrl(getTosuBaseUrl())
    tosuApi.setEnvPath(tosuProcess.getEnvPath())
    startSocketBridge()
  } catch (restartErr) {
    restartFailed = true
    console.error('[tosu] restart after update failed:', restartErr)
  }

  writeGuiSettings({ dismissedTosuVersion: null })
  return { ok: true, version: installedVersion, restartFailed }
})