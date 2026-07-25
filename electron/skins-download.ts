/**
 * Cancelable skin download → Skins folder → openPath(.osk).
 * Google Drive virus-scan pages, MediaFire hops, idle timeouts.
 */
import fs from 'fs'
import http from 'http'
import https from 'https'
import path from 'path'
import { app } from 'electron'
import type { ClientRequest, IncomingMessage } from 'http'
import type { SkinDownloadProgress, SkinHost } from './skins-types'
import { getOsuckSkinDetail, pickBestPackage, resolveOsuckDownload } from './skins-osuck'

const MIN_OSK_BYTES = 4_000
const REQ_TIMEOUT_MS = 45_000
const IDLE_TIMEOUT_MS = 25_000
const MAX_REDIRECTS = 10
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

export class SkinDownloadCancelledError extends Error {
  constructor() {
    super('cancelled')
    this.name = 'SkinDownloadCancelledError'
  }
}

interface ActiveSkinDownload {
  jobId: string
  cancelled: boolean
  req: ClientRequest | null
  res: IncomingMessage | null
  tempPath: string | null
  file: fs.WriteStream | null
  idleTimer: ReturnType<typeof setTimeout> | null
}

class HtmlInsteadOfFileError extends Error {
  html: string
  constructor(html: string) {
    super('HTML_INSTEAD_OF_FILE')
    this.name = 'HtmlInsteadOfFileError'
    this.html = html
  }
}

const active = new Map<string, ActiveSkinDownload>()

function safeFileName(name: string, skinId: number): string {
  const base = (name || `skin-${skinId}`)
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100)
  const withExt = base.toLowerCase().endsWith('.osk') ? base : `${base}.osk`
  return withExt || `skin-${skinId}.osk`
}

function clearIdle(job: ActiveSkinDownload) {
  if (job.idleTimer) {
    clearTimeout(job.idleTimer)
    job.idleTimer = null
  }
}

function bumpIdle(job: ActiveSkinDownload, onIdle: () => void, ms = IDLE_TIMEOUT_MS) {
  clearIdle(job)
  job.idleTimer = setTimeout(onIdle, ms)
}

function isZipMagic(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === 0x50 && buf[1] === 0x4b
}

function looksLikeHtml(buf: Buffer): boolean {
  const head = buf.subarray(0, Math.min(buf.length, 256)).toString('utf8').trimStart()
  return (
    head.startsWith('<!') ||
    head.startsWith('<html') ||
    head.startsWith('<HTML') ||
    head.includes('<!DOCTYPE')
  )
}

function extractDriveId(url: string): string | null {
  const m =
    url.match(/\/file\/d\/([^/]+)/) ||
    url.match(/[?&]id=([^&]+)/) ||
    url.match(/drive\.google\.com\/open\?id=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

function parseDriveConfirm(html: string, driveId: string): string | null {
  const href =
    html.match(/href="(https:\/\/drive\.usercontent\.google\.com\/download\?[^"]+)"/i) ||
    html.match(/href="(\/uc\?export=download[^"]+)"/i) ||
    html.match(/href="(https:\/\/drive\.google\.com\/uc\?export=download[^"]+)"/i)
  if (href?.[1]) {
    const raw = href[1].replace(/&amp;/g, '&')
    return raw.startsWith('http') ? raw : `https://drive.google.com${raw}`
  }
  const confirm =
    html.match(/confirm=([0-9A-Za-z_-]+)/)?.[1] ||
    html.match(/name="confirm"\s+value="([^"]+)"/)?.[1]
  const uuid = html.match(/name="uuid"\s+value="([^"]+)"/)?.[1]
  if (confirm) {
    let u = `https://drive.usercontent.google.com/download?id=${driveId}&export=download&confirm=${encodeURIComponent(confirm)}`
    if (uuid) u += `&uuid=${encodeURIComponent(uuid)}`
    return u
  }
  return `https://drive.usercontent.google.com/download?id=${driveId}&export=download&confirm=t`
}

