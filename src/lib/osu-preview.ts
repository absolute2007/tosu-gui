/**
 * osu!standard beatmap preview — authentic gameplay renderer using vv_idke_trail skin assets.
 * Circles, sliders, reverse arrows, approach circles, hit bursts, cursor trail, hitsounds.
 */

export type Pt = { x: number; y: number }

export type PreviewObject =
  | {
      kind: 'circle'
      x: number
      y: number
      t: number
      hitSound: number
      comboIndex: number
      comboNumber: number
      color: string
    }
  | {
      kind: 'slider'
      x: number
      y: number
      t: number
      endTime: number
      slides: number
      path: Pt[]
      pathLen: number
      cumLens: number[]
      hitSound: number
      comboIndex: number
      comboNumber: number
      color: string
    }
  | {
      kind: 'spinner'
      t: number
      endTime: number
    }

export interface ParsedBeatmap {
  previewTime: number
  ar: number
  cs: number
  mode: number
  objects: PreviewObject[]
}

export interface JudgmentPop {
  x: number
  y: number
  t: number
  type: '300' | '100' | '50' | '0'
}

/** Mutable runtime for hitsounds + cursor + judgments between frames */
export interface PreviewRuntime {
  fired: Set<string>
  cursor: Pt
  trail: { x: number; y: number; t: number }[]
  volume: number
  audio: AudioContext | null
  lastT: number
  judgments: JudgmentPop[]
  /**
   * Music clock when the track plays through `audio` (Web Audio):
   * map time `mapStartMs` is heard at context time `ctxStart`.
   * Hitsounds are then scheduled on the same clock, so they cannot drift.
   */
  music: { ctxStart: number; mapStartMs: number } | null
}

export const IDKE_COMBO_COLORS = [
  'rgb(26, 116, 242)',   // Combo1: Blue
  'rgb(164, 32, 240)',  // Combo2: Purple
  'rgb(37, 185, 239)',  // Combo3: Cyan
  'rgb(23, 209, 116)',  // Combo4: Green
  'rgb(255, 75, 255)',  // Combo5: Pink
]

const PLAY_W = 512
const PLAY_H = 384

export function approachMs(ar: number): number {
  if (ar < 5) return 1800 - ar * 120
  return 1200 - (ar - 5) * 150
}

export function circleRadius(cs: number): number {
  return Math.max(8, 54.4 - 4.48 * cs)
}

export function createPreviewRuntime(volume = 0.65): PreviewRuntime {
  return {
    fired: new Set(),
    cursor: { x: PLAY_W / 2, y: PLAY_H / 2 },
    trail: [],
    volume: Math.min(1, Math.max(0, volume)),
    audio: null,
    lastT: -1,
    judgments: [],
    music: null,
  }
}

export function resetPreviewRuntime(rt: PreviewRuntime, volume?: number) {
  rt.fired.clear()
  rt.cursor = { x: PLAY_W / 2, y: PLAY_H / 2 }
  rt.trail = []
  rt.lastT = -1
  rt.judgments = []
  rt.music = null
  if (volume != null) rt.volume = Math.min(1, Math.max(0, volume))
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function lerp(a: Pt, b: Pt, t: number): Pt {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function clamp(v: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, v))
}

function pathMetrics(path: Pt[]): { pathLen: number; cumLens: number[] } {
  const cumLens = [0]
  let pathLen = 0
  for (let i = 1; i < path.length; i++) {
    pathLen += dist(path[i - 1], path[i])
    cumLens.push(pathLen)
  }
  return { pathLen, cumLens }
}

export function pointAlongPath(path: Pt[], cumLens: number[], pathLen: number, d: number): Pt {
  if (!path.length) return { x: PLAY_W / 2, y: PLAY_H / 2 }
  if (path.length === 1 || pathLen <= 0) return path[0]
  const target = Math.min(pathLen, Math.max(0, d))
  let i = 1
  while (i < cumLens.length && cumLens[i] < target) i++
  const a = path[i - 1]
  const b = path[Math.min(i, path.length - 1)]
  const segStart = cumLens[i - 1]
  const segEnd = cumLens[Math.min(i, cumLens.length - 1)]
  const seg = segEnd - segStart || 1
  return lerp(a, b, (target - segStart) / seg)
}

function sampleLinear(points: Pt[], stepsPerSeg = 10): Pt[] {
  if (points.length < 2) return points.slice()
  const out: Pt[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    for (let s = 1; s <= stepsPerSeg; s++) {
      out.push(lerp(points[i - 1], points[i], s / stepsPerSeg))
    }
  }
  return out
}

function sampleBezierSegment(ctrl: Pt[], steps: number): Pt[] {
  if (ctrl.length === 0) return []
  if (ctrl.length === 1) return [ctrl[0]]
  if (ctrl.length === 2) return sampleLinear(ctrl, steps)
  const out: Pt[] = []
  for (let s = 0; s <= steps; s++) {
    let pts = ctrl.slice()
    const t = s / steps
    while (pts.length > 1) {
      const next: Pt[] = []
      for (let i = 0; i < pts.length - 1; i++) {
        next.push(lerp(pts[i], pts[i + 1], t))
      }
      pts = next
    }
    out.push(pts[0])
  }
  return out
}

/** Enough samples that each step is ~2 osu!px along the control polygon */
function bezierSteps(ctrl: Pt[]): number {
  let len = 0
  for (let i = 1; i < ctrl.length; i++) len += dist(ctrl[i - 1], ctrl[i])
  return Math.max(16, Math.min(600, Math.ceil(len / 2)))
}

function sampleBezier(points: Pt[]): Pt[] {
  if (points.length < 3) return sampleLinear(points, 20)
  const out: Pt[] = []
  let segStart = 0
  for (let i = 0; i < points.length - 1; i++) {
    if (i > segStart && points[i].x === points[i + 1].x && points[i].y === points[i + 1].y) {
      const seg = points.slice(segStart, i + 1)
      const sampled = sampleBezierSegment(seg, bezierSteps(seg))
      if (out.length) sampled.shift()
      out.push(...sampled)
      segStart = i + 1
    }
  }
  if (segStart < points.length) {
    const seg = points.slice(segStart)
    const sampled = sampleBezierSegment(seg, bezierSteps(seg))
    if (out.length && sampled.length) sampled.shift()
    out.push(...sampled)
  }
  return out.length ? out : sampleLinear(points, 20)
}

