import { ChildProcess, execSync, spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import http from 'http'
import net from 'net'
import {
  cleanupOverlayAsideDirs,
  ensureGameOverlay,
  isGameOverlayBroken,
  removeGameOverlay,
} from './overlay-cleanup'
import { getInstalledVersion } from './tosu-updater'
import { patchIngameOverlay } from './overlay-patch'

const DEFAULT_PORT = 24050
const DEFAULT_STARTUP_TIMEOUT_MS = 20000
const CREATE_NO_WINDOW = 0x08000000

function hiddenSpawnOptions() {
  if (process.platform !== 'win32') return { windowsHide: true, stdio: 'ignore' as const }
  return {
    windowsHide: true,
    stdio: 'ignore' as const,
    creationFlags: CREATE_NO_WINDOW,
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export class TosuProcess {
  private process: ChildProcess | null = null
  readonly port = DEFAULT_PORT

  private restartTimer: ReturnType<typeof setTimeout> | null = null
  /** True while we intentionally stop tosu (user stop, update, app quit). */
  private intentionalStop = false
  /** True while an update is installing — blocks concurrent restart/start. */
  private updating = false
  /** Number of start/stop/restart ops currently on the exclusive chain. */
  private opsInFlight = 0
  /** Serializes start/stop/restart so they cannot race. */
  private opChain: Promise<void> = Promise.resolve()

  get pid() {
    return this.process?.pid ?? null
  }

  isRunning() {
    const child = this.process
    if (!child || child.killed) return false
    if (child.exitCode !== null) return false
    return true
  }

  isUpdating() {
    return this.updating
  }

  /** True while start/stop/restart/update teardown is in progress. */
  isBusy() {
    return this.opsInFlight > 0 || this.updating
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

    throw new Error('tosu binary not found. Run: npm run download-tosu')
  }

  getEnvPath() {
    return path.join(this.getTosuDir(), 'tosu.env')
  }

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.opChain.then(
      async () => {
        this.opsInFlight += 1
        try {
          return await fn()
        } finally {
          this.opsInFlight -= 1
        }
      },
      async () => {
        this.opsInFlight += 1
        try {
          return await fn()
        } finally {
          this.opsInFlight -= 1
        }
      }
    )
    this.opChain = run.then(
      () => undefined,
      () => undefined
    )
    return run
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

    // tosu clamps POLL_RATE to min 100 — keep env clean
    content = content.replace(/^POLL_RATE=\s*([0-9]+)\s*$/m, (_m, n: string) => {
      const v = parseInt(n, 10)
      return `POLL_RATE=${Number.isFinite(v) && v < 100 ? 100 : n}`
    })

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
      await sleep(250)
    }

    throw new Error('Не удалось остановить tosu — закройте osu! и повторите обновление')
  }

  private isPortFree(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer()
      server.unref()
      server.once('error', () => resolve(false))
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(true))
      })
    })
  }

  private async waitForPortFree(timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await this.isPortFree(this.port)) return
      await sleep(200)
    }
    // Last resort: kill anything still holding the port (stale tosu)
    if (process.platform === 'win32') {
      await this.killProcessImage('tosu.exe')
      await sleep(400)
    }
  }

  private waitForReady(timeoutMs = DEFAULT_STARTUP_TIMEOUT_MS): Promise<void> {
    const deadline = Date.now() + timeoutMs

    return new Promise((resolve, reject) => {
      const check = () => {
        // If our child already died, fail fast instead of waiting full timeout
        if (this.process && this.process.exitCode !== null) {
          reject(new Error(`tosu exited early with code ${this.process.exitCode}`))
          return
        }

        const req = http.get(`http://127.0.0.1:${this.port}/`, (res) => {
          res.resume()
          resolve()
        })

        req.on('error', () => {
          if (Date.now() > deadline) {
            reject(new Error('tosu failed to start within timeout'))
            return
          }
          setTimeout(check, 300)
        })

        req.setTimeout(1500, () => {
          req.destroy()
        })
      }

      check()
    })
  }

  private async killProcessImage(imageName: string) {
    await new Promise<void>((resolve) => {
      const killer = spawn('taskkill', ['/IM', imageName, '/F'], hiddenSpawnOptions())
      let done = false
      const finish = () => {
        if (done) return
        done = true
        resolve()
      }
      killer.on('exit', finish)
      killer.on('error', finish)
      setTimeout(finish, 600)
    })
  }

  /** Stop standalone tosu/overlay instances before we spawn our own. */
  private async killStaleProcesses() {
    if (process.platform !== 'win32') return
    const images = ['tosu.exe', 'tosu-ingame-overlay.exe']
    for (const name of images) {
      if (this.isProcessImageRunning(name)) {
        await this.killProcessImage(name)
      }
    }
    // brief settle so handles/port release
    if (images.some((n) => this.isProcessImageRunning(n))) {
      await sleep(300)
      for (const name of images) {
        if (this.isProcessImageRunning(name)) await this.killProcessImage(name)
      }
    }
  }

  private clearRestartTimer() {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
  }

  private scheduleRestart() {
    if (this.intentionalStop || this.updating || this.restartTimer || this.opsInFlight > 0) return
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      if (this.intentionalStop || this.updating || this.isRunning() || this.opsInFlight > 0) return
      console.log('[tosu] auto-restarting...')
      void this.start().catch((err) => {
        console.error('[tosu] auto-restart failed:', err)
      })
    }, 2500)
  }

  private bindProcess(child: ChildProcess) {
    this.process = child

    child.on('error', (err) => {
      console.error('[tosu] process error:', err)
      if (this.process === child) this.process = null
      if (!this.intentionalStop && !this.updating) this.scheduleRestart()
    })

    child.on('exit', (code) => {
      console.log('[tosu] exited with code', code)
      if (this.process === child) this.process = null
      if (!this.intentionalStop && !this.updating) {
        this.scheduleRestart()
      }
    })
  }

  private async killTrackedProcess() {
    const child = this.process
    this.process = null

    if (child?.pid && process.platform === 'win32') {
      await new Promise<void>((resolve) => {
        const killer = spawn(
          'taskkill',
          ['/pid', String(child.pid), '/f', '/t'],
          hiddenSpawnOptions()
        )
        let done = false
        const finish = () => {
          if (done) return
          done = true
          resolve()
        }
        killer.on('exit', finish)
        killer.on('error', finish)
        setTimeout(finish, 600)
      })
    } else if (child) {
      try {
        child.kill('SIGTERM')
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Best-effort overlay prep. MUST NOT throw — never block tosu.exe start.
   */
  private async prepareOverlay(tosuDir: string) {
    try {
      cleanupOverlayAsideDirs(tosuDir)

      if (isGameOverlayBroken(tosuDir)) {
        console.log('[tosu] broken game-overlay, best-effort cleanup…')
        await removeGameOverlay(tosuDir)
      }

      const overlayReady = await ensureGameOverlay(tosuDir, getInstalledVersion(tosuDir))
      if (!overlayReady) {
        console.warn('[tosu] game-overlay unavailable — starting tosu without overlay prep')
        return
      }

      // Patch tray before launch so we never need to kill a live overlay
      try {
        await patchIngameOverlay(tosuDir)
      } catch (err) {
        console.warn('[tosu] overlay patch failed (non-fatal):', err)
      }
    } catch (err) {
      console.warn('[tosu] prepareOverlay failed (non-fatal):', err)
    }
  }

  /** Start body without exclusive lock — caller must hold the lock. */
  private async startUnlocked(options?: { startupTimeoutMs?: number; force?: boolean }) {
    if (this.isRunning() && !options?.force) return

    this.intentionalStop = false
    this.clearRestartTimer()

    if (this.process) {
      await this.killTrackedProcess()
    }

    const exe = this.getTosuExe()
    const tosuDir = this.getTosuDir()
    this.ensureEnv()

    // Kill leftovers + free port, then spawn tosu FIRST priority
    await this.killStaleProcesses()
    await this.waitForPortFree(4000)

    // Overlay is optional. Failures must never prevent tosu from starting.
    await this.prepareOverlay(tosuDir)

    const child = spawn(exe, [], {
      cwd: tosuDir,
      detached: false,
      env: {
        ...process.env,
        OPEN_DASHBOARD_ON_STARTUP: 'false',
      },
      ...hiddenSpawnOptions(),
    })

    this.bindProcess(child)

    try {
      await this.waitForReady(options?.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS)
    } catch (err) {
      const code = child.exitCode
      const hint =
        code !== null && code !== undefined
          ? ` (exit code ${code})`
          : ' (process still running but API did not respond)'
      await this.killTrackedProcess()
      if (process.platform === 'win32') {
        await this.killProcessImage('tosu.exe')
        await this.killProcessImage('tosu-ingame-overlay.exe')
      }
      const base = err instanceof Error ? err.message : 'tosu failed to start'
      throw new Error(`${base}${hint}`)
    }
  }

  async start(options?: { startupTimeoutMs?: number; force?: boolean }) {
    return this.runExclusive(async () => {
      if (this.updating && !options?.force) {
        throw new Error('Идёт обновление tosu — подождите окончания')
      }
      await this.startUnlocked(options)
    })
  }

  async restart() {
    return this.runExclusive(async () => {
      if (this.updating) {
        throw new Error('Идёт обновление tosu — подождите окончания')
      }
      this.intentionalStop = true
      this.clearRestartTimer()
      await this.killTrackedProcess()
      if (process.platform === 'win32') {
        await this.killProcessImage('tosu.exe')
        await this.killProcessImage('tosu-ingame-overlay.exe')
      }
      await this.waitForPortFree(6000)
      await sleep(300)
      await this.startUnlocked({ force: true, startupTimeoutMs: 25_000 })
    })
  }

  stop() {
    this.intentionalStop = true
    this.clearRestartTimer()

    if (this.process) {
      if (process.platform === 'win32' && this.process.pid) {
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
    return this.runExclusive(async () => {
      this.updating = true
      this.intentionalStop = true
      this.clearRestartTimer()
      await this.killTrackedProcess()

      if (process.platform !== 'win32') {
        await sleep(1000)
        return
      }

      try {
        for (let attempt = 0; attempt < 3; attempt++) {
          await this.killProcessImage('tosu.exe')
          await this.killProcessImage('tosu-ingame-overlay.exe')
          await sleep(300)
          if (
            !this.isProcessImageRunning('tosu.exe') &&
            !this.isProcessImageRunning('tosu-ingame-overlay.exe')
          ) {
            break
          }
        }

        await this.waitForProcessesGone(['tosu.exe', 'tosu-ingame-overlay.exe'], 15_000)
        await this.waitForPortFree(5000)
      } catch (err) {
        this.updating = false
        throw err
      }
    })
  }

  /** Call after update install finishes (success or failure) so start/restart work again. */
  endUpdate() {
    this.updating = false
    this.intentionalStop = false
  }

  /**
   * Force-start after an update. Always kills leftovers and respawns.
   */
  async startAfterUpdate(options?: { startupTimeoutMs?: number }) {
    return this.runExclusive(async () => {
      this.updating = false
      this.intentionalStop = false
      this.clearRestartTimer()
      await this.startUnlocked({
        startupTimeoutMs: options?.startupTimeoutMs ?? 30_000,
        force: true,
      })
    })
  }
}