function streamToFile(
  urlStr: string,
  dest: string,
  headers: Record<string, string>,
  job: ActiveSkinDownload,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    let redirects = 0

    const fail = (err: Error) => {
      clearIdle(job)
      try {
        if (fs.existsSync(dest)) fs.unlinkSync(dest)
      } catch {
        /* ignore */
      }
      reject(err)
    }

    const follow = (url: string) => {
      if (job.cancelled) {
        reject(new SkinDownloadCancelledError())
        return
      }
      const u = new URL(url)
      const lib = u.protocol === 'http:' ? http : https
      const req = lib.request(
        {
          method: 'GET',
          hostname: u.hostname,
          path: u.pathname + u.search,
          headers: {
            'User-Agent': UA,
            Accept: '*/*',
            ...headers,
            Host: u.host,
          },
          timeout: REQ_TIMEOUT_MS,
        },
        (res) => {
          job.res = res
          if (job.cancelled) {
            res.destroy()
            reject(new SkinDownloadCancelledError())
            return
          }

          const status = res.statusCode || 0
          if (status >= 300 && status < 400 && res.headers.location && redirects < MAX_REDIRECTS) {
            redirects++
            res.resume()
            follow(new URL(res.headers.location, url).href)
            return
          }
          if (status < 200 || status >= 300) {
            res.resume()
            reject(new Error(`Ошибка загрузки файла (${status})`))
            return
          }

          const ctype = String(res.headers['content-type'] || '').toLowerCase()
          const total = parseInt(String(res.headers['content-length'] || '0'), 10) || 0
          let received = 0
          const peek: Buffer[] = []
          let peeked = 0
          let mode: 'peek' | 'bin' | 'html' = 'peek'
          let file: fs.WriteStream | null = null

          const beginBinary = (seed: Buffer) => {
            mode = 'bin'
            file = fs.createWriteStream(dest)
            job.file = file
            job.tempPath = dest
            if (seed.length) {
              file.write(seed)
              received = seed.length
              if (total > 0) onProgress(Math.min(99, Math.round((received / total) * 100)))
              else onProgress(Math.min(25, 8 + Math.round(received / (256 * 1024))))
            }
          }

          const finishOk = () => {
            clearIdle(job)
            if (!file) {
              reject(new Error('Пустой ответ'))
              return
            }
            file.end(() => {
              if (job.cancelled) {
                try {
                  fs.unlinkSync(dest)
                } catch {
                  /* ignore */
                }
                reject(new SkinDownloadCancelledError())
                return
              }
              try {
                const st = fs.statSync(dest)
                if (st.size < MIN_OSK_BYTES) {
                  const head = fs.readFileSync(dest).subarray(0, 512)
                  try {
                    fs.unlinkSync(dest)
                  } catch {
                    /* ignore */
                  }
                  if (looksLikeHtml(head)) {
                    reject(new HtmlInsteadOfFileError(head.toString('utf8')))
                    return
                  }
                  reject(new Error('Файл слишком маленький'))
                  return
                }
                const magic = Buffer.alloc(4)
                const fd = fs.openSync(dest, 'r')
                fs.readSync(fd, magic, 0, 4, 0)
                fs.closeSync(fd)
                if (!isZipMagic(magic)) {
                  const head = fs.readFileSync(dest).subarray(0, 512)
                  if (looksLikeHtml(head)) {
                    const html = fs.readFileSync(dest).toString('utf8').slice(0, 200_000)
                    try {
                      fs.unlinkSync(dest)
                    } catch {
                      /* ignore */
                    }
                    reject(new HtmlInsteadOfFileError(html))
                    return
                  }
                }
              } catch (err) {
                reject(err instanceof Error ? err : new Error(String(err)))
                return
              }
              onProgress(100)
              resolve()
            })
          }

          bumpIdle(job, () => {
            res.destroy()
            fail(new Error('Нет данных от сервера (таймаут)'))
          })

          res.on('data', (chunk: Buffer) => {
            if (job.cancelled) {
              res.destroy()
              return
            }
            bumpIdle(job, () => {
              res.destroy()
              fail(new Error('Загрузка зависла — нет данных'))
            })

            if (mode === 'peek') {
              peek.push(chunk)
              peeked += chunk.length
              const seed = Buffer.concat(peek)

              if (
                (ctype.includes('text/html') || (peeked >= 32 && looksLikeHtml(seed))) &&
                !isZipMagic(seed)
              ) {
                mode = 'html'
                if (peeked > 400_000) {
                  res.destroy()
                  clearIdle(job)
                  reject(new HtmlInsteadOfFileError(seed.toString('utf8')))
                }
                return
              }

              if (
                isZipMagic(seed) ||
                peeked >= 256 ||
                (total > MIN_OSK_BYTES && !ctype.includes('text'))
              ) {
                beginBinary(seed)
              }
              return
            }

            if (mode === 'html') {
              peek.push(chunk)
              peeked += chunk.length
              if (peeked > 400_000) {
                res.destroy()
                clearIdle(job)
                reject(new HtmlInsteadOfFileError(Buffer.concat(peek).toString('utf8')))
              }
              return
            }

            received += chunk.length
            if (total > 0) onProgress(Math.min(99, Math.round((received / total) * 100)))
            else onProgress(Math.min(95, 8 + Math.round(received / (256 * 1024))))
            if (file && !file.write(chunk)) {
              res.pause()
              file.once('drain', () => res.resume())
            }
          })

          res.on('end', () => {
            if (mode === 'html' || (mode === 'peek' && peek.length && looksLikeHtml(Buffer.concat(peek)))) {
              clearIdle(job)
              reject(new HtmlInsteadOfFileError(Buffer.concat(peek).toString('utf8')))
              return
            }
            if (mode === 'peek' && peek.length) {
              beginBinary(Buffer.concat(peek))
              finishOk()
              return
            }
            if (mode === 'bin') finishOk()
            else {
              clearIdle(job)
              reject(new Error('Пустой ответ сервера'))
            }
          })

          res.on('error', (err) => {
            if (job.cancelled) reject(new SkinDownloadCancelledError())
            else fail(err)
          })
        }
      )

      job.req = req
      req.on('error', (err) => {
        clearIdle(job)
        if (job.cancelled) reject(new SkinDownloadCancelledError())
        else reject(err)
      })
      req.on('timeout', () => {
        req.destroy()
        clearIdle(job)
        reject(new Error('Превышено время ожидания загрузки'))
      })
      req.end()
    }

    follow(urlStr)
  })
}

