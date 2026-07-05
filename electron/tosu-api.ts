import fs from 'fs'
import http from 'http'
import https from 'https'
import path from 'path'

export interface CounterAsset {
  type: 'image' | 'gif' | string
  url: string
}

export interface TosuCounter {
  folderName: string
  name: string
  version: string
  author: string
  resolution: (number | string)[]
  authorlinks: string[]
  settings: CounterSetting[]
  assets?: CounterAsset[]
  downloadLink?: string
  _downloaded?: boolean
  _updatable?: boolean
  _settings?: boolean
}

export interface CounterSetting {
  uniqueID: string
  name: string
  description?: string
  type: 'checkbox' | 'text' | 'number' | 'color' | 'select' | 'textarea'
  value: string | number | boolean
  options?: { name: string; value: string }[]
}

export interface TosuAppSettings {
  ENABLE_AUTOUPDATE: boolean
  OPEN_DASHBOARD_ON_STARTUP: boolean
  CALCULATE_PP: boolean
  READ_MANIA_SCROLL_SPEED: boolean
  ENABLE_KEY_OVERLAY: boolean
  POLL_RATE: number
  PRECISE_DATA_POLL_RATE: number
  ENABLE_INGAME_OVERLAY: boolean
  INGAME_OVERLAY_KEYBIND: string
  INGAME_OVERLAY_MAX_FPS: number
  INGAME_OVERLAY_DISABLE_ANTIALIASING: boolean
  SERVER_IP: string
  SERVER_PORT: number
}

const DEFAULT_SETTINGS: TosuAppSettings = {
  ENABLE_AUTOUPDATE: true,
  OPEN_DASHBOARD_ON_STARTUP: false,
  CALCULATE_PP: true,
  READ_MANIA_SCROLL_SPEED: true,
  ENABLE_KEY_OVERLAY: true,
  POLL_RATE: 500,
  PRECISE_DATA_POLL_RATE: 50,
  ENABLE_INGAME_OVERLAY: false,
  INGAME_OVERLAY_KEYBIND: 'Control + Shift + Space',
  INGAME_OVERLAY_MAX_FPS: 120,
  INGAME_OVERLAY_DISABLE_ANTIALIASING: false,
  SERVER_IP: '0.0.0.0',
  SERVER_PORT: 24050,
}