function sampleCircumscribedCircle(p1: Pt, p2: Pt, p3: Pt): Pt[] {
  const d = 2 * (p1.x * (p2.y - p3.y) + p2.x * (p3.y - p1.y) + p3.x * (p1.y - p2.y))
  if (Math.abs(d) < 1e-4) return sampleLinear([p1, p2, p3], 20)
  const p1Sq = p1.x * p1.x + p1.y * p1.y
  const p2Sq = p2.x * p2.x + p2.y * p2.y
  const p3Sq = p3.x * p3.x + p3.y * p3.y
  const cx = (p1Sq * (p2.y - p3.y) + p2Sq * (p3.y - p1.y) + p3Sq * (p1.y - p2.y)) / d
  const cy = (p1Sq * (p3.x - p2.x) + p2Sq * (p1.x - p3.x) + p3Sq * (p2.x - p1.x)) / d
  const r = Math.hypot(p1.x - cx, p1.y - cy)
  const a1 = Math.atan2(p1.y - cy, p1.x - cx)
  const a2 = Math.atan2(p2.y - cy, p2.x - cx)
  const a3 = Math.atan2(p3.y - cy, p3.x - cx)
  let da12 = a2 - a1
  let da23 = a3 - a2
  while (da12 > Math.PI) da12 -= Math.PI * 2
  while (da12 < -Math.PI) da12 += Math.PI * 2
  while (da23 > Math.PI) da23 -= Math.PI * 2
  while (da23 < -Math.PI) da23 += Math.PI * 2
  if (Math.sign(da12) !== Math.sign(da23)) return sampleLinear([p1, p2, p3], 20)
  const totalAngle = da12 + da23
  const steps = Math.max(15, Math.ceil((Math.abs(totalAngle) * r) / 4))
  const out: Pt[] = []
  for (let s = 0; s <= steps; s++) {
    const a = a1 + (totalAngle * s) / steps
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r })
  }
  return out
}

function sampleCatmullSegment(p0: Pt, p1: Pt, p2: Pt, p3: Pt, steps = 12): Pt[] {
  const out: Pt[] = []
  for (let s = 0; s <= steps; s++) {
    const t = s / steps
    const t2 = t * t
    const t3 = t2 * t
    const x =
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3)
    const y =
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
    out.push({ x, y })
  }
  return out
}

function sampleCatmull(points: Pt[]): Pt[] {
  if (points.length < 3) return sampleLinear(points, 20)
  const out: Pt[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = i > 0 ? points[i - 1] : points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = i + 2 < points.length ? points[i + 2] : p2
    const seg = sampleCatmullSegment(p0, p1, p2, p3, 14)
    if (out.length && seg.length) seg.shift()
    out.push(...seg)
  }
  return out.length ? out : sampleLinear(points, 20)
}

function buildCurve(curveType: string, points: Pt[]): Pt[] {
  if (points.length <= 1) return points.slice()
  const kind = curveType.toUpperCase()[0] || 'L'
  if (kind === 'L') return sampleLinear(points, 10)
  if (kind === 'P' && points.length === 3) return sampleCircumscribedCircle(points[0], points[1], points[2])
  if (kind === 'C') return sampleCatmull(points)
  return sampleBezier(points)
}

function fitPathLength(path: Pt[], targetLen: number): Pt[] {
  if (path.length < 2 || targetLen <= 0) return path
  const { pathLen, cumLens } = pathMetrics(path)
  if (pathLen <= 0) return path
  if (Math.abs(pathLen - targetLen) < 1) return path
  if (targetLen < pathLen) {
    const out: Pt[] = [path[0]]
    for (let i = 1; i < path.length; i++) {
      if (cumLens[i] >= targetLen) {
        const segStart = cumLens[i - 1]
        const segEnd = cumLens[i]
        const seg = segEnd - segStart || 1
        const t = (targetLen - segStart) / seg
        out.push(lerp(path[i - 1], path[i], t))
        break
      }
      out.push(path[i])
    }
    return out
  }
  const last = path[path.length - 1]
  const prev = path[path.length - 2]
  const dx = last.x - prev.x
  const dy = last.y - prev.y
  const len = Math.hypot(dx, dy) || 1
  const need = targetLen - pathLen
  return path.concat([{ x: last.x + (dx / len) * need, y: last.y + (dy / len) * need }])
}

interface TimingState {
  time: number
  beatLength: number
  sv: number
}

function parseTimingPoints(lines: string[]): TimingState[] {
  const out: TimingState[] = []
  let section = ''
  let lastBeat = 500
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('//')) continue
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1).toLowerCase()
      continue
    }
    if (section !== 'timingpoints') continue
    const p = line.split(',')
    if (p.length < 2) continue
    const time = parseFloat(p[0])
    const beatLength = parseFloat(p[1])
    const uninherited = p.length < 7 ? 1 : parseInt(p[6], 10)
    if (!Number.isFinite(time) || !Number.isFinite(beatLength)) continue
    if (uninherited === 1 || beatLength > 0) {
      lastBeat = beatLength > 0 ? beatLength : lastBeat
      out.push({ time, beatLength: lastBeat, sv: 1 })
    } else {
      const sv = Math.max(0.1, Math.min(10, -100 / beatLength))
      out.push({ time, beatLength: lastBeat, sv })
    }
  }
  out.sort((a, b) => a.time - b.time)
  if (!out.length) out.push({ time: 0, beatLength: 500, sv: 1 })
  return out
}

function timingAt(list: TimingState[], t: number): TimingState {
  let cur = list[0]
  for (let i = 0; i < list.length; i++) {
    if (list[i].time <= t) cur = list[i]
    else break
  }
  return cur
}

type ParsedObject = PreviewObject & { stack?: number }

function objectEndPos(o: PreviewObject): Pt {
  if (o.kind === 'slider') {
    // After an even number of slides the ball ends back at the head
    return o.slides % 2 === 0 ? o.path[0] : o.path[o.path.length - 1]
  }
  if (o.kind === 'circle') return { x: o.x, y: o.y }
  return { x: PLAY_W / 2, y: PLAY_H / 2 }
}

function objectPos(o: PreviewObject): Pt {
  return o.kind === 'spinner' ? { x: PLAY_W / 2, y: PLAY_H / 2 } : { x: o.x, y: o.y }
}

function objectEndTime(o: PreviewObject): number {
  return o.kind === 'circle' ? o.t : o.endTime
}

/**
 * osu! stacking (beatmap format v6+, same as osu!stable / lazer OsuBeatmapProcessor):
 * objects placed on the same spot within the stack threshold are shifted up-left
 * by radius/10 per stack level so they don't collapse into one point.
 */
