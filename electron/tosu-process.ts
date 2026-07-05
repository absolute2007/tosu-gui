import { ChildProcess, execSync, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import http from 'http'
import { ensureGameOverlay, isGameOverlayBroken, removeGameOverlay } from './overlay-cleanup'
import { getInstalledVersion } from './tosu-updater'
import { patchIngameOverlay } from './overlay-patch'

const DEFAULT_PORT = 24050
const DEFAULT_STARTUP_TIMEOUT_MS = 30000
const CREATE_NO_WINDOW = 0x08000000

function hiddenSpawnOptions() {
  if (process.platform !== 'win32') return { windowsHide: true, stdio: 'ignore' as const }
  return {
    windowsHide: true,
    stdio: 'ignore' as const,
    creationFlags: CREATE_NO_WINDOW,
  }
}

export class TosuProcess {
  private process: ChildProcess | null = null
  readonly port = DEFAULT_PORT

  get pid() {
    return this.process?.pid ?? null
  }

  isRunning() {
    return this.process !== null && !this.process.killed
  }

  getTosuDir() {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'tosu')
    }
    return path.join(app.getAppPath(), 'resources', 'tosu')
  }

  private getTosuExe() {
    const dir = this.getTosuDir()
    const winExe = path.join(dir, 'tosu.exe')
    const linuxBin = path.join(dir, 'tosu')

    if (process.platform === 'win32' && fs.existsSync(winExe)) return winExe
    if (fs.existsSync(linuxBin)) return linuxBin
    if (fs.existsSync(winExe)) return winExe

    throw new Error(
      'tosu binary not found. Run: npm run download-tosu'
    )
  }

  getEnvPath() {
    return path.join(this.getTosuDir(), 'tosu.env')
  }

  private ensureEnv() {
    const envPath = this.getEnvPath()
    const tosuDir = this.getTosuDir()

    if (!fs.existsSync(tosuDir)) {
      fs.mkdirSync(tosuDir, { recursive: true })
    }

    let content = ''
    if (fs.existsSync(envPath)) {
      content = fs.readFileSync(envPath, 'utf8')
    }

    const defaults: Record<string, string> = {
      OPEN_DASHBOARD_ON_STARTUP: 'false',
      SERVER_PORT: String(this.port),
      ENABLE_AUTOUPDATE: 'false',
    }

    for (const [key, value] of Object.entries(defaults)) {
      const regex = new RegExp(`^${key}=`, 'm')
      if (regex.test(content)) {
        content = content.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`)
      } else {
        content += `${content.endsWith('\n') || content === '' ? '' : '\n'}${key}=${value}\n`
      }
    }

    fs.writeFileSync(envPath, content, 'utf8')
  }

  private isProcessImageRunning(imageName: string) {
    if (process.platform !== 'win32') return false
    try {
      const out = execSync(`tasklist /FI "IMAGENAME eq ${imageName}" /NH`, {
        encoding: 'utf8',
        windowsHide: true,
      })
      return out.toLowerCase().includes(imageName.toLowerCase())
    } catch {
      return false
    }
  }

  private async waitForProcessesGone(imageNames: string[], timeoutMs: number) {
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      const running = imageNames.some((name) => this.isProcessImageRunning(name))
      if (!running) return
      await new Promise((resolve) => setTimeout(resolve, 400))
    }

    throw new Error('Не удалось остановить tosu — закройте osu! и повторите обновление')
  }

  private waitForReady(timeoutMs = DEFAULT_STARTUP_TIMEOUT_MS): Promise<void> {
    const deadline = Date.now() + timeoutMs

    return new Promise((resolve, reject) => {
      const check = () => {
        const req = http.get(`http://127.0.0.1:${this.port}/`, (res) => {
          res.resume()
          resolve()
        })

        req.on('error', () => {
          if (Date.now() > deadline) {
            reject(new Error('tosu failed to start within timeout'))
            return
          }
          setTimeout(check, 500)
        })

        req.setTimeout(2000, () => {
          req.destroy()
        })
      }

      check()
    })
  }

  private async killProcessImage(imageName: string) {
    await new Promise<void>((resolve) => {
      const killer = spawn('taskkill', ['/IM', imageName, '/F'], hiddenSpawnOptions())
      killer.on('exit', () => resolve())
      killer.on('error', () => resolve())
      setTimeout(resolve, 800)
    })
  }

  /** Stop standalone tosu/overlay instances (e.g. from Desktop install) before we spawn our own. */
  private async killStaleProcesses() {
    if (process.platform !== 'win32') return
    await this.killProcessImage('tosu.exe')
    await this.killProcessImage('tosu-ingame-overlay.exe')
  }

  private async waitForOverlayDownload(tosuDir: string, timeoutMs = 120_000) {
    const overlayExe = path.join(tosuDir, 'game-overlay', 'tosu-ingame-overlay.exe')
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      if (fs.existsSync(overlayExe)) return true
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    return false
  }

  private async ensureOverlayPatch(tosuDir: string) {
    const overlayReady = await this.waitForOverlayDownload(tosuDir)
    if (!overlayReady) {
      console.warn('[tosu] overlay was not downloaded in time')
      return
    }

    const patched = patchIngameOverlay(tosuDir)
    if (patched && process.platform === 'win32') {
      await this.killProcessImage('tosu-ingame-overlay.exe')
    }
  }

  async start(options?: { startupTimeoutMs?: number }) {
    if (this.isRunning()) return

    const exe = this.getTosuExe()
    const tosuDir = this.getTosuDir()
    this.ensureEnv()
    await this.killStaleProcesses()

    if (isGameOverlayBroken(tosuDir)) {
      console.log('[tosu] removing broken game-overlay')
      await removeGameOverlay(tosuDir)
    }

    const overlayReady = await ensureGameOverlay(tosuDir, getInstalledVersion(tosuDir))
    if (!overlayReady) {
      console.warn('[tosu] game-overlay is missing and could not be restored')
    } else {
      patchIngameOverlay(tosuDir)
    }

    const cwd = tosuDir

    this.process = spawn(exe, [], {
      cwd,
      detached: false,
      env: {
        ...process.env,
        OPEN_DASHBOARD_ON_STARTUP: 'false',
      },
      ...hiddenSpawnOptions(),
    })

    this.process.on('exit', (code) => {
      console.log('[tosu] exited with code', code)
      this.process = null
      if (code !== 0 && code !== null) {
        this.scheduleRestart()
      }
    })

    await this.waitForReady(options?.startupTimeoutMs)
    await this.ensureOverlayPatch(tosuDir)
  }

  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private restarting = false

  private scheduleRestart() {
    if (this.restarting || this.restartTimer) return
    this.restartTimer = setTimeout(async () => {
      this.restartTimer = null
      if (this.isRunning()) return
      console.log('[tosu] auto-restarting...')
      try {
        this.restarting = true
        await this.start()
      } catch (err) {
        console.error('[tosu] auto-restart failed:', err)
      } finally {
        this.restarting = false
      }
    }, 3000)
  }

  async restart() {
    this.stop()
    await new Promise((r) => setTimeout(r, 1000))
    await this.start()
  }

  stop() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }

    if (this.process) {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(this.process.pid), '/f', '/t'], hiddenSpawnOptions())
      } else {
        this.process.kill('SIGTERM')
      }
      this.process = null
    }

    if (process.platform === 'win32') {
      void this.killProcessImage('tosu-ingame-overlay.exe')
    }
  }

  async stopForUpdate() {
    this.restarting = true
    this.stop()

    if (process.platform !== 'win32') {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      this.restarting = false
      return
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      await this.killProcessImage('tosu.exe')
      await this.killProcessImage('tosu-ingame-overlay.exe')
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    await this.waitForProcessesGone(['tosu.exe', 'tosu-ingame-overlay.exe'], 20_000)
    this.restarting = false
  }
}