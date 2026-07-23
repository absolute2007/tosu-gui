import { contextBridge, ipcRenderer } from 'electron'
import type { TosuCounter, TosuAppSettings, CounterSetting } from './tosu-api'
import type { TosuUpdateInfo, UpdateProgress } from './tosu-updater'
import type { AppUpdateInfo, AppUpdateProgress } from './app-updater'
import type { GuiSettings } from './gui-settings'
import type { OnlineBeatmapScore } from './osu-user-score'
import type {
  MapDownloadProgress,
  MapSearchParams,
  MapSearchResult,
} from './beatmap-maps'
import type { OsuAccountInfo } from './osu-session'

export interface TosuStatus {
  running: boolean
  busy?: boolean
  port: number
  baseUrl: string
  pid: number | null
  version: string | null
  appVersion?: string | null
}

export type TosuSocketEvent =
  | { type: 'bridge'; connected: boolean }
  | { type: 'message'; data: string }

const api = {
  platform: process.platform as NodeJS.Platform,
  getStatus: (): Promise<TosuStatus> => ipcRenderer.invoke('tosu:status'),
  restart: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('tosu:restart'),
  getCounters: (): Promise<TosuCounter[]> => ipcRenderer.invoke('tosu:get-counters'),
  getSettings: (): Promise<TosuAppSettings> => ipcRenderer.invoke('tosu:get-settings'),
  saveSettings: (settings: Record<string, string>): Promise<{ status: string }> =>
    ipcRenderer.invoke('tosu:save-settings', settings),
  getCounterSettings: (name: string): Promise<CounterSetting[]> =>
    ipcRenderer.invoke('tosu:get-counter-settings', name),
  saveCounterSettings: (name: string, settings: unknown[]): Promise<{ result: string }> =>
    ipcRenderer.invoke('tosu:save-counter-settings', name, settings),
  deleteCounter: (name: string) => ipcRenderer.invoke('tosu:delete-counter', name),
  openCounterFolder: (name: string) => ipcRenderer.invoke('tosu:open-counter-folder', name),
  downloadCounter: (url: string, name: string, update?: boolean) =>
    ipcRenderer.invoke('tosu:download-counter', url, name, update),
  searchAvailable: (query: string): Promise<TosuCounter[]> =>
    ipcRenderer.invoke('tosu:search-available', query),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  onMaximizeChanged: (callback: (maximized: boolean) => void) => {
    const handler = (_event: unknown, maximized: boolean) => callback(maximized)
    ipcRenderer.on('window:maximized-changed', handler)
    ipcRenderer.invoke('window:is-maximized').then(callback).catch(() => {})
    return () => ipcRenderer.removeListener('window:maximized-changed', handler)
  },
  onSocketEvent: (callback: (event: TosuSocketEvent) => void) => {
    const handler = (_event: unknown, payload: TosuSocketEvent) => callback(payload)
    ipcRenderer.on('tosu:socket-event', handler)
    return () => ipcRenderer.removeListener('tosu:socket-event', handler)
  },
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  checkTosuUpdate: (): Promise<TosuUpdateInfo> => ipcRenderer.invoke('tosu:check-update'),
  installTosuUpdate: (): Promise<{ ok: boolean; version: string; restartFailed?: boolean }> =>
    ipcRenderer.invoke('tosu:install-update'),
  dismissTosuUpdate: (version: string): Promise<void> =>
    ipcRenderer.invoke('tosu:dismiss-update', version),
  checkAppUpdate: (): Promise<AppUpdateInfo> => ipcRenderer.invoke('app:check-update'),
  installAppUpdate: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('app:install-update'),
  dismissAppUpdate: (version: string): Promise<void> =>
    ipcRenderer.invoke('app:dismiss-update', version),
  getGuiSettings: (): Promise<GuiSettings> => ipcRenderer.invoke('gui:get-settings'),
  saveGuiSettings: (updates: Partial<GuiSettings>): Promise<GuiSettings> =>
    ipcRenderer.invoke('gui:save-settings', updates),
  getUserBeatmapScore: (payload: {
    userId: number
    userName: string
    beatmapId: number
    beatmapChecksum: string
    mode: string
    osuPath: string
  }): Promise<OnlineBeatmapScore> => ipcRenderer.invoke('osu:user-beatmap-score', payload),
  onUpdateProgress: (callback: (progress: UpdateProgress) => void) => {
    const handler = (_event: unknown, payload: UpdateProgress) => callback(payload)
    ipcRenderer.on('tosu:update-progress', handler)
    return () => ipcRenderer.removeListener('tosu:update-progress', handler)
  },
  onAppUpdateProgress: (callback: (progress: AppUpdateProgress) => void) => {
    const handler = (_event: unknown, payload: AppUpdateProgress) => callback(payload)
    ipcRenderer.on('app:update-progress', handler)
    return () => ipcRenderer.removeListener('app:update-progress', handler)
  },
  searchMaps: (params: MapSearchParams): Promise<MapSearchResult> =>
    ipcRenderer.invoke('maps:search', params),
  fetchBeatmapOsu: (beatmapId: number): Promise<{ beatmapId: number; content: string }> =>
    ipcRenderer.invoke('maps:osu-file', beatmapId),
  getSongsPath: (): Promise<{
    configured: string
    resolved: string | null
    detected: string | null
  }> => ipcRenderer.invoke('maps:get-songs-path'),
  pickSongsPath: (): Promise<{
    cancelled: boolean
    configured: string
    resolved: string | null
  }> => ipcRenderer.invoke('maps:pick-songs-path'),
  openSongsFolder: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('maps:open-songs-folder'),
  getLocalMapSets: (): Promise<{ songsPath: string | null; setIds: number[] }> =>
    ipcRenderer.invoke('maps:local-sets'),
  getOsuAuthStatus: (): Promise<OsuAccountInfo> => ipcRenderer.invoke('maps:auth-status'),
  loginOsu: (): Promise<OsuAccountInfo> => ipcRenderer.invoke('maps:login'),
  logoutOsu: (): Promise<OsuAccountInfo> => ipcRenderer.invoke('maps:logout'),
  downloadMap: (payload: {
    setId: number
    artist?: string
    title?: string
  }): Promise<{ ok: boolean; filePath?: string; source?: string; cancelled?: boolean }> =>
    ipcRenderer.invoke('maps:download', payload),
  cancelMapDownload: (setId: number): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('maps:cancel-download', setId),
  onMapDownloadProgress: (callback: (progress: MapDownloadProgress) => void) => {
    const handler = (_event: unknown, payload: MapDownloadProgress) => callback(payload)
    ipcRenderer.on('maps:download-progress', handler)
    return () => {
      ipcRenderer.removeListener('maps:download-progress', handler)
    }
  },
}

contextBridge.exposeInMainWorld('tosuGui', api)

export type TosuGuiApi = typeof api