export class TosuApi {
  private baseUrl = 'http://127.0.0.1:24050'
  private envPath: string | null = null

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/$/, '')
  }

  setEnvPath(envPath: string) {
    this.envPath = envPath
  }

  private readRawEnv(): Record<string, string> {
    if (!this.envPath) return {}
    try {
      const fs = require('fs') as typeof import('fs')
      if (!fs.existsSync(this.envPath)) return {}
      const content = fs.readFileSync(this.envPath, 'utf8')
      const overrides: Record<string, string> = {}
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const m = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
        if (m) overrides[m[1]] = m[2].trim()
      }
      return overrides
    } catch {
      return {}
    }
  }

  private mapEnvToSettings(raw: Record<string, string>): Partial<TosuAppSettings> {
    if (Object.keys(raw).length === 0) return {}
    return {
      ENABLE_AUTOUPDATE: raw.ENABLE_AUTOUPDATE === 'true',
      OPEN_DASHBOARD_ON_STARTUP: raw.OPEN_DASHBOARD_ON_STARTUP === 'true',
      CALCULATE_PP: raw.CALCULATE_PP !== 'false',
      READ_MANIA_SCROLL_SPEED: raw.READ_MANIA_SCROLL_SPEED !== 'false',
      ENABLE_KEY_OVERLAY: raw.ENABLE_KEY_OVERLAY !== 'false',
      POLL_RATE: parseInt(raw.POLL_RATE || String(DEFAULT_SETTINGS.POLL_RATE), 10),
      PRECISE_DATA_POLL_RATE: parseInt(
        raw.PRECISE_DATA_POLL_RATE || String(DEFAULT_SETTINGS.PRECISE_DATA_POLL_RATE),
        10
      ),
      ENABLE_INGAME_OVERLAY: raw.ENABLE_INGAME_OVERLAY === 'true',
      INGAME_OVERLAY_KEYBIND: raw.INGAME_OVERLAY_KEYBIND || DEFAULT_SETTINGS.INGAME_OVERLAY_KEYBIND,
      INGAME_OVERLAY_MAX_FPS: parseInt(
        raw.INGAME_OVERLAY_MAX_FPS || String(DEFAULT_SETTINGS.INGAME_OVERLAY_MAX_FPS),
        10
      ),
      SERVER_IP: raw.SERVER_IP || DEFAULT_SETTINGS.SERVER_IP,
      SERVER_PORT: parseInt(raw.SERVER_PORT || String(DEFAULT_SETTINGS.SERVER_PORT), 10),
    }
  }

  settingsToEnvPayload(settings: TosuAppSettings): Record<string, string> {
    return {
      ENABLE_AUTOUPDATE: String(settings.ENABLE_AUTOUPDATE),
      OPEN_DASHBOARD_ON_STARTUP: String(settings.OPEN_DASHBOARD_ON_STARTUP),
      CALCULATE_PP: String(settings.CALCULATE_PP),
      READ_MANIA_SCROLL_SPEED: String(settings.READ_MANIA_SCROLL_SPEED),
      ENABLE_KEY_OVERLAY: String(settings.ENABLE_KEY_OVERLAY),
      POLL_RATE: String(settings.POLL_RATE),
      PRECISE_DATA_POLL_RATE: String(settings.PRECISE_DATA_POLL_RATE),
      ENABLE_INGAME_OVERLAY: String(settings.ENABLE_INGAME_OVERLAY),
      INGAME_OVERLAY_KEYBIND: settings.INGAME_OVERLAY_KEYBIND,
      INGAME_OVERLAY_MAX_FPS: String(settings.INGAME_OVERLAY_MAX_FPS),
      SERVER_IP: settings.SERVER_IP,
      SERVER_PORT: String(settings.SERVER_PORT),
    }
  }

  private parseJsonResponse<T>(body: string, statusCode?: number): T {
    const data = (body ? JSON.parse(body) : {}) as T
    if (data && typeof data === 'object' && 'error' in data && typeof (data as { error: string }).error === 'string') {
      throw new Error((data as { error: string }).error)
    }
    if (statusCode && statusCode >= 400) {
      throw new Error(`HTTP ${statusCode}`)
    }
    return data
  }

  /** Raw HTTP path request — avoids fetch re-encoding download URLs that contain spaces. */
  private fetchRawPath<T>(path: string, timeoutMs = 120_000): Promise<T> {
    const base = new URL(this.baseUrl)
    const isHttps = base.protocol === 'https:'
    const lib = isHttps ? https : http

    return new Promise((resolve, reject) => {
      const req = lib.request(
        {
          hostname: base.hostname,
          port: base.port || (isHttps ? 443 : 80),
          path,
          method: 'GET',
          headers: { Accept: 'application/json' },
        },
        (res) => {
          let body = ''
          res.on('data', (chunk) => {
            body += chunk.toString()
          })
          res.on('end', () => {
            try {
              resolve(this.parseJsonResponse<T>(body, res.statusCode))
            } catch (err) {
              reject(err)
            }
          })
        }
      )

      req.on('error', reject)
      req.setTimeout(timeoutMs, () => {
        req.destroy()
        reject(new Error('Превышено время ожидания загрузки'))
      })
      req.end()
    })
  }

  private async fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, init)
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || `HTTP ${res.status}`)
    }
    const text = await res.text()
    return this.parseJsonResponse<T>(text, res.status)
  }

  private getStaticDir() {
    if (!this.envPath) return null
    return path.join(path.dirname(this.envPath), 'static')
  }

  private parseCountersFromHtml(html: string): TosuCounter[] {
    const marker = 'window.COUNTERS'
    const idx = html.indexOf(marker)
    if (idx === -1) return []

    const start = html.indexOf('[', idx)
    if (start === -1) return []

    let depth = 0
    for (let i = start; i < html.length; i++) {
      const ch = html[i]
      if (ch === '[') depth++
      else if (ch === ']') {
        depth--
        if (depth === 0) {
          return JSON.parse(html.slice(start, i + 1)) as TosuCounter[]
        }
      }
    }

    return []
  }

  private findLocalPreviewAsset(folderPath: string, folderName: string): CounterAsset | undefined {
    const candidates = ['preview.png', 'preview.jpg', 'thumbnail.png', 'assets/preview.png']
    for (const file of candidates) {
      if (!fs.existsSync(path.join(folderPath, file))) continue
      const urlPath = file.split('/').map(encodeURIComponent).join('/')
      return {
        type: 'image',
        url: `${this.baseUrl}/${encodeURIComponent(folderName)}/${urlPath}`,
      }
    }
  }

  private enrichCounterAssets(counter: TosuCounter): TosuCounter {
    if (counter.assets?.some((a) => a.type === 'image')) return counter

    const staticDir = this.getStaticDir()
    if (!staticDir) return counter

    const folderPath = path.join(staticDir, counter.folderName)
    const preview = this.findLocalPreviewAsset(folderPath, counter.folderName)
    if (!preview) return counter

    return { ...counter, assets: [preview] }
  }

  private scanLocalCounters(): TosuCounter[] {
    const staticDir = this.getStaticDir()
    if (!staticDir || !fs.existsSync(staticDir)) return []

    const counters: TosuCounter[] = []

    for (const entry of fs.readdirSync(staticDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue

      const folderName = entry.name
      const folderPath = path.join(staticDir, folderName)
      const metaPath = path.join(folderPath, 'metadata.txt')

      let name = folderName
      let version = '0.0.0'
      let author = 'Unknown'
      let resolution: (number | string)[] = []
      const authorlinks: string[] = []

      if (fs.existsSync(metaPath)) {
        const meta = fs.readFileSync(metaPath, 'utf8')
        for (const line of meta.split('\n')) {
          const [rawKey, ...rest] = line.split(':')
          if (!rawKey || rest.length === 0) continue
          const key = rawKey.trim().toLowerCase()
          const value = rest.join(':').trim()
          if (key === 'name') name = value
          else if (key === 'version') version = value
          else if (key === 'author') author = value
          else if (key === 'resolution') {
            const [w, h] = value.toLowerCase().split('x')
            if (w && h) resolution = [parseInt(w, 10), parseInt(h, 10)]
          } else if (key === 'authorlinks' && value) authorlinks.push(value)
        }
      } else {
        const byIdx = folderName.lastIndexOf(' by ')
        if (byIdx !== -1) {
          name = folderName.slice(0, byIdx)
          author = folderName.slice(byIdx + 4)
        }
      }

      const preview = this.findLocalPreviewAsset(folderPath, folderName)

      counters.push({
        folderName,
        name,
        version,
        author,
        resolution,
        authorlinks,
        settings: [],
        assets: preview ? [preview] : undefined,
      })
    }

    return counters.sort((a, b) => a.name.localeCompare(b.name))
  }

  async getCounters(): Promise<TosuCounter[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/ingame`)
      if (res.ok) {
        const html = await res.text()
        const parsed = this.parseCountersFromHtml(html)
        if (parsed.length > 0) {
          return parsed.map((c) => this.enrichCounterAssets(c))
        }
      }
    } catch (err) {
      console.warn('[tosu] getCounters api failed:', err)
    }

    return this.scanLocalCounters()
  }

  async getSettings(): Promise<TosuAppSettings> {
    const rawEnv = this.readRawEnv()
    const envSettings = this.mapEnvToSettings(rawEnv)
    try {
      const res = await fetch(`${this.baseUrl}/settings`)
      const html = await res.text()
      return { ...DEFAULT_SETTINGS, ...this.parseSettingsFromHtml(html), ...envSettings }
    } catch {
      return { ...DEFAULT_SETTINGS, ...envSettings }
    }
  }

  private parseSettingsFromHtml(html: string): TosuAppSettings {
    const settings = { ...DEFAULT_SETTINGS }

    const switches = html.matchAll(/data-id=['"]([^'"]+)['"][^>]*class=['"][^'"]*switch-thumb[^'"]*['"][^>]*(checked)?/gi)
    for (const m of switches) {
      const id = m[1] as keyof TosuAppSettings
      if (id in settings) {
        ;(settings as Record<string, unknown>)[id] = !!m[2]
      }
    }

    const checkboxes = html.matchAll(/id=['"]([A-Z_]+)['"][^>]*class=['"][^'"]*switch-thumb[^'"]*['"][^>]*(checked)?/gi)
    for (const m of checkboxes) {
      const id = m[1] as keyof TosuAppSettings
      if (id in settings) {
        ;(settings as Record<string, unknown>)[id] = !!m[2]
      }
    }

    const checkboxInputs = html.matchAll(/<input[^>]*\bid=['"]([A-Z_]+)['"][^>]*>/gi)
    for (const m of checkboxInputs) {
      const tag = m[0]
      if (!/type=['"]checkbox['"]/i.test(tag)) continue
      const id = m[1] as keyof TosuAppSettings
      if (id in settings) {
        ;(settings as Record<string, unknown>)[id] = /\bchecked\b/i.test(tag)
      }
    }

    const numbers = html.matchAll(/data-id=['"]([A-Z_]+)['"][^>]*value=['"](\d+)['"]/gi)
    for (const m of numbers) {
      const id = m[1] as keyof TosuAppSettings
      if (id in settings) {
        ;(settings as Record<string, unknown>)[id] = parseInt(m[2], 10)
      }
    }

    const texts = html.matchAll(/data-id=['"]([A-Z_]+)['"][^>]*value=['"]([^'"]*)['"]/gi)
    for (const m of texts) {
      const id = m[1] as keyof TosuAppSettings
      if (typeof settings[id] === 'string') {
        ;(settings as Record<string, unknown>)[id] = m[2]
      }
      if (id === 'INGAME_OVERLAY_MAX_FPS') {
        ;(settings as Record<string, unknown>)[id] = parseInt(m[2], 10)
      }
    }

    return settings
  }

  private writeEnvFile(updates: Record<string, string>) {
    if (!this.envPath) {
      throw new Error('Путь к tosu.env не настроен')
    }
    const fs = require('fs') as typeof import('fs')
    let content = ''
    if (fs.existsSync(this.envPath)) {
      content = fs.readFileSync(this.envPath, 'utf8')
    }
    for (const [key, value] of Object.entries(updates)) {
      const regex = new RegExp(`^${key}=.*$`, 'm')
      if (regex.test(content)) {
        content = content.replace(regex, `${key}=${value}`)
      } else {
        content += `${content.endsWith('\n') || content === '' ? '' : '\n'}${key}=${value}\n`
      }
    }
    fs.writeFileSync(this.envPath, content, 'utf8')
  }

  async saveSettings(updates: Record<string, string>) {
    const current = await this.getSettings()
    const mergedSettings: TosuAppSettings = {
      ...current,
      ...this.mapEnvToSettings(updates),
    }

    for (const [key, value] of Object.entries(updates)) {
      if (key in DEFAULT_SETTINGS) {
        const typedKey = key as keyof TosuAppSettings
        if (typeof DEFAULT_SETTINGS[typedKey] === 'boolean') {
          ;(mergedSettings as unknown as Record<string, unknown>)[typedKey] = value === 'true'
        } else if (typeof DEFAULT_SETTINGS[typedKey] === 'number') {
          ;(mergedSettings as unknown as Record<string, unknown>)[typedKey] = parseInt(value, 10)
        } else {
          ;(mergedSettings as unknown as Record<string, unknown>)[typedKey] = value
        }
      }
    }

    const payload = {
      ...this.readRawEnv(),
      ...this.settingsToEnvPayload(mergedSettings),
      ...updates,
    }

    this.writeEnvFile(payload)

    try {
      return await this.fetchJson<{ status: string }>('/api/settingsSave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
    } catch {
      return { status: 'env-saved' }
    }
  }

  async getCounterSettings(name: string): Promise<CounterSetting[]> {
    return this.fetchJson<CounterSetting[]>(`/api/counters/settings/${encodeURIComponent(name)}`)
  }

  async saveCounterSettings(name: string, settings: unknown[]) {
    return this.fetchJson<{ result: string }>(
      `/api/counters/settings/${encodeURIComponent(name)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      }
    )
  }

  async deleteCounter(name: string) {
    return this.fetchJson<{ status: string }>(
      `/api/counters/delete/${encodeURIComponent(name)}`
    )
  }

  async openCounterFolder(name: string) {
    return this.fetchJson<{ status: string } | { error: string }>(
      `/api/counters/open/${encodeURIComponent(name)}`
    )
  }

  async downloadCounter(url: string, name: string, update = false) {
    const params = new URLSearchParams({ name })
    if (update) params.set('update', 'true')
    // Spaces must be escaped for Node http, but :// must stay raw for tosu
    const encodedUrl = encodeURI(url)
    const path = `/api/counters/download/${encodedUrl}?${params.toString()}`
    const result = await this.fetchRawPath<{ status?: string; error?: string }>(path)

    const counters = await this.getCounters()
    const normalized = name.toLowerCase()
    const installed = counters.some((c) => c.folderName.toLowerCase() === normalized)
    if (!installed) {
      const message =
        (typeof result?.error === 'string' && result.error) ||
        (typeof result?.status === 'string' && result.status !== 'ok' ? result.status : '') ||
        'Не удалось загрузить счётчик'
      throw new Error(message)
    }

    return result
  }

  async searchAvailableCounters(query: string): Promise<TosuCounter[]> {
    try {
      const res = await fetch(`https://tosu.app/api.json`)
      const all: TosuCounter[] = await res.json()
      const local = await this.getCounters()
      const localNames = new Set(local.map((c) => `${c.name}:${c.author}`))

      const q = query.toLowerCase().trim()
      return all
        .filter((c) => {
          if (!q) return true
          return (
            c.name.toLowerCase().includes(q) ||
            c.author.toLowerCase().includes(q)
          )
        })
        .map((c) => ({
          ...c,
          folderName: c.folderName ?? `${c.name} by ${c.author}`,
          settings: c.settings ?? [],
          _downloaded: localNames.has(`${c.name}:${c.author}`),
          _updatable: false,
        }))
    } catch {
      return []
    }
  }
}