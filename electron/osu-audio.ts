import { ChildProcess, execFile, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { readGuiSettings, writeGuiSettings } from './gui-settings'

const CREATE_NO_WINDOW = 0x08000000

function getAudioControllerExe(): string | null {
  if (process.platform !== 'win32') return null

  const candidates = [
    path.join(process.resourcesPath || '', 'bin', 'osu-audio-controller.exe'),
    path.join(app.getAppPath ? app.getAppPath() : '', 'resources', 'bin', 'osu-audio-controller.exe'),
    path.join(__dirname, '..', 'resources', 'bin', 'osu-audio-controller.exe'),
    path.join(process.cwd(), 'resources', 'bin', 'osu-audio-controller.exe'),
  ]

  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return null
}

export interface OsuAudioState {
  autoMute: boolean
  isMuted: boolean
  available: boolean
}

class OsuAudioManager {
  private daemon: ChildProcess | null = null
  private isMuted = false
  private activePreviews = new Set<string>()
  private autoMuteEnabled = true
  private opQueue: Promise<void> = Promise.resolve()
  private pendingLineResolvers: Array<(line: string) => void> = []
  private lineBuffer = ''

  constructor() {
    this.autoMuteEnabled = readGuiSettings().muteOsuOnPreview ?? true
  }

  init() {
    if (process.platform !== 'win32') return
    this.ensureDaemon()

    app.on('before-quit', () => {
      this.cleanup()
    })
    app.on('will-quit', () => {
      this.cleanup()
    })
    process.on('exit', () => {
      this.cleanup()
    })
  }

  private ensureDaemon(): ChildProcess | null {
    if (this.daemon && !this.daemon.killed && this.daemon.exitCode === null) {
      return this.daemon
    }

    const exe = getAudioControllerExe()
    if (!exe) {
      console.warn('[osu-audio] controller binary not found')
      return null
    }

    try {
      this.lineBuffer = ''
      this.pendingLineResolvers = []

      const proc = spawn(exe, ['--daemon'], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'ignore'],
        creationFlags: CREATE_NO_WINDOW,
      })

      proc.stdout?.on('data', (chunk: Buffer) => {
        this.lineBuffer += chunk.toString('utf8')
        const lines = this.lineBuffer.split('\n')
        this.lineBuffer = lines.pop() || ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          const resolver = this.pendingLineResolvers.shift()
          if (resolver) resolver(trimmed)
        }
      })

      proc.on('exit', () => {
        if (this.daemon === proc) {
          this.daemon = null
          // Flush pending resolvers with empty response
          while (this.pendingLineResolvers.length) {
            this.pendingLineResolvers.shift()?.('')
          }
        }
      })

      this.daemon = proc
      return proc
    } catch (err) {
      console.error('[osu-audio] failed to spawn daemon:', err)
      return null
    }
  }

  private sendDaemonCommand(cmd: string): Promise<string> {
    return new Promise((resolve) => {
      const daemon = this.ensureDaemon()
      if (!daemon || !daemon.stdin || daemon.stdin.destroyed) {
        // Fallback to one-shot CLI execution if daemon isn't available
        const exe = getAudioControllerExe()
        if (!exe) {
          resolve('')
          return
        }
        execFile(exe, [cmd], { windowsHide: true }, (err, stdout) => {
          resolve((stdout || '').trim())
        })
        return
      }

      const timer = setTimeout(() => {
        // Timeout safety: resolve empty if daemon doesn't respond
        const idx = this.pendingLineResolvers.indexOf(onLine)
        if (idx !== -1) this.pendingLineResolvers.splice(idx, 1)
        resolve('')
      }, 1000)

      const onLine = (line: string) => {
        clearTimeout(timer)
        resolve(line)
      }

      this.pendingLineResolvers.push(onLine)
      daemon.stdin.write(cmd + '\n')
    })
  }

  private runSerialized<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.opQueue.then(fn, fn)
    this.opQueue = next.then(() => {}, () => {})
    return next
  }

  getState(): OsuAudioState {
    return {
      autoMute: this.autoMuteEnabled,
      isMuted: this.isMuted,
      available: process.platform === 'win32' && !!getAudioControllerExe(),
    }
  }

  setAutoMute(enabled: boolean): Promise<OsuAudioState> {
    return this.runSerialized(async () => {
      this.autoMuteEnabled = Boolean(enabled)
      writeGuiSettings({ muteOsuOnPreview: this.autoMuteEnabled })

      if (!this.autoMuteEnabled && this.isMuted) {
        await this.unmuteInternal()
      } else if (this.autoMuteEnabled && this.activePreviews.size > 0 && !this.isMuted) {
        await this.muteInternal()
      }

      return this.getState()
    })
  }

  setPreviewActive(active: boolean, previewKey = 'default'): Promise<OsuAudioState> {
    return this.runSerialized(async () => {
      if (active) {
        this.activePreviews.add(previewKey)
        if (this.autoMuteEnabled && !this.isMuted) {
          await this.muteInternal()
        }
      } else {
        this.activePreviews.delete(previewKey)
        if (this.activePreviews.size === 0 && this.isMuted) {
          await this.unmuteInternal()
        }
      }

      return this.getState()
    })
  }

  private async muteInternal(): Promise<boolean> {
    const res = await this.sendDaemonCommand('mute')
    try {
      const data = JSON.parse(res) as { ok?: boolean; matched?: number }
      if (data.ok) {
        this.isMuted = true
        console.log(`[osu-audio] muted osu sound (matched: ${data.matched ?? 0})`)
        return true
      }
    } catch {
      /* ignore */
    }
    this.isMuted = true
    return false
  }

  private async unmuteInternal(): Promise<boolean> {
    const res = await this.sendDaemonCommand('unmute')
    this.isMuted = false
    try {
      const data = JSON.parse(res) as { ok?: boolean; matched?: number }
      if (data.ok) {
        console.log(`[osu-audio] unmuted osu sound (matched: ${data.matched ?? 0})`)
        return true
      }
    } catch {
      /* ignore */
    }
    return false
  }

  cleanup() {
    if (this.isMuted) {
      const exe = getAudioControllerExe()
      if (exe) {
        try {
          // Synchronous unmute on process teardown to ensure sound is restored
          const { execFileSync } = require('child_process')
          execFileSync(exe, ['unmute'], { windowsHide: true, timeout: 1000 })
        } catch {
          /* ignore */
        }
      }
      this.isMuted = false
    }

    if (this.daemon) {
      try {
        this.daemon.stdin?.write('quit\n')
        this.daemon.kill()
      } catch {
        /* ignore */
      }
      this.daemon = null
    }
  }
}

export const osuAudio = new OsuAudioManager()