async function downloadGoogleDrive(
  driveUrlOrId: string,
  dest: string,
  job: ActiveSkinDownload,
  onProgress: (pct: number) => void
): Promise<void> {
  const driveId = extractDriveId(driveUrlOrId) || driveUrlOrId
  if (!driveId || /[/:?]/.test(driveId) && !extractDriveId(driveUrlOrId)) {
    // if raw id is fine; if URL failed extraction, throw
    if (!/^[a-zA-Z0-9_-]+$/.test(driveId)) throw new Error('Некорректный Google Drive id')
  }
  const id = extractDriveId(driveUrlOrId) || driveId

  const candidates = [
    `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${id}&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${id}`,
  ]

  let lastErr: Error | null = null
  for (const url of candidates) {
    if (job.cancelled) throw new SkinDownloadCancelledError()
    try {
      await streamToFile(url, dest, { Referer: 'https://drive.google.com/', Accept: '*/*' }, job, onProgress)
      return
    } catch (err) {
      if (err instanceof HtmlInsteadOfFileError) {
        const next = parseDriveConfirm(err.html, id)
        if (next && next !== url) {
          try {
            await streamToFile(
              next,
              dest,
              { Referer: 'https://drive.google.com/', Accept: '*/*' },
              job,
              onProgress
            )
            return
          } catch (err2) {
            lastErr = err2 instanceof Error ? err2 : new Error(String(err2))
            continue
          }
        }
      }
      lastErr = err instanceof Error ? err : new Error(String(err))
    }
  }
  throw lastErr || new Error('Google Drive: не удалось скачать файл')
}