function applyStacking(objects: ParsedObject[], preempt: number, stackLeniency: number, radius: number) {
  const STACK_DISTANCE = 3
  const threshold = preempt * stackLeniency
  const n = objects.length
  for (const o of objects) o.stack = 0
  if (n < 2) return

  let extendedEndIndex = n - 1
  for (let i = n - 1; i >= 0; i--) {
    let stackBaseIndex = i
    for (let k = stackBaseIndex + 1; k < n; k++) {
      const base = objects[stackBaseIndex]
      if (base.kind === 'spinner') break
      const ok = objects[k]
      if (ok.kind === 'spinner') continue
      if (ok.t - objectEndTime(base) > threshold) break
      if (
        dist(objectPos(base), objectPos(ok)) < STACK_DISTANCE ||
        (base.kind === 'slider' && dist(objectEndPos(base), objectPos(ok)) < STACK_DISTANCE)
      ) {
        stackBaseIndex = k
        ok.stack = 0
      }
    }
    if (stackBaseIndex > extendedEndIndex) {
      extendedEndIndex = stackBaseIndex
      if (extendedEndIndex === n - 1) break
    }
  }

  let extendedStartIndex = 0
  for (let i = extendedEndIndex; i > 0; i--) {
    let k = i
    let oi = objects[i]
    if ((oi.stack || 0) !== 0 || oi.kind === 'spinner') continue

    if (oi.kind === 'circle') {
      while (--k >= 0) {
        const ok = objects[k]
        if (ok.kind === 'spinner') continue
        if (oi.t - objectEndTime(ok) > threshold) break
        if (k < extendedStartIndex) {
          ok.stack = 0
          extendedStartIndex = k
        }
        if (ok.kind === 'slider' && dist(objectEndPos(ok), objectPos(oi)) < STACK_DISTANCE) {
          const offset = (oi.stack || 0) - (ok.stack || 0) + 1
          for (let j = k + 1; j <= i; j++) {
            const oj = objects[j]
            if (dist(objectEndPos(ok), objectPos(oj)) < STACK_DISTANCE) oj.stack = (oj.stack || 0) - offset
          }
          break
        }
        if (dist(objectPos(ok), objectPos(oi)) < STACK_DISTANCE) {
          ok.stack = (oi.stack || 0) + 1
          oi = ok
        }
      }
    } else if (oi.kind === 'slider') {
      while (--k >= 0) {
        const ok = objects[k]
        if (ok.kind === 'spinner') continue
        if (oi.t - ok.t > threshold) break
        if (dist(objectEndPos(ok), objectPos(oi)) < STACK_DISTANCE) {
          ok.stack = (oi.stack || 0) + 1
          oi = ok
        }
      }
    }
  }

  const step = radius / 10
  for (const o of objects) {
    const h = o.stack || 0
    if (!h || o.kind === 'spinner') continue
    const d = -h * step
    o.x += d
    o.y += d
    if (o.kind === 'slider') o.path = o.path.map((p) => ({ x: p.x + d, y: p.y + d }))
  }
}

export function parseOsu(text: string): ParsedBeatmap {
  const lines = String(text || '').split(/\r?\n/)
  let section = ''
  let previewTime = 0
  let ar = 9
  let cs = 4
  let modeNum = 0
  let sliderMultiplier = 1.4
  let stackLeniency = 0.7
  let hasAR = false
  const timing = parseTimingPoints(lines)
  const objects: ParsedObject[] = []

  let comboNumber = 0
  let comboIndex = -1
  let prevWasSpinner = true

  const sane = (v: number) => clamp(v, -1024, 1536)

  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith('//')) continue
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1).toLowerCase()
      continue
    }
    if (section === 'general') {
      if (line.startsWith('PreviewTime:')) previewTime = parseInt(line.split(':')[1], 10) || 0
      if (line.startsWith('Mode:')) modeNum = parseInt(line.split(':')[1], 10) || 0
      if (line.startsWith('StackLeniency:')) {
        const v = parseFloat(line.split(':')[1])
        if (Number.isFinite(v)) stackLeniency = v
      }
    } else if (section === 'difficulty') {
      if (line.startsWith('ApproachRate:')) {
        ar = parseFloat(line.split(':')[1]) || 0
        hasAR = true
      }
      if (line.startsWith('CircleSize:')) cs = parseFloat(line.split(':')[1]) || 0
      if (line.startsWith('SliderMultiplier:')) sliderMultiplier = parseFloat(line.split(':')[1]) || 1.4
      if (line.startsWith('OverallDifficulty:') && !hasAR) {
        ar = parseFloat(line.split(':')[1]) || ar
      }
    } else if (section === 'hitobjects') {
      const p = line.split(',')
      if (p.length < 4) continue
      const x = sane(parseFloat(p[0]))
      const y = sane(parseFloat(p[1]))
      const t = parseInt(p[2], 10)
      const type = parseInt(p[3], 10) || 0
      const hitSound = parseInt(p[4], 10) || 0
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(t)) continue

      const isSpinner = (type & 8) !== 0
      // New combo on the NC flag, on the first object and on the object after a spinner
      if (!isSpinner && ((type & 4) || prevWasSpinner)) {
        comboIndex = (comboIndex + 1 + ((type & 4) ? (type >> 4) & 7 : 0)) % IDKE_COMBO_COLORS.length
        comboNumber = 1
      } else if (!isSpinner) {
        comboNumber += 1
      }
      prevWasSpinner = isSpinner
      const color = IDKE_COMBO_COLORS[Math.max(0, comboIndex) % IDKE_COMBO_COLORS.length]

      if (isSpinner) {
        const endTime = parseInt(p[5], 10) || t + 1000
        objects.push({ kind: 'spinner', t, endTime })
        continue
      }

      if (type & 2) {
        const curveRaw = p[5] || 'L'
        const slides = Math.max(1, parseInt(p[6], 10) || 1)
        const pixelLength = parseFloat(p[7]) || 0
        const pipe = curveRaw.split('|')
        const curveType = pipe[0] || 'B'
        const cps: Pt[] = [{ x, y }]
        for (let i = 1; i < pipe.length; i++) {
          const xy = pipe[i].split(':')
          if (xy.length < 2) continue
          const cx = parseFloat(xy[0])
          const cy = parseFloat(xy[1])
          if (Number.isFinite(cx) && Number.isFinite(cy)) cps.push({ x: sane(cx), y: sane(cy) })
        }
        let path = buildCurve(curveType, cps)
        if (pixelLength > 0) path = fitPathLength(path, pixelLength)
        if (path.length < 2) path = [{ x, y }, { x: x + 1, y }]
        const { pathLen } = pathMetrics(path)
        const tm = timingAt(timing, t)
        const pxPerBeat = sliderMultiplier * 100 * tm.sv
        const oneSlide = pxPerBeat > 0 ? (Math.max(pathLen, 1) / pxPerBeat) * tm.beatLength : 500
        const endTime = Math.round(t + oneSlide * slides)

        objects.push({
          kind: 'slider',
          x,
          y,
          t,
          endTime,
          slides,
          path,
          pathLen: 0,
          cumLens: [],
          hitSound,
          comboIndex,
          comboNumber,
          color,
        })
      } else {
        objects.push({ kind: 'circle', x, y, t, hitSound, comboIndex, comboNumber, color })
      }
    }
  }

  objects.sort((a, b) => a.t - b.t)
  applyStacking(objects, approachMs(ar), stackLeniency, circleRadius(cs))
  for (const o of objects) {
    if (o.kind === 'slider') {
      const m = pathMetrics(o.path)
      o.pathLen = m.pathLen
      o.cumLens = m.cumLens
    }
  }
  if (previewTime <= 0 && objects.length) {
    previewTime = Math.max(0, objects[0].t - 500)
  }

  return { previewTime, ar, cs, mode: modeNum, objects }
}


// --- Skin Image and Sound Asset Manager (vv_idke_trail) ---

interface SkinImageMap {
  cursor: HTMLImageElement | null
  cursortrail: HTMLImageElement | null
  hitcircle: HTMLImageElement | null
  hitcircleoverlay: HTMLImageElement | null
  approachcircle: HTMLImageElement | null
  reversearrow: HTMLImageElement | null
  sliderb: HTMLImageElement | null
  sliderfollowcircle: HTMLImageElement | null
  hit300: HTMLImageElement | null
  hit100: HTMLImageElement | null
  hit50: HTMLImageElement | null
  hit0: HTMLImageElement | null
  digits: (HTMLImageElement | null)[]
}

