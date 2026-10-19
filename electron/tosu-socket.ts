import { BrowserWindow } from 'electron'
import WebSocket from 'ws'

export type TosuSocketEvent =
  | { type: 'bridge'; connected: boolean }
  | { type: 'message'; data: string }

const MESSAGE_INTERVAL_MS = 100

export class TosuSocketBridge {
  private ws: WebSocket | null = null
  private baseUrl = ''
  private alive = false
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private window: BrowserWindow | null = null

  setWindow(win: BrowserWindow | null) {
    this.window = win
  }

  connect(baseUrl: string) {
    const normalized = baseUrl.replace(/\/$/, '')
    if (
      this.alive &&
      this.baseUrl === normalized &&
      this.ws &&
      (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)
    ) {
      return
    }

    this.baseUrl = normalized
    this.alive = true
    this.open()
  }

  disconnect() {
    this.alive = false
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    this.pendingMessage = null
    this.safeCloseWs(this.ws)
    this.ws = null
    this.emit({ type: 'bridge', connected: false })
  }

  private safeCloseWs(ws: WebSocket | null) {
    if (!ws) return
    ws.removeAllListeners()
    try {
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.terminate()
      } else if (ws.readyState === WebSocket.OPEN) {
        ws.close()
      }
    } catch {
      // ws may already be closing
    }
  }

  private open() {
    if (!this.alive || !this.baseUrl) return

    const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/websocket/v2'

    this.safeCloseWs(this.ws)
    this.ws = null

    const ws = new WebSocket(wsUrl)
    this.ws = ws

    ws.on('open', () => {
      if (this.ws !== ws) return
      this.emit({ type: 'bridge', connected: true })
    })

    ws.on('message', (data) => {
      if (this.ws !== ws) return
      this.emit({ type: 'message', data: data.toString() })
    })

    ws.on('close', () => {
      if (this.ws !== ws) return
      this.ws = null
      this.emit({ type: 'bridge', connected: false })
      this.scheduleReconnect()
    })

    ws.on('error', () => {
      // safeCloseWs drops listeners, so 'close' will not fire — reconnect from here.
      this.safeCloseWs(ws)
      if (this.ws !== ws) return
      this.ws = null
      this.emit({ type: 'bridge', connected: false })
      this.scheduleReconnect()
    })
  }

  private scheduleReconnect() {
    if (!this.alive || this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.open()
    }, 2000)
  }

  private lastEmitTime = 0
  private pendingMessage: TosuSocketEvent | null = null
  private flushTimer: ReturnType<typeof setTimeout> | null = null

  /** Messages are throttled to ~10/s with a trailing flush so the newest state is never dropped. */
  private emit(event: TosuSocketEvent) {
    if (!this.window || this.window.isDestroyed()) return
    if (event.type === 'message') {
      if (!this.window.isVisible() || this.window.isMinimized()) {
        return
      }
      const wait = MESSAGE_INTERVAL_MS - (Date.now() - this.lastEmitTime)
      if (wait > 0) {
        this.pendingMessage = event
        if (!this.flushTimer) {
          this.flushTimer = setTimeout(() => {
            this.flushTimer = null
            const pending = this.pendingMessage
            this.pendingMessage = null
            if (pending) this.emit(pending)
          }, wait)
        }
        return
      }
      this.lastEmitTime = Date.now()
    }
    this.window.webContents.send('tosu:socket-event', event)
  }
}