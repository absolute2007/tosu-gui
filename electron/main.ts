import { app, BrowserWindow, ipcMain, nativeImage, session, shell } from 'electron'
import type { Tray } from 'electron'
import fs from 'fs'
import path from 'path'
import { TosuProcess } from './tosu-process'
import { TosuApi } from './tosu-api'
import { readGuiSettings, writeGuiSettings } from './gui-settings'
import { setOverlayAntialiasing } from './overlay-style'
import { TosuSocketBridge } from './tosu-socket'
import { setupTray } from './tray'
import { ensureGameOverlay } from './overlay-cleanup'
import { patchIngameOverlay } from './overlay-patch'
import {
  backupCurrentInstall,
  cleanupBackup,
  formatUserFacingError,
  getInstalledVersion,
  restoreBackup,
  TosuUpdater,
} from './tosu-updater'
import {
  checkAppUpdate,
  downloadAndInstallAppUpdate,
  getAppVersion,
  isAppUpdateDownloading,
  setupAppUpdater,
} from './app-updater'
import {
  cancelMapDownload,
  detectDefaultSongsPath,
  downloadMapSet,
  DownloadCancelledError,
  fetchBeatmapOsuFile,
  pickSongsDirectory,
  resolveSongsPath,
  scanLocalSetIds,
  searchMapSets,
  type MapDownloadProgress,
  type MapSearchParams,
} from './beatmap-maps'
import {
  clearOsuSession,
  fetchOsuAccount,
  loginWithOsuWindow,
} from './osu-session'
import { emitMapsHttpProgress, startMapsHttpServer, stopMapsHttpServer } from './maps-http-server'
import { ensureMapsCounter } from './ensure-maps-counter'
import { writeMapsKeybindFile } from './maps-keybind-file'
import { searchOsuckSkins, getOsuckSkinDetail, osuckImageHeaders, OSUCK_ORIGIN } from './skins-osuck'
import {
  cancelSkinDownload,
  downloadOsuckSkin,
  downloadSkinFromUrl,
  importSkinFile,
  SkinDownloadCancelledError,
} from './skins-download'
import {
  detectDefaultSkinsPath,
  pickSkinFile,
  pickSkinsDirectory,
  resolveSkinsPath,
  scanLocalSkins,
} from './skins-path'
import type { SkinDownloadProgress, SkinSearchParams } from './skins-types'

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

function broadcastMapsProgress(progress: MapDownloadProgress) {
  mainWindow?.webContents.send('maps:download-progress', progress)
  emitMapsHttpProgress(progress)
}

function broadcastSkinsProgress(progress: SkinDownloadProgress) {
  mainWindow?.webContents.send('skins:download-progress', progress)
}

function getResolvedSkinsPath(): string | null {
  const gui = readGuiSettings()
  return resolveSkinsPath(gui.skinsPath || null)
}