const skinImages: SkinImageMap = {
  cursor: null,
  cursortrail: null,
  hitcircle: null,
  hitcircleoverlay: null,
  approachcircle: null,
  reversearrow: null,
  sliderb: null,
  sliderfollowcircle: null,
  hit300: null,
  hit100: null,
  hit50: null,
  hit0: null,
  digits: [],
}

/** skin.ini values the renderer relies on */
const SKIN = {
  sliderBorder: 'rgb(120,120,120)',
  sliderTrack: 'rgb(3,3,12)',
  hitCircleOverlap: 6,
  overlayAboveNumber: true,
  allowSliderBallTint: true,
}

/** Combo-colour tinted copies (osu! tints by multiplying, keeping the sprite's shading) */
const tintCache = new Map<string, HTMLCanvasElement>()

function tinted(img: HTMLImageElement | null, color: string, key: string): CanvasImageSource | null {
  if (!img) return null
  const cacheKey = `${key}|${color}`
  const hit = tintCache.get(cacheKey)
  if (hit) return hit
  const c = document.createElement('canvas')
  c.width = img.naturalWidth || img.width
  c.height = img.naturalHeight || img.height
  const ctx = c.getContext('2d')
  if (!ctx) return img
  ctx.drawImage(img, 0, 0)
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = color
  ctx.fillRect(0, 0, c.width, c.height)
  ctx.globalCompositeOperation = 'destination-in'
  ctx.drawImage(img, 0, 0)
  tintCache.set(cacheKey, c)
  return c
}

/** Skins hide an element with a 1x1 transparent png */
function usable(img: HTMLImageElement | null): img is HTMLImageElement {
  return !!img && img.naturalWidth > 2 && img.naturalHeight > 2
}

function getCandidateBases(): string[] {
  const list: string[] = ['http://127.0.0.1:24777/skin/', './skin/', '/skin/']
  if (typeof window !== 'undefined') {
    const custom = (window as unknown as { __TOSU_ASSET_BASE__?: string }).__TOSU_ASSET_BASE__
    if (custom) list.unshift(custom)
    list.push('http://127.0.0.1:24050/Maps%20Browser%20by%20tosu-gui/skin/')
  }
  return list
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function loadImgWithFallback(filename: string): Promise<HTMLImageElement | null> {
  const bases = getCandidateBases()
  for (const b of bases) {
    try {
      const url = `${b.replace(/\/+$/, '')}/${filename}`
      const img = await loadImg(url)
      if (img && img.naturalWidth > 0) return img
    } catch {
      /* try next base */
    }
  }
  return null
}

let skinLoadingPromise: Promise<void> | null = null

export function ensureSkinLoaded(): Promise<void> {
  if (skinLoadingPromise) return skinLoadingPromise

  skinLoadingPromise = (async () => {
    const names = [
      'cursor',
      'cursortrail',
      'hitcircle',
      'hitcircleoverlay',
      'approachcircle',
      'reversearrow',
      'sliderb0',
      'sliderfollowcircle',
      'hit300',
      'hit100',
      'hit50',
      'hit0',
    ]
    const imgs = await Promise.all([
      ...names.map((n) => loadImgWithFallback(`${n}.png`)),
      ...Array.from({ length: 10 }, (_, i) => loadImgWithFallback(`default-${i}.png`)),
    ])
    skinImages.cursor = imgs[0]
    skinImages.cursortrail = imgs[1]
    skinImages.hitcircle = imgs[2]
    skinImages.hitcircleoverlay = imgs[3]
    skinImages.approachcircle = imgs[4]
    skinImages.reversearrow = imgs[5]
    skinImages.sliderb = imgs[6]
    skinImages.sliderfollowcircle = imgs[7]
    skinImages.hit300 = imgs[8]
    skinImages.hit100 = imgs[9]
    skinImages.hit50 = imgs[10]
    skinImages.hit0 = imgs[11]
    skinImages.digits = imgs.slice(names.length)
  })()

  return skinLoadingPromise
}

// --- Hitsounds ---

interface HitSoundBuffers {
  normal: AudioBuffer | null
  whistle: AudioBuffer | null
  finish: AudioBuffer | null
  clap: AudioBuffer | null
}

let cachedBuffers: HitSoundBuffers | null = null
let loadingBuffersPromise: Promise<HitSoundBuffers> | null = null

async function loadSample(ctx: AudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const arr = await res.arrayBuffer()
    return await ctx.decodeAudioData(arr)
  } catch {
    return null
  }
}

async function loadSampleWithFallback(ctx: AudioContext, filename: string): Promise<AudioBuffer | null> {
  const bases = getCandidateBases()
  for (const b of bases) {
    try {
      const url = `${b.replace(/\/+$/, '')}/${filename}`
      const buf = await loadSample(ctx, url)
      if (buf) return buf
    } catch {
      /* try next base */
    }
  }
  return null
}

async function loadHitSoundBuffers(ctx: AudioContext): Promise<HitSoundBuffers> {
  if (cachedBuffers) return cachedBuffers
  if (loadingBuffersPromise) return loadingBuffersPromise

  loadingBuffersPromise = (async () => {
    const [normal, whistle, finish, clap] = await Promise.all([
      loadSampleWithFallback(ctx, 'normal-hitnormal.wav'),
      loadSampleWithFallback(ctx, 'normal-hitwhistle.wav'),
      loadSampleWithFallback(ctx, 'normal-hitfinish.wav'),
      loadSampleWithFallback(ctx, 'normal-hitclap.wav'),
    ])
    cachedBuffers = { normal, whistle, finish, clap }
    return cachedBuffers
  })()

  return loadingBuffersPromise
}

function playBuffer(ctx: AudioContext, buf: AudioBuffer, vol: number, when = 0) {
  try {
    const src = ctx.createBufferSource()
    src.buffer = buf
    const gain = ctx.createGain()
    gain.gain.value = vol
    src.connect(gain)
    gain.connect(ctx.destination)
    src.start(Math.max(when, ctx.currentTime))
  } catch {
    /* ignore */
  }
}

export function ensureAudio(rt: PreviewRuntime): AudioContext | null {
  try {
    if (!rt.audio) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!AC) return null
      rt.audio = new AC()
    }
    if (rt.audio.state === 'suspended') void rt.audio.resume()
    return rt.audio
  } catch {
    return null
  }
}

function playHitSound(rt: PreviewRuntime, hitSound: number, when = 0) {
  if (rt.volume <= 0.001) return
  const ctx = ensureAudio(rt)
  if (!ctx) return

  void loadHitSoundBuffers(ctx)

  const vol = Math.min(1, Math.max(0, rt.volume))

  if (cachedBuffers && cachedBuffers.normal) {
    playBuffer(ctx, cachedBuffers.normal, 0.55 * vol, when)
    if ((hitSound & 2) && cachedBuffers.whistle) {
      playBuffer(ctx, cachedBuffers.whistle, 0.55 * vol, when)
    }
    if ((hitSound & 4) && cachedBuffers.finish) {
      playBuffer(ctx, cachedBuffers.finish, 0.65 * vol, when)
    }
    if ((hitSound & 8) && cachedBuffers.clap) {
      playBuffer(ctx, cachedBuffers.clap, 0.6 * vol, when)
    }
  }
}