function requestBuffer(
  urlStr: string,
  headers: Record<string, string>,
  job: ActiveSkinDownload,
  maxBytes = 1_500_000
): Promise<{ status: number; headers: IncomingMessage['headers']; body: Buffer; url: string }> {
  return new Promise((resolve, reject) => {
    if (job.cancelled) {
      reject(new SkinDownloadCancelledError())
      return
    }
    let redirects = 0
    const go = (url: string) => {
      const u = new URL(url)
      const lib = u.protocol === 'http:' ? http : https
      const req = lib.request(
        {
          method: 'GET',
          hostname: u.hostname,
          path: u.pathname + u.search,
          headers: { 'User-Agent': UA, ...headers, Host: u.host },
          timeout: REQ_TIMEOUT_MS,
        },
        (res) => {
          job.res = res
          const status = res.statusCode || 0
          if (status >= 300 && status < 400 && res.headers.location && redirects < MAX_REDIRECTS) {
            redirects++
            res.resume()
            go(new URL(res.headers.location, url).href)
            return
          }
          const chunks: Buffer[] = []
          let size = 0
          bumpIdle(job, () => {
            res.destroy()
            reject(new Error('Нет данных (таймаут)'))
          })
          res.on('data', (c: Buffer) => {
            bumpIdle(job, () => {
              res.destroy()
              reject(new Error('Загрузка зависла'))
            })
            if (size < maxBytes) chunks.push(c)
            size += c.length
          })
          res.on('end', () => {
            clearIdle(job)
            resolve({ status, headers: res.headers, body: Buffer.concat(chunks), url })
          })
          res.on('error', (err) => {
            clearIdle(job)
            reject(err)
          })
        }
      )
      job.req = req
      req.on('error', reject)
      req.on('timeout', () => {
        req.destroy()
        reject(new Error('Превышено время ожидания'))
      })
      req.end()
    }
    go(urlStr)
  })
}

async function resolveMediaFireDirect(
  pageUrl: string,
  headers: Record<string, string>,
  job: ActiveSkinDownload
): Promise<string> {
  const res = await requestBuffer(pageUrl, headers, job)
  if (res.status >= 300 && res.status < 400 && res.headers.location) {
    return new URL(String(res.headers.location), pageUrl).href
  }
  const html = res.body.toString('utf8')
  const m =
    html.match(/href="(https?:\/\/download\d*\.mediafire\.com\/[^"]+)"/i) ||
    html.match(/href="(https?:\/\/[^"]+\.mediafire\.com\/[^"]+)"/i) ||
    html.match(/aria-label="Download file"[^>]*href="([^"]+)"/i) ||
    html.match(/id="downloadButton"[^>]*href="([^"]+)"/i) ||
    html.match(/href="(https?:\/\/[^"]+)"[^>]*id="downloadButton"/i)
  if (m?.[1]) return m[1].replace(/&amp;/g, '&')
  if (res.status === 200 && String(res.headers['content-type'] || '').includes('octet-stream')) {
    return pageUrl
  }
  throw new Error('Не удалось извлечь прямую ссылку MediaFire')
}

export function cancelSkinDownload(jobId: string): boolean {
  const job = active.get(jobId)
  if (!job) return false
  job.cancelled = true
  clearIdle(job)
  try {
    job.req?.destroy()
  } catch {
    /* ignore */
  }
  try {
    job.res?.destroy()
  } catch {
    /* ignore */
  }
  try {
    job.file?.destroy()
  } catch {
    /* ignore */
  }
  if (job.tempPath) {
    try {
      if (fs.existsSync(job.tempPath)) fs.unlinkSync(job.tempPath)
    } catch {
      /* ignore */
    }
  }
  return true
}