/** Inject headers so osuck screenshots load from the renderer (otherwise 403). */
function setupOsuckImageHeaders() {
  const filter = { urls: ['https://skins.osuck.net/*'] }
  try {
    session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
      const extra = osuckImageHeaders('/skins')
      const isImage = details.url.includes('/images/')
      callback({
        requestHeaders: {
          ...details.requestHeaders,
          Referer: extra.Referer,
          'User-Agent': extra['User-Agent'],
          ...(isImage
            ? {
                Accept: extra.Accept,
                'X-Request-Params': extra['X-Request-Params'],
                'X-Request-Location': extra['X-Request-Location'],
              }
            : {}),
        },
      })
    })
  } catch (err) {
    console.warn('[skins] webRequest header hook failed:', err)
  }
}

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

  // Opaque frameless window restores native Windows minimize/maximize animations.
  // Transparent layered HWNDs disable DWM window animations and can stall CSS transitions.
  // Solid chrome + OS roundedCorners (Win 11) keeps the matte look without acrylic wedges.
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 760,
    minWidth: 1020,
    minHeight: 640,
    center: true,
    frame: false,
    transparent: false,
    backgroundColor: '#1e1e1e',
    hasShadow: true,
    roundedCorners: true,
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
    setupOsuckImageHeaders()
    createWindow()
    createTray()
    setupAppUpdater(() => mainWindow)
    // Local API for in-game Maps counter only (no external always-on-top window)
    startMapsHttpServer({
      getParent: () => mainWindow,
      getOverlayKeybind: () => {
        try {
          const envPath = tosuProcess.getEnvPath()
          if (envPath && fs.existsSync(envPath)) {
            const raw = fs.readFileSync(envPath, 'utf8')
            const m = raw.match(/^INGAME_OVERLAY_KEYBIND=(.+)$/m)
            if (m?.[1]?.trim()) return m[1].trim()
          }
        } catch {
          /* ignore */
        }
        return 'Control + Shift + Space'
      },
    })

    tosuApi.setBaseUrl(getTosuBaseUrl())
    tosuApi.setEnvPath(tosuProcess.getEnvPath())

    void (async () => {
      try {
        await tosuProcess.start()
        const tosuDir = tosuProcess.getTosuDir()
        ensureMapsCounter(tosuDir)
        const guiSettings = readGuiSettings()
        writeMapsKeybindFile(tosuDir, guiSettings.mapsOverlayKeybind)
        setOverlayAntialiasing(tosuDir, guiSettings.disableAntialiasing)
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
  stopMapsHttpServer()
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
    appVersion: getAppVersion(),
  }
})