export async function preloadHitSounds(rt: PreviewRuntime): Promise<void> {
  const ctx = ensureAudio(rt)
  if (ctx) {
    await loadHitSoundBuffers(ctx)
  }
}

/**
 * The b.ppy.sh preview mp3 starts this many ms before the map's PreviewTime
 * (measured by onset alignment over 20 ranked maps: 107–123 ms, ~117 ms avg).
 * Map time at clip position 0 is therefore `previewTime - PREVIEW_CLIP_LEAD_MS`.
 */
export const PREVIEW_CLIP_LEAD_MS = 117

/** How far ahead hitsounds are queued on the audio clock (covers rAF hiccups). */
const HIT_LOOKAHEAD_MS = 150

/**
 * Map time (ms) of what the listener hears right now. Accounts for the output
 * latency so visuals line up with the sound rather than with the audio thread.
 */
export function musicMapTime(rt: PreviewRuntime): number | null {
  const ctx = rt.audio
  if (!ctx || !rt.music) return null
  const latency = (ctx.outputLatency || 0) + (ctx.baseLatency || 0)
  return rt.music.mapStartMs + (ctx.currentTime - latency - rt.music.ctxStart) * 1000
}

function fireHits(data: ParsedBeatmap, t: number, rt: PreviewRuntime) {
  const ctx = rt.audio
  const music = rt.music
  // With a Web Audio music clock, queue hits slightly ahead at exact context times.
  // Without one (legacy path), fire them as the frame time crosses them.
  const effectiveT =
    ctx && music
      ? music.mapStartMs + (ctx.currentTime - music.ctxStart) * 1000 + HIT_LOOKAHEAD_MS
      : t + 35 // HTML5 Audio output latency compensation
  const whenFor = (mapMs: number) =>
    ctx && music ? music.ctxStart + (mapMs - music.mapStartMs) / 1000 : 0

  if (rt.lastT < 0) rt.lastT = effectiveT
  const from = rt.lastT
  const to = effectiveT
  rt.lastT = effectiveT
  if (to < from) return

  data.objects.forEach((o, i) => {
    if (o.kind === 'circle') {
      const key = `c${i}`
      if (o.t >= from && o.t <= to && !rt.fired.has(key)) {
        rt.fired.add(key)
        playHitSound(rt, o.hitSound, whenFor(o.t))
        rt.judgments.push({ x: o.x, y: o.y, t: o.t, type: '300' })
      }
    } else if (o.kind === 'slider') {
      const span = Math.max(1, o.endTime - o.t)
      const slides = Math.max(1, o.slides || 1)
      for (let s = 0; s <= slides; s++) {
        const slideT = o.t + s * (span / slides)
        const key = `sl_${i}_${s}`
        if (slideT >= from && slideT <= to && !rt.fired.has(key)) {
          rt.fired.add(key)
          playHitSound(rt, o.hitSound, whenFor(slideT))
          if (s === slides) {
            const endPos = sliderBallPos(o, o.endTime)
            rt.judgments.push({ x: endPos.x, y: endPos.y, t: o.endTime, type: '300' })
          }
        }
      }
    }
  })
}

// --- Autoplay cursor ---

function sliderBallPos(o: Extract<PreviewObject, { kind: 'slider' }>, t: number): Pt {
  const span = Math.max(1, o.endTime - o.t)
  const one = span / o.slides
  let local = (t - o.t) / one
  if (local < 0) return { x: o.x, y: o.y }
  const slide = Math.floor(local)
  local = local - slide
  if (slide % 2 === 1) local = 1 - local
  local = clamp(local, 0, 1)
  return pointAlongPath(o.path, o.cumLens, o.pathLen, local * o.pathLen)
}

type Anchor = { t: number; p: Pt }

function buildAnchors(objects: PreviewObject[]): Anchor[] {
  const a: Anchor[] = []
  for (const o of objects) {
    if (o.kind === 'circle') {
      a.push({ t: o.t, p: { x: o.x, y: o.y } })
    } else if (o.kind === 'slider') {
      a.push({ t: o.t, p: { x: o.x, y: o.y } })
      a.push({ t: o.endTime, p: sliderBallPos(o, o.endTime) })
    } else {
      a.push({ t: o.t, p: { x: PLAY_W / 2 + 50, y: PLAY_H / 2 } })
      a.push({ t: o.endTime, p: { x: PLAY_W / 2 + 50, y: PLAY_H / 2 } })
    }
  }
  a.sort((x, y) => x.t - y.t)
  return a
}

function easeInOutCubic(u: number): number {
  const t = clamp(u, 0, 1)
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function autoplayTarget(data: ParsedBeatmap, t: number): Pt {
  for (const o of data.objects) {
    if (o.kind === 'slider' && t >= o.t && t <= o.endTime) {
      return sliderBallPos(o, t)
    }
    if (o.kind === 'spinner' && t >= o.t && t <= o.endTime) {
      const elapsed = t - o.t
      const angle = elapsed * 0.045
      const radius = 50
      return {
        x: PLAY_W / 2 + Math.cos(angle) * radius,
        y: PLAY_H / 2 + Math.sin(angle) * radius,
      }
    }
  }

  const anchors = buildAnchors(data.objects)
  if (!anchors.length) return { x: PLAY_W / 2, y: PLAY_H / 2 }

  if (t <= anchors[0].t) {
    const first = anchors[0]
    const lead = 400
    const p = first.t - t
    if (p > lead) return { x: PLAY_W / 2, y: PLAY_H / 2 }
    const u = easeInOutCubic(1 - p / lead)
    return lerp({ x: PLAY_W / 2, y: PLAY_H / 2 }, first.p, u)
  }

  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i]
    const b = anchors[i + 1]
    if (t >= a.t && t <= b.t) {
      const span = Math.max(1, b.t - a.t)
      const u = (t - a.t) / span
      const shaped = easeInOutCubic(Math.pow(u, 0.9))
      return lerp(a.p, b.p, shaped)
    }
  }

  return anchors[anchors.length - 1].p
}

/** Cursor trail: sprites spawned by distance, short-lived (osu!stable without cursormiddle) */
const TRAIL_SPACING_OSU = 9
const TRAIL_LIFE_MS = 110
const TRAIL_MAX = 10

function updateCursor(data: ParsedBeatmap, t: number, rt: PreviewRuntime) {
  // Autoplay is exact: follow the target directly instead of lagging behind it
  rt.cursor = autoplayTarget(data, t)
  const last = rt.trail[rt.trail.length - 1]
  if (last && t < last.t) rt.trail = []
  if (!last || dist(last, rt.cursor) >= TRAIL_SPACING_OSU) {
    rt.trail.push({ x: rt.cursor.x, y: rt.cursor.y, t })
  }
  while (rt.trail.length > TRAIL_MAX || (rt.trail.length > 0 && t - rt.trail[0].t > TRAIL_LIFE_MS)) {
    rt.trail.shift()
  }
}