export async function downloadOsuckSkin(
  skinId: number,
  skinsPath: string,
  onProgress: (p: SkinDownloadProgress) => void,
  opts?: {
    packageChecksum?: string
    variantIndex?: number
    preferredHost?: SkinHost
  }
): Promise<{ filePath: string; source: string; openExternal?: string }> {
  const id = Math.floor(Number(skinId) || 0)
  if (!id) throw new Error('Некорректный id скина')
  if (!skinsPath || !fs.existsSync(skinsPath)) {
    throw new Error('Папка Skins не найдена — укажите путь в Настройках')
  }

  const jobId = `skin-${id}`
  if (active.has(jobId)) throw new Error('Этот скин уже скачивается')

  const job: ActiveSkinDownload = {
    jobId,
    cancelled: false,
    req: null,
    res: null,
    tempPath: null,
    file: null,
    idleTimer: null,
  }
  active.set(jobId, job)

  try {
    onProgress({ jobId, skinId: id, phase: 'resolving', progress: 3, message: 'Каталог…' })
    const detail = await getOsuckSkinDetail(id)
    if (job.cancelled) throw new SkinDownloadCancelledError()

    let pack = pickBestPackage(detail)
    if (opts?.packageChecksum) {
      const found = detail.packages.find(
        (p) =>
          p.checksum === opts.packageChecksum &&
          (opts.variantIndex == null || p.variantIndex === opts.variantIndex)
      )
      if (found) pack = found
    }
    if (!pack) throw new Error('У этого скина нет доступных файлов')

    const fileName = safeFileName(
      pack.kind === 'osk' ? detail.name : `${detail.name}-${pack.kind}`,
      id
    )

    onProgress({
      jobId,
      skinId: id,
      phase: 'resolving',
      progress: 12,
      message: `Ссылка (${pack.hosts.filter((h) => h !== 'mega').join('/') || pack.hosts.join('/')})…`,
    })

    const resolved = await resolveOsuckDownload({
      skinId: id,
      checksum: pack.checksum,
      variantIndex: pack.variantIndex,
      preferredHost: opts?.preferredHost,
      hosts: pack.hosts,
      fileName,
    })
    if (job.cancelled) throw new SkinDownloadCancelledError()

    if (resolved.openExternalOnly) {
      onProgress({
        jobId,
        skinId: id,
        phase: 'done',
        progress: 100,
        message: 'Откройте ссылку в браузере (MEGA)',
      })
      return { filePath: '', source: resolved.host, openExternal: resolved.url }
    }

    let downloadUrl = resolved.url
    const headers = { ...resolved.headers }

    if (resolved.host === 'mediafire' && /mediafire\.com/i.test(downloadUrl)) {
      onProgress({ jobId, skinId: id, phase: 'resolving', progress: 16, message: 'MediaFire…' })
      downloadUrl = await resolveMediaFireDirect(downloadUrl, headers, job)
    }

    const tempPath = path.join(app.getPath('temp'), `tosu-gui-skin-${id}-${Date.now()}.osk`)
    job.tempPath = tempPath

    onProgress({
      jobId,
      skinId: id,
      phase: 'downloading',
      progress: 20,
      message: `Скачивание (${resolved.host})…`,
    })

    const mapPct = (pct: number) => {
      if (job.cancelled) return
      onProgress({
        jobId,
        skinId: id,
        phase: 'downloading',
        progress: 20 + Math.round((pct / 100) * 76),
        message: `Скачивание (${resolved.host})…`,
      })
    }

    if (resolved.host === 'google') {
      await downloadGoogleDrive(downloadUrl, tempPath, job, mapPct)
    } else {
      await streamToFile(downloadUrl, tempPath, headers, job, mapPct)
    }

    if (job.cancelled) throw new SkinDownloadCancelledError()

    onProgress({ jobId, skinId: id, phase: 'installing', progress: 97, message: 'В Skins…' })
    const destPath = path.join(skinsPath, fileName)
    let finalPath = destPath
    try {
      if (fs.existsSync(destPath)) {
        try {
          fs.unlinkSync(destPath)
        } catch {
          finalPath = path.join(skinsPath, `${id}-${Date.now()}.osk`)
        }
      }
      try {
        fs.renameSync(tempPath, finalPath)
      } catch {
        fs.copyFileSync(tempPath, finalPath)
        try {
          fs.unlinkSync(tempPath)
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
      } catch {
        /* ignore */
      }
      throw err
    }

    job.tempPath = null
    onProgress({
      jobId,
      skinId: id,
      phase: 'done',
      progress: 100,
      message: 'Готово',
      filePath: finalPath,
    })
    return { filePath: finalPath, source: resolved.host }
  } catch (err) {
    clearIdle(job)
    if (err instanceof SkinDownloadCancelledError || job.cancelled) {
      onProgress({ jobId, skinId: id, phase: 'cancelled', progress: 0, message: 'Отменено' })
      throw new SkinDownloadCancelledError()
    }
    const message =
      err instanceof HtmlInsteadOfFileError ||
      (err instanceof Error && err.message === 'HTML_INSTEAD_OF_FILE')
        ? 'Сервер отдал страницу вместо файла — попробуйте позже'
        : err instanceof Error
          ? err.message
          : String(err)
    onProgress({ jobId, skinId: id, phase: 'error', progress: 0, error: message })
    throw new Error(message)
  } finally {
    clearIdle(job)
    active.delete(jobId)
  }
}

export async function importSkinFile(
  sourcePath: string,
  skinsPath: string
): Promise<{ filePath: string }> {
  if (!sourcePath || !fs.existsSync(sourcePath)) throw new Error('Файл не найден')
  if (!skinsPath || !fs.existsSync(skinsPath)) {
    throw new Error('Папка Skins не найдена — укажите путь в Настройках')
  }
  const base = path.basename(sourcePath)
  let destName = base
  if (/\.zip$/i.test(destName)) destName = destName.replace(/\.zip$/i, '.osk')
  if (!/\.osk$/i.test(destName)) destName = `${destName}.osk`
  destName = safeFileName(destName, Date.now() % 1_000_000)
  const dest = path.join(skinsPath, destName)
  fs.copyFileSync(sourcePath, dest)
  return { filePath: dest }
}

export async function downloadSkinFromUrl(
  url: string,
  skinsPath: string,
  onProgress: (p: SkinDownloadProgress) => void,
  suggestedName?: string
): Promise<{ filePath: string }> {
  if (!skinsPath || !fs.existsSync(skinsPath)) {
    throw new Error('Папка Skins не найдена — укажите путь в Настройках')
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Некорректный URL')
  }
  if (!/^https?:$/i.test(parsed.protocol)) throw new Error('Разрешены только http(s) ссылки')

  const jobId = `url-${Date.now()}`
  const job: ActiveSkinDownload = {
    jobId,
    cancelled: false,
    req: null,
    res: null,
    tempPath: null,
    file: null,
    idleTimer: null,
  }
  active.set(jobId, job)

  const name = safeFileName(suggestedName || path.basename(parsed.pathname) || 'skin', Date.now() % 1e6)
  const tempPath = path.join(app.getPath('temp'), `tosu-gui-skin-url-${Date.now()}.osk`)

  try {
    onProgress({ jobId, skinId: 0, phase: 'downloading', progress: 5, message: 'Скачивание…' })
    const driveId = extractDriveId(url)
    if (driveId && /drive\.google|drive\.usercontent/i.test(url)) {
      await downloadGoogleDrive(driveId, tempPath, job, (pct) =>
        onProgress({ jobId, skinId: 0, phase: 'downloading', progress: pct, message: 'Скачивание…' })
      )
    } else {
      await streamToFile(url, tempPath, { Accept: '*/*' }, job, (pct) =>
        onProgress({ jobId, skinId: 0, phase: 'downloading', progress: pct, message: 'Скачивание…' })
      )
    }
    onProgress({ jobId, skinId: 0, phase: 'installing', progress: 97, message: 'В Skins…' })
    const dest = path.join(skinsPath, name)
    let finalPath = dest
    if (fs.existsSync(dest)) finalPath = path.join(skinsPath, `${Date.now()}-${name}`)
    try {
      fs.renameSync(tempPath, finalPath)
    } catch {
      fs.copyFileSync(tempPath, finalPath)
      try {
        fs.unlinkSync(tempPath)
      } catch {
        /* ignore */
      }
    }
    onProgress({
      jobId,
      skinId: 0,
      phase: 'done',
      progress: 100,
      message: 'Готово',
      filePath: finalPath,
    })
    return { filePath: finalPath }
  } catch (err) {
    clearIdle(job)
    if (err instanceof SkinDownloadCancelledError || job.cancelled) {
      onProgress({ jobId, skinId: 0, phase: 'cancelled', progress: 0, message: 'Отменено' })
      throw new SkinDownloadCancelledError()
    }
    const message = err instanceof Error ? err.message : String(err)
    onProgress({ jobId, skinId: 0, phase: 'error', progress: 0, error: message })
    throw err instanceof Error ? err : new Error(message)
  } finally {
    clearIdle(job)
    active.delete(jobId)
  }
}