ipcMain.handle('tosu:restart', async () => {
  if (tosuProcess.isUpdating() || isAppUpdateDownloading()) {
    throw new Error('Идёт обновление — подождите окончания')
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
  const { isProtectedMapsCounter } = await import('./ensure-maps-counter')
  if (isProtectedMapsCounter(String(name || ''))) {
    throw new Error('Счётчик Maps Browser нельзя удалить — только выключить оверлей или убрать с экрана в игре')
  }
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
  const next = writeGuiSettings(updates)
  if (updates && Object.prototype.hasOwnProperty.call(updates, 'mapsOverlayKeybind')) {
    try {
      writeMapsKeybindFile(tosuProcess.getTosuDir(), next.mapsOverlayKeybind)
    } catch {
      /* ignore */
    }
  }
  return next
})

function getResolvedSongsPath(): string | null {
  const gui = readGuiSettings()
  return resolveSongsPath(gui.songsPath || null)
}

ipcMain.handle('maps:search', async (_e, params: MapSearchParams) => {
  return searchMapSets(params || {})
})

ipcMain.handle('maps:osu-file', async (_e, beatmapId: number) => {
  return fetchBeatmapOsuFile(Number(beatmapId) || 0)
})

ipcMain.handle('maps:get-songs-path', async () => {
  const gui = readGuiSettings()
  const resolved = resolveSongsPath(gui.songsPath || null)
  return {
    configured: gui.songsPath || '',
    resolved,
    detected: detectDefaultSongsPath(),
  }
})

ipcMain.handle('maps:pick-songs-path', async () => {
  const picked = await pickSongsDirectory(mainWindow)
  if (!picked) return { cancelled: true as const, configured: readGuiSettings().songsPath || '', resolved: getResolvedSongsPath() }
  writeGuiSettings({ songsPath: picked })
  return { cancelled: false as const, configured: picked, resolved: resolveSongsPath(picked) }
})

ipcMain.handle('maps:open-songs-folder', async () => {
  const songs = getResolvedSongsPath()
  if (!songs) throw new Error('Папка Songs не найдена')
  await shell.openPath(songs)
  return { ok: true }
})

ipcMain.handle('maps:local-sets', async () => {
  const songs = getResolvedSongsPath()
  if (!songs) return { songsPath: null as string | null, setIds: [] as number[] }
  return { songsPath: songs, setIds: scanLocalSetIds(songs) }
})

ipcMain.handle('maps:auth-status', async () => fetchOsuAccount())

ipcMain.handle('maps:login', async () => {
  return loginWithOsuWindow(mainWindow)
})

ipcMain.handle('maps:logout', async () => {
  await clearOsuSession()
  return fetchOsuAccount()
})

ipcMain.handle('maps:cancel-download', async (_e, setId: number) => {
  const id = Number(setId) || 0
  if (!id) return { ok: false }
  const ok = cancelMapDownload(id)
  if (ok) {
    broadcastMapsProgress({
      setId: id,
      phase: 'cancelled',
      progress: 0,
      message: 'Отменено',
    })
  }
  return { ok }
})

ipcMain.handle(
  'maps:download',
  async (
    _e,
    payload: { setId?: number; artist?: string; title?: string }
  ) => {
    const setId = Number(payload?.setId) || 0
    if (!setId) throw new Error('Некорректный set id')

    const songs = getResolvedSongsPath()
    if (!songs) throw new Error('Укажите папку Songs osu! в Настройках')

    const send = (progress: MapDownloadProgress) => {
      broadcastMapsProgress(progress)
    }

    try {
      const result = await downloadMapSet(
        setId,
        songs,
        send,
        {
          artist: typeof payload?.artist === 'string' ? payload.artist : '',
          title: typeof payload?.title === 'string' ? payload.title : '',
        }
      )
      try {
        await shell.openPath(result.filePath)
      } catch (openErr) {
        console.warn('[maps] openPath after download failed:', openErr)
      }
      return { ok: true, ...result }
    } catch (err) {
      if (err instanceof DownloadCancelledError) {
        return { ok: false, cancelled: true as const }
      }
      throw err
    }
  }
)

// --- Skins (main GUI only; no overlay) ---

ipcMain.handle('skins:search', async (_e, params: SkinSearchParams) => {
  return searchOsuckSkins(params || {})
})

ipcMain.handle('skins:detail', async (_e, skinId: number) => {
  return getOsuckSkinDetail(Number(skinId) || 0)
})

ipcMain.handle('skins:get-path', async () => {
  const gui = readGuiSettings()
  const resolved = resolveSkinsPath(gui.skinsPath || null)
  return {
    configured: gui.skinsPath || '',
    resolved,
    detected: detectDefaultSkinsPath(),
  }
})

ipcMain.handle('skins:pick-path', async () => {
  const picked = await pickSkinsDirectory(mainWindow)
  if (!picked) {
    return {
      cancelled: true as const,
      configured: readGuiSettings().skinsPath || '',
      resolved: getResolvedSkinsPath(),
    }
  }
  writeGuiSettings({ skinsPath: picked })
  return { cancelled: false as const, configured: picked, resolved: resolveSkinsPath(picked) }
})

ipcMain.handle('skins:open-folder', async () => {
  const skins = getResolvedSkinsPath()
  if (!skins) throw new Error('Папка Skins не найдена')
  await shell.openPath(skins)
  return { ok: true }
})

ipcMain.handle('skins:local-list', async () => {
  const skins = getResolvedSkinsPath()
  if (!skins) return { skinsPath: null as string | null, entries: [] as ReturnType<typeof scanLocalSkins> }
  return { skinsPath: skins, entries: scanLocalSkins(skins) }
})

ipcMain.handle('skins:cancel-download', async (_e, jobId: string) => {
  const id = typeof jobId === 'string' ? jobId : ''
  if (!id) return { ok: false }
  return { ok: cancelSkinDownload(id) }
})

ipcMain.handle(
  'skins:download',
  async (
    _e,
    payload: {
      skinId?: number
      packageChecksum?: string
      variantIndex?: number
    }
  ) => {
    const skinId = Number(payload?.skinId) || 0
    if (!skinId) throw new Error('Некорректный id скина')
    const skins = getResolvedSkinsPath()
    if (!skins) throw new Error('Укажите папку Skins osu! в Настройках')

    try {
      const result = await downloadOsuckSkin(skinId, skins, broadcastSkinsProgress, {
        packageChecksum:
          typeof payload?.packageChecksum === 'string' ? payload.packageChecksum : undefined,
        variantIndex:
          typeof payload?.variantIndex === 'number' ? payload.variantIndex : undefined,
      })
      if (result.openExternal) {
        await shell.openExternal(result.openExternal)
        return { ok: true, openExternal: result.openExternal, source: result.source }
      }
      if (result.filePath) {
        try {
          await shell.openPath(result.filePath)
        } catch (openErr) {
          console.warn('[skins] openPath after download failed:', openErr)
        }
      }
      return { ok: true, ...result }
    } catch (err) {
      if (err instanceof SkinDownloadCancelledError) {
        return { ok: false, cancelled: true as const }
      }
      throw err
    }
  }
)

ipcMain.handle('skins:import-file', async () => {
  const skins = getResolvedSkinsPath()
  if (!skins) throw new Error('Укажите папку Skins osu! в Настройках')
  const file = await pickSkinFile(mainWindow)
  if (!file) return { cancelled: true as const }
  const result = await importSkinFile(file, skins)
  try {
    await shell.openPath(result.filePath)
  } catch {
    /* ignore */
  }
  return { cancelled: false as const, ...result }
})

ipcMain.handle(
  'skins:download-url',
  async (_e, payload: { url?: string; name?: string }) => {
    const url = typeof payload?.url === 'string' ? payload.url.trim() : ''
    if (!url) throw new Error('URL пустой')
    const skins = getResolvedSkinsPath()
    if (!skins) throw new Error('Укажите папку Skins osu! в Настройках')
    try {
      const result = await downloadSkinFromUrl(
        url,
        skins,
        broadcastSkinsProgress,
        typeof payload?.name === 'string' ? payload.name : undefined
      )
      try {
        await shell.openPath(result.filePath)
      } catch {
        /* ignore */
      }
      return { ok: true, ...result }
    } catch (err) {
      if (err instanceof SkinDownloadCancelledError) {
        return { ok: false, cancelled: true as const }
      }
      throw err
    }
  }
)

ipcMain.handle(
  'osu:user-beatmap-score',
  async (
    _e,
    payload: {
      userId?: number
      userName?: string
      beatmapId?: number
      beatmapChecksum?: string
      mode?: string
      osuPath?: string
    }
  ) => {
    return lookupUserBeatmapScore({
      userId: Number(payload?.userId) || 0,
      userName: typeof payload?.userName === 'string' ? payload.userName : '',
      beatmapId: Number(payload?.beatmapId) || 0,
      beatmapChecksum:
        typeof payload?.beatmapChecksum === 'string' ? payload.beatmapChecksum : '',
      mode: typeof payload?.mode === 'string' ? payload.mode : 'osu',
      osuPath: typeof payload?.osuPath === 'string' ? payload.osuPath : '',
    })
  }
)

ipcMain.handle('tosu:check-update', async () => {
  return tosuUpdater.checkForUpdate(tosuProcess.getTosuDir())
})

ipcMain.handle('tosu:dismiss-update', async (_e, version: string) => {
  writeGuiSettings({ dismissedTosuVersion: version })
})

ipcMain.handle('app:check-update', async () => {
  return checkAppUpdate()
})

ipcMain.handle('app:dismiss-update', async (_e, version: string) => {
  writeGuiSettings({ dismissedAppVersion: version })
})

ipcMain.handle('app:install-update', async () => {
  if (isAppUpdateDownloading()) {
    throw new Error('Обновление уже выполняется')
  }
  if (tosuProcess.isUpdating()) {
    throw new Error('Сначала дождитесь окончания обновления tosu')
  }

  const sendProgress = (progress: import('./app-updater').AppUpdateProgress) => {
    mainWindow?.webContents.send('app:update-progress', progress)
  }

  await downloadAndInstallAppUpdate(sendProgress, async () => {
    isQuitting = true
    tosuSocket.disconnect()
    try {
      if (tosuProcess.isRunning() || tosuProcess.isBusy()) {
        await tosuProcess.stopForUpdate()
        tosuProcess.endUpdate()
      } else {
        tosuProcess.stop()
      }
    } catch (err) {
      console.warn('[app-updater] failed to stop tosu before install:', err)
    }
    writeGuiSettings({ dismissedAppVersion: null })
  })

  return { ok: true }
})

ipcMain.handle('tosu:install-update', async () => {
  if (tosuProcess.isUpdating() || isAppUpdateDownloading()) {
    throw new Error('Обновление уже выполняется')
  }

  const tosuDir = tosuProcess.getTosuDir()
  const previousVersion = getInstalledVersion(tosuDir) || 'unknown'
  const sendProgress = (progress: import('./tosu-updater').UpdateProgress) => {
    mainWindow?.webContents.send('tosu:update-progress', progress)
  }

  tosuSocket.disconnect()

  let stagedVersion: string | null = null

  try {
    sendProgress({ phase: 'installing', progress: 2, message: 'Остановка tosu…' })
    await tosuProcess.stopForUpdate()

    // 1. Snapshot current installation for safe rollback
    await backupCurrentInstall(tosuDir)

    // 2. Download, extract and stage update files
    stagedVersion = await tosuUpdater.stageAndInstall(tosuDir, sendProgress)

    // 3. Best-effort overlay patching
    sendProgress({ phase: 'restarting', progress: 93, message: 'Подготовка оверлея…' })
    try {
      await ensureGameOverlay(tosuDir, stagedVersion)
      await patchIngameOverlay(tosuDir)
    } catch (overlayErr) {
      console.warn('[tosu] overlay prepare after update failed (non-fatal):', overlayErr)
    }

    sendProgress({ phase: 'restarting', progress: 95, message: 'Запуск обновлённого tosu…' })
    const guiSettings = readGuiSettings()
    setOverlayAntialiasing(tosuDir, guiSettings.disableAntialiasing)

    // 4. Start updated tosu and wait for API health check
    await tosuProcess.startAfterUpdate({ startupTimeoutMs: 35_000 })
    tosuApi.setBaseUrl(getTosuBaseUrl())
    tosuApi.setEnvPath(tosuProcess.getEnvPath())
    startSocketBridge()

    // 5. Success! Commit the new version and cleanup backup/temp
    tosuUpdater.commitUpdate(tosuDir, stagedVersion)
    writeGuiSettings({ dismissedTosuVersion: null })
    sendProgress({ phase: 'done', progress: 100, message: 'Готово' })

    return { ok: true, version: stagedVersion, restartFailed: false }
  } catch (err) {
    const errorReason = formatUserFacingError(err, 'Ошибка при установке или запуске обновления')
    console.error('[tosu] update failed, starting rollback:', err)

    sendProgress({
      phase: 'restarting',
      progress: 96,
      message: 'Откат к предыдущей версии…',
    })

    // Roll back files to backup snapshot
    await restoreBackup(tosuDir)
    cleanupBackup(tosuDir)

    // Restart old working tosu
    let oldRecovered = false
    try {
      await tosuProcess.startAfterUpdate({ startupTimeoutMs: 40_000 })
      tosuApi.setBaseUrl(getTosuBaseUrl())
      tosuApi.setEnvPath(tosuProcess.getEnvPath())
      startSocketBridge()
      oldRecovered = true
    } catch (restartErr) {
      console.error('[tosu] failed to restart old version after rollback:', restartErr)
    }

    const failureMessage = oldRecovered
      ? `Не удалось обновить tosu (${errorReason}). Автоматически восстановлена предыдущая рабочая версия (v${previousVersion}).`
      : `Не удалось обновить tosu (${errorReason}). Попробуйте перезапустить приложение.`

    sendProgress({ phase: 'error', progress: 0, message: failureMessage })
    throw new Error(failureMessage)
  }
})