// --- Layout ---

type FieldLayout = {
  ox: number
  oy: number
  /** canvas px per osu!px */
  scale: number
  pfW: number
  pfH: number
  rPx: number
  /** canvas px per skin-texture px for hit object sprites (128px hitcircle = 2 * radius) */
  sprite: number
  scr: (p: Pt) => Pt
}

function makeFieldLayout(canvasW: number, canvasH: number, cs: number): FieldLayout {
  // osu! puts the 512x384 playfield inside a 640x480 virtual screen, nudged 8px down
  const scale = Math.min(canvasW / 640, canvasH / 480)
  const pfW = PLAY_W * scale
  const pfH = PLAY_H * scale
  const ox = (canvasW - pfW) / 2
  const oy = (canvasH - pfH) / 2 + 8 * scale
  const rOsu = circleRadius(cs)
  return {
    ox,
    oy,
    scale,
    pfW,
    pfH,
    rPx: rOsu * scale,
    sprite: (rOsu / 64) * scale,
    scr: (p: Pt) => ({ x: ox + p.x * scale, y: oy + p.y * scale }),
  }
}

// --- Sprites ---

function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  x: number,
  y: number,
  k: number,
  alpha: number,
  rotation = 0
) {
  const iw = (img as HTMLImageElement).naturalWidth || (img as HTMLCanvasElement).width
  const ih = (img as HTMLImageElement).naturalHeight || (img as HTMLCanvasElement).height
  const w = iw * k
  const h = ih * k
  if (w < 0.5 || alpha <= 0.003) return
  ctx.globalAlpha = clamp(alpha, 0, 1)
  if (rotation) {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rotation)
    ctx.drawImage(img, -w / 2, -h / 2, w, h)
    ctx.restore()
  } else {
    ctx.drawImage(img, x - w / 2, y - h / 2, w, h)
  }
}

function drawDigits(ctx: CanvasRenderingContext2D, layout: FieldLayout, cx: number, cy: number, num: number, alpha: number) {
  const str = String(num)
  const digits = skinImages.digits
  if (digits.length >= 10 && digits.every(usable)) {
    // osu! draws hit circle numbers at 0.8x with HitCircleOverlap between glyphs
    const k = layout.sprite * 0.8
    const glyphs = [...str].map((ch) => digits[parseInt(ch, 10)] as HTMLImageElement)
    const overlap = SKIN.hitCircleOverlap * k
    const total = glyphs.reduce((s, g) => s + g.naturalWidth * k, 0) - overlap * (glyphs.length - 1)
    let x = cx - total / 2
    for (const g of glyphs) {
      const w = g.naturalWidth * k
      drawSprite(ctx, g, x + w / 2, cy, k, alpha)
      x += w - overlap
    }
    return
  }
  ctx.globalAlpha = clamp(alpha, 0, 1)
  ctx.fillStyle = '#fff'
  ctx.font = `bold ${Math.max(10, Math.round(layout.rPx * 0.7))}px system-ui,sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(str, cx, cy + 0.5)
}

/** hitcircle (tinted) + number + hitcircleoverlay, in skin.ini order */
function drawCircleSprite(
  ctx: CanvasRenderingContext2D,
  layout: FieldLayout,
  p: Pt,
  color: string,
  alpha: number,
  scale: number,
  comboNumber: number
) {
  if (alpha <= 0.003) return
  const k = layout.sprite * scale
  const base = tinted(skinImages.hitcircle, color, 'hitcircle')
  const overlay = skinImages.hitcircleoverlay
  if (base) {
    drawSprite(ctx, base, p.x, p.y, k, alpha)
  } else {
    ctx.globalAlpha = clamp(alpha, 0, 1)
    ctx.beginPath()
    ctx.arc(p.x, p.y, layout.rPx * scale * 0.94, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = Math.max(1.5, layout.rPx * 0.1)
    ctx.stroke()
  }
  if (overlay && !SKIN.overlayAboveNumber) drawSprite(ctx, overlay, p.x, p.y, k, alpha)
  if (comboNumber > 0) drawDigits(ctx, layout, p.x, p.y, comboNumber, alpha)
  if (overlay && SKIN.overlayAboveNumber) drawSprite(ctx, overlay, p.x, p.y, k, alpha)
}

function drawApproachSprite(
  ctx: CanvasRenderingContext2D,
  layout: FieldLayout,
  p: Pt,
  color: string,
  alpha: number,
  scale: number
) {
  const img = tinted(skinImages.approachcircle, color, 'approach')
  if (img) {
    drawSprite(ctx, img, p.x, p.y, layout.sprite * scale, alpha)
    return
  }
  ctx.globalAlpha = clamp(alpha, 0, 1)
  ctx.beginPath()
  ctx.arc(p.x, p.y, layout.rPx * scale, 0, Math.PI * 2)
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1.5, layout.rPx * 0.09)
  ctx.stroke()
}

// --- osu! object timing (stable / lazer legacy values) ---

const HIT_FADE_MS = 240
const FOLLOW_IN_MS = 180
const FOLLOW_OUT_MS = 200

function fadeInMs(preempt: number) {
  return 400 * Math.min(1, preempt / 450)
}

function easeOut(u: number) {
  const x = clamp(u, 0, 1)
  return 1 - (1 - x) * (1 - x)
}

type CircleState = { alpha: number; approachAlpha: number; approachScale: number }

/** State of a hit circle (or slider head) before it is hit; null when not visible yet / already hit */
function approachState(t: number, hitT: number, preempt: number): CircleState | null {
  const appear = hitT - preempt
  if (t < appear || t >= hitT) return null
  const fi = fadeInMs(preempt)
  return {
    alpha: clamp((t - appear) / fi, 0, 1),
    approachAlpha: 0.9 * clamp((t - appear) / Math.min(fi * 2, preempt), 0, 1),
    approachScale: 1 + 3 * clamp((hitT - t) / preempt, 0, 1),
  }
}

type Explosion = { p: Pt; color: string; age: number }

function explosionAt(t: number, hitT: number, p: Pt, color: string, out: Explosion[]) {
  const age = t - hitT
  if (age >= 0 && age < HIT_FADE_MS) out.push({ p, color, age })
}

// --- Sliders ---

type Slider = Extract<PreviewObject, { kind: 'slider' }>

function partialPath(o: Slider, fraction: number): Pt[] {
  if (fraction >= 1) return o.path
  const target = o.pathLen * Math.max(0, fraction)
  const out: Pt[] = [o.path[0]]
  for (let i = 1; i < o.path.length; i++) {
    if (o.cumLens[i] >= target) {
      const seg = o.cumLens[i] - o.cumLens[i - 1] || 1
      out.push(lerp(o.path[i - 1], o.path[i], (target - o.cumLens[i - 1]) / seg))
      break
    }
    out.push(o.path[i])
  }
  return out
}

let bodyLayer: HTMLCanvasElement | null = null

/** Border + translucent track, composed off-screen so overlaps don't double-blend */
function drawSliderBody(ctx: CanvasRenderingContext2D, layout: FieldLayout, path: Pt[], alpha: number) {
  if (path.length < 2 || alpha <= 0.003) return
  const W = ctx.canvas.width
  const H = ctx.canvas.height
  if (!bodyLayer) bodyLayer = document.createElement('canvas')
  if (bodyLayer.width !== W || bodyLayer.height !== H) {
    bodyLayer.width = W
    bodyLayer.height = H
  }
  const b = bodyLayer.getContext('2d')
  if (!b) return
  b.clearRect(0, 0, W, H)
  b.lineCap = 'round'
  b.lineJoin = 'round'
  const trace = () => {
    b.beginPath()
    const p0 = layout.scr(path[0])
    b.moveTo(p0.x, p0.y)
    for (let i = 1; i < path.length; i++) {
      const p = layout.scr(path[i])
      b.lineTo(p.x, p.y)
    }
  }
  const outer = layout.rPx * 2 * 0.96
  const inner = outer * (1 - 0.128 * 2)
  trace()
  b.globalCompositeOperation = 'source-over'
  b.strokeStyle = SKIN.sliderBorder
  b.lineWidth = outer
  b.stroke()
  b.globalCompositeOperation = 'destination-out'
  b.lineWidth = inner
  b.stroke()
  b.globalCompositeOperation = 'source-over'
  b.globalAlpha = 0.7
  b.strokeStyle = SKIN.sliderTrack
  b.stroke()
  b.globalAlpha = 1

  ctx.globalAlpha = clamp(alpha, 0, 1)
  ctx.drawImage(bodyLayer, 0, 0)
}

function pathAngleAt(o: Slider, atEnd: boolean): number {
  const n = o.path.length
  const a = atEnd ? o.path[n - 1] : o.path[0]
  // look a few px back into the path for a stable direction
  const d = Math.min(o.pathLen, 6)
  const b = pointAlongPath(o.path, o.cumLens, o.pathLen, atEnd ? o.pathLen - d : d)
  return Math.atan2(b.y - a.y, b.x - a.x)
}

function drawSlider(
  ctx: CanvasRenderingContext2D,
  layout: FieldLayout,
  o: Slider,
  t: number,
  preempt: number,
  explosions: Explosion[]
) {
  const appear = o.t - preempt
  const fi = fadeInMs(preempt)
  const span = Math.max(1, (o.endTime - o.t) / o.slides)

  let bodyAlpha: number
  if (t < o.t) bodyAlpha = clamp((t - appear) / fi, 0, 1)
  else if (t <= o.endTime) bodyAlpha = 1
  else bodyAlpha = 1 - clamp((t - o.endTime) / HIT_FADE_MS, 0, 1)

  // Snaking: the body grows over the first third of the approach (osu! default)
  const snake = clamp((t - appear) / (preempt / 3), 0, 1)
  const path = partialPath(o, snake)
  drawSliderBody(ctx, layout, path, bodyAlpha)

  // Tail circle (no number) once the body has snaked to it
  if (t < o.endTime && snake >= 1) {
    drawCircleSprite(ctx, layout, layout.scr(o.path[o.path.length - 1]), o.color, bodyAlpha, 1, 0)
  }

  // Reverse arrows: the next two upcoming repeats
  const arrow = skinImages.reversearrow
  if (usable(arrow) && snake >= 1) {
    for (let i = 1; i < o.slides; i++) {
      const repeatT = o.t + i * span
      if (t >= repeatT || t < o.t + (i - 2) * span) continue
      const atEnd = i % 2 === 1
      const pos = layout.scr(atEnd ? o.path[o.path.length - 1] : o.path[0])
      const pulse = 1 + 0.12 * (1 - (((t - appear) % 300) + 300) % 300 / 300)
      drawSprite(ctx, arrow, pos.x, pos.y, layout.sprite * pulse, bodyAlpha, pathAngleAt(o, atEnd))
    }
  }

  // Head behaves like a hit circle until it is hit
  const head = layout.scr({ x: o.x, y: o.y })
  const hs = approachState(t, o.t, preempt)
  if (hs) drawCircleSprite(ctx, layout, head, o.color, hs.alpha, 1, o.comboNumber)
  explosionAt(t, o.t, head, o.color, explosions)
  explosionAt(t, o.endTime, layout.scr(objectEndPos(o)), o.color, explosions)
}

/** Ball + follow circle, drawn above every object like in osu! */
function drawSliderBall(ctx: CanvasRenderingContext2D, layout: FieldLayout, o: Slider, t: number) {
  if (t < o.t || t > o.endTime + FOLLOW_OUT_MS) return
  const tt = Math.min(t, o.endTime)
  const p = layout.scr(sliderBallPos(o, tt))

  const follow = skinImages.sliderfollowcircle
  if (usable(follow)) {
    let fs: number
    let fa: number
    if (t <= o.endTime) {
      const age = t - o.t
      fs = 0.5 + 0.5 * easeOut(age / FOLLOW_IN_MS)
      fa = clamp(age / 60, 0, 1)
    } else {
      const u = (t - o.endTime) / FOLLOW_OUT_MS
      fs = 1 - 0.2 * easeOut(u)
      fa = 1 - u
    }
    drawSprite(ctx, follow, p.x, p.y, layout.sprite * fs, fa)
  }

  if (t > o.endTime) return
  const ahead = sliderBallPos(o, Math.min(o.endTime, tt + 4))
  const here = sliderBallPos(o, tt)
  const angle = Math.atan2(ahead.y - here.y, ahead.x - here.x)
  const ball = SKIN.allowSliderBallTint ? tinted(skinImages.sliderb, o.color, 'sliderb') : skinImages.sliderb
  if (ball && usable(skinImages.sliderb)) {
    drawSprite(ctx, ball, p.x, p.y, layout.sprite, 1, angle)
  } else {
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(p.x, p.y, layout.rPx * 0.8, 0, Math.PI * 2)
    ctx.fillStyle = o.color
    ctx.fill()
  }
}

function drawSpinner(
  ctx: CanvasRenderingContext2D,
  layout: FieldLayout,
  t: number,
  o: Extract<PreviewObject, { kind: 'spinner' }>,
  alpha: number
) {
  const c = layout.scr({ x: PLAY_W / 2, y: PLAY_H / 2 })
  const R = Math.min(layout.pfW, layout.pfH) * 0.4
  const progress = clamp((t - o.t) / Math.max(1, o.endTime - o.t), 0, 1)
  const spinAngle = (Math.max(0, t - o.t) * 0.035) % (Math.PI * 2)

  ctx.save()
  ctx.globalAlpha = clamp(alpha, 0, 1)
  ctx.beginPath()
  ctx.arc(c.x, c.y, R, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(10,12,20,0.6)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.lineWidth = 4 * layout.scale
  ctx.stroke()

  ctx.strokeStyle = 'rgba(255,255,255,0.22)'
  ctx.lineWidth = 2 * layout.scale
  for (let i = 0; i < 8; i++) {
    const a = spinAngle + (i * Math.PI * 2) / 8
    ctx.beginPath()
    ctx.moveTo(c.x + Math.cos(a) * R * 0.22, c.y + Math.sin(a) * R * 0.22)
    ctx.lineTo(c.x + Math.cos(a) * R * 0.88, c.y + Math.sin(a) * R * 0.88)
    ctx.stroke()
  }

  // Approach ring shrinking to the centre, like osu!'s spinner approach circle
  ctx.beginPath()
  ctx.arc(c.x, c.y, Math.max(2, R * (1 - progress)), 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'
  ctx.lineWidth = 3 * layout.scale
  ctx.stroke()
  ctx.restore()
}

function drawCursor(ctx: CanvasRenderingContext2D, layout: FieldLayout, rt: PreviewRuntime, nowT: number) {
  // Cursor sprites are sized in 640x480 screen space, not by CS
  const k = layout.scale
  const trailImg = skinImages.cursortrail
  if (usable(trailImg)) {
    for (const pt of rt.trail) {
      const age = nowT - pt.t
      if (age < 0 || age > TRAIL_LIFE_MS) continue
      const p = layout.scr(pt)
      drawSprite(ctx, trailImg, p.x, p.y, k, 0.75 * (1 - age / TRAIL_LIFE_MS))
    }
  }
  const c = layout.scr(rt.cursor)
  if (usable(skinImages.cursor)) {
    drawSprite(ctx, skinImages.cursor, c.x, c.y, k, 1)
  } else {
    ctx.globalAlpha = 1
    ctx.beginPath()
    ctx.arc(c.x, c.y, 10 * k, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
  }
}

function drawJudgments(ctx: CanvasRenderingContext2D, layout: FieldLayout, rt: PreviewRuntime, nowT: number) {
  const img = skinImages.hit300
  for (let i = rt.judgments.length - 1; i >= 0; i--) {
    const j = rt.judgments[i]
    const age = nowT - j.t
    if (age > 350) {
      rt.judgments.splice(i, 1)
      continue
    }
    // This skin hides 300s with a 1x1 sprite
    if (age < 0 || !usable(img)) continue
    const p = layout.scr({ x: j.x, y: j.y })
    drawSprite(ctx, img, p.x, p.y - (age / 350) * 8 * layout.scale, layout.scale * (1 + (age / 350) * 0.15), 1 - age / 350)
  }
}

/**
 * Draw one frame like osu!stable: objects back-to-front (later objects below earlier ones),
 * then approach circles, hit explosions, slider balls and the cursor on top.
 */
export function drawPreviewFrame(
  ctx: CanvasRenderingContext2D,
  data: ParsedBeatmap,
  canvasW: number,
  canvasH: number,
  t: number,
  elapsed: number,
  rt?: PreviewRuntime
): boolean {
  void ensureSkinLoaded()

  const layout = makeFieldLayout(canvasW, canvasH, data.cs)
  const { ox, oy, scale, pfW, pfH } = layout
  const preempt = approachMs(data.ar)

  if (rt) {
    fireHits(data, t, rt)
    updateCursor(data, t, rt)
  }

  ctx.save()
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#0a0a0f'
  ctx.fillRect(0, 0, canvasW, canvasH)

  // Faint playfield grid
  ctx.strokeStyle = 'rgba(255,255,255,0.035)'
  ctx.lineWidth = 1
  for (let gx = 0; gx <= PLAY_W; gx += 64) {
    ctx.beginPath()
    ctx.moveTo(ox + gx * scale, oy)
    ctx.lineTo(ox + gx * scale, oy + pfH)
    ctx.stroke()
  }
  for (let gy = 0; gy <= PLAY_H; gy += 64) {
    ctx.beginPath()
    ctx.moveTo(ox, oy + gy * scale)
    ctx.lineTo(ox + pfW, oy + gy * scale)
    ctx.stroke()
  }

  const visible: PreviewObject[] = []
  for (const o of data.objects) {
    const endT = o.kind === 'circle' ? o.t + HIT_FADE_MS : o.endTime + Math.max(HIT_FADE_MS, FOLLOW_OUT_MS)
    if (t >= o.t - preempt && t <= endT) visible.push(o)
  }

  const explosions: Explosion[] = []
  // Back to front: latest object first so earlier ones end up on top
  for (let i = visible.length - 1; i >= 0; i--) {
    const o = visible[i]
    if (o.kind === 'circle') {
      const p = layout.scr({ x: o.x, y: o.y })
      const st = approachState(t, o.t, preempt)
      if (st) drawCircleSprite(ctx, layout, p, o.color, st.alpha, 1, o.comboNumber)
      explosionAt(t, o.t, p, o.color, explosions)
    } else if (o.kind === 'slider') {
      drawSlider(ctx, layout, o, t, preempt, explosions)
    } else {
      const a = t < o.t ? clamp(1 - (o.t - t) / 300, 0, 1) : t > o.endTime ? clamp(1 - (t - o.endTime) / 240, 0, 1) : 1
      drawSpinner(ctx, layout, t, o, a)
    }
  }

  // Approach circles sit above all hit objects
  for (let i = visible.length - 1; i >= 0; i--) {
    const o = visible[i]
    if (o.kind === 'spinner') continue
    const st = approachState(t, o.t, preempt)
    if (st) drawApproachSprite(ctx, layout, layout.scr({ x: o.x, y: o.y }), o.color, st.approachAlpha, st.approachScale)
  }

  // Hit explosions: hitcircle grows to 1.4x while fading out, number hidden
  for (const e of explosions) {
    const u = e.age / HIT_FADE_MS
    drawCircleSprite(ctx, layout, e.p, e.color, 1 - u, 1 + 0.4 * easeOut(u), 0)
  }

  for (let i = visible.length - 1; i >= 0; i--) {
    const o = visible[i]
    if (o.kind === 'slider') drawSliderBall(ctx, layout, o, t)
  }

  if (rt) {
    drawJudgments(ctx, layout, rt, t)
    drawCursor(ctx, layout, rt, t)
  }

  ctx.globalAlpha = 1
  ctx.fillStyle = 'rgba(255,255,255,0.45)'
  ctx.font = `${Math.round(12 * Math.max(1, scale))}px system-ui,sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(`${(t / 1000).toFixed(1)}s`, 10 * Math.max(1, scale), 18 * Math.max(1, scale))
  ctx.restore()

  return elapsed <= 34000
}

if (typeof window !== 'undefined') {
  (window as unknown as { TosuOsuPreview?: unknown }).TosuOsuPreview = {
    approachMs,
    circleRadius,
    createPreviewRuntime,
    resetPreviewRuntime,
    preloadHitSounds,
    drawPreviewFrame,
    parseOsu,
    pointAlongPath,
    IDKE_COMBO_COLORS,
  }
}
if (typeof globalThis !== 'undefined') {
  (globalThis as unknown as { TosuOsuPreview?: unknown }).TosuOsuPreview = {
    approachMs,
    circleRadius,
    createPreviewRuntime,
    resetPreviewRuntime,
    preloadHitSounds,
    drawPreviewFrame,
    parseOsu,
    pointAlongPath,
    IDKE_COMBO_COLORS,
  }
}
