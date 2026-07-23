/**
 * osu!standard beatmap preview — circles, sliders, autoplay cursor, hitsounds.
 * Playfield is always the full canvas (map 512×384 → canvas with uniform scale, no letterbox).
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

/** Mutable runtime for hitsounds + cursor between frames */
export interface PreviewRuntime {
  fired: Set<string>
  cursor: Pt
  trail: Pt[]
  volume: number
  audio: AudioContext | null
  lastT: number
}

const COMBO_COLORS = [
  'rgb(255, 192, 0)',
  'rgb(0, 202, 0)',
  'rgb(18, 124, 255)',
  'rgb(242, 24, 57)',
  'rgb(180, 90, 255)',
  'rgb(0, 200, 200)',
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

export function createPreviewRuntime(volume = 0.55): PreviewRuntime {
  return {
    fired: new Set(),
    cursor: { x: PLAY_W / 2, y: PLAY_H / 2 },
    trail: [],
    volume: Math.min(1, Math.max(0, volume)),
    audio: null,
    lastT: -1,
  }
}

export function resetPreviewRuntime(rt: PreviewRuntime, volume?: number) {
  rt.fired.clear()
  rt.cursor = { x: PLAY_W / 2, y: PLAY_H / 2 }
  rt.trail = []
  rt.lastT = -1
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

/** Keep object centers inside the legal playfield (osu editor range). */
function clampPlayfield(p: Pt): Pt {
  return {
    x: clamp(p.x, 0, PLAY_W),
    y: clamp(p.y, 0, PLAY_H),
  }
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
      for (let i = 0; i < pts.length - 1; i++) next.push(lerp(pts[i], pts[i + 1], t))
      pts = next
    }
    out.push(pts[0])
  }
  return out
}

function sampleBezier(points: Pt[]): Pt[] {
  if (points.length < 2) return points.slice()
  const out: Pt[] = []
  let seg: Pt[] = [points[0]]
  for (let i = 1; i < points.length; i++) {
    const p = points[i]
    const prev = seg[seg.length - 1]
    if (prev && Math.abs(prev.x - p.x) < 0.01 && Math.abs(prev.y - p.y) < 0.01) {
      const sampled = sampleBezierSegment(seg, Math.max(14, seg.length * 7))
      if (out.length) sampled.shift()
      out.push(...sampled)
      seg = [p]
    } else {
      seg.push(p)
    }
  }
  if (seg.length) {
    const sampled = sampleBezierSegment(seg, Math.max(14, seg.length * 7))
    if (out.length) sampled.shift()
    out.push(...sampled)
  }
  return out.length ? out : points.slice()
}

function sampleCatmull(points: Pt[], stepsPerSeg = 18): Pt[] {
  if (points.length < 2) return points.slice()
  const out: Pt[] = []
  const n = points.length
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(i + 2, n - 1)]
    for (let s = 0; s < stepsPerSeg; s++) {
      const t = s / stepsPerSeg
      const t2 = t * t
      const t3 = t2 * t
      out.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      })
    }
  }
  out.push(points[n - 1])
  return out
}

function samplePerfect(points: Pt[], steps = 56): Pt[] {
  if (points.length < 3) return sampleLinear(points)
  const [a, b, c] = points
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y))
  if (Math.abs(d) < 0.001) return sampleLinear(points)

  const ux =
    ((a.x * a.x + a.y * a.y) * (b.y - c.y) +
      (b.x * b.x + b.y * b.y) * (c.y - a.y) +
      (c.x * c.x + c.y * c.y) * (a.y - b.y)) /
    d
  const uy =
    ((a.x * a.x + a.y * a.y) * (c.x - b.x) +
      (b.x * b.x + b.y * b.y) * (a.x - c.x) +
      (c.x * c.x + c.y * c.y) * (b.x - a.x)) /
    d
  const center = { x: ux, y: uy }
  const r = dist(center, a)
  if (!Number.isFinite(r) || r < 0.5 || r > 5000) return sampleLinear(points)

  const a0 = Math.atan2(a.y - center.y, a.x - center.x)
  const a1 = Math.atan2(b.y - center.y, b.x - center.x)
  let a2 = Math.atan2(c.y - center.y, c.x - center.x)

  const norm = (from: number, to: number) => {
    let dlt = to - from
    while (dlt > Math.PI) dlt -= Math.PI * 2
    while (dlt < -Math.PI) dlt += Math.PI * 2
    return dlt
  }
  const d01 = norm(a0, a1)
  let d02 = norm(a0, a2)
  if (d01 * d02 < 0 || Math.abs(d01) > Math.abs(d02) + 1e-6) {
    d02 = d02 > 0 ? d02 - Math.PI * 2 : d02 + Math.PI * 2
  }
  a2 = a0 + d02

  const out: Pt[] = []
  const total = a2 - a0
  for (let s = 0; s <= steps; s++) {
    const ang = a0 + (total * s) / steps
    out.push({ x: center.x + r * Math.cos(ang), y: center.y + r * Math.sin(ang) })
  }
  return out
}

function buildCurve(curveType: string, points: Pt[]): Pt[] {
  const t = (curveType || 'B').toUpperCase()
  let path: Pt[]
  if (t === 'L') path = sampleLinear(points, 12)
  else if (t === 'C') path = sampleCatmull(points)
  else if (t === 'P') path = samplePerfect(points)
  else path = sampleBezier(points)
  // Drop NaNs / clamp path into a reasonable range for drawing
  return path
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p) => ({
      x: clamp(p.x, -PLAY_W * 0.25, PLAY_W * 1.25),
      y: clamp(p.y, -PLAY_H * 0.25, PLAY_H * 1.25),
    }))
}

function fitPathLength(path: Pt[], targetLen: number): Pt[] {
  if (path.length < 2 || targetLen <= 0) return path
  const { pathLen, cumLens } = pathMetrics(path)
  if (pathLen <= 0) return path
  if (pathLen > targetLen) {
    const out: Pt[] = [path[0]]
    for (let i = 1; i < path.length; i++) {
      if (cumLens[i] >= targetLen) {
        out.push(pointAlongPath(path, cumLens, pathLen, targetLen))
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

export function parseOsu(text: string): ParsedBeatmap {
  const lines = String(text || '').split(/\r?\n/)
  let section = ''
  let previewTime = 0
  let ar = 9
  let cs = 4
  let modeNum = 0
  let sliderMultiplier = 1.4
  let hasAR = false
  const timing = parseTimingPoints(lines)
  const objects: PreviewObject[] = []

  let comboNumber = 0
  let comboIndex = 0

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
    } else if (section === 'difficulty') {
      if (line.startsWith('ApproachRate:')) {
        ar = parseFloat(line.split(':')[1]) || 9
        hasAR = true
      }
      if (line.startsWith('CircleSize:')) cs = parseFloat(line.split(':')[1]) || 4
      if (line.startsWith('SliderMultiplier:')) sliderMultiplier = parseFloat(line.split(':')[1]) || 1.4
      if (line.startsWith('OverallDifficulty:') && !hasAR) {
        ar = parseFloat(line.split(':')[1]) || ar
      }
    } else if (section === 'hitobjects') {
      const p = line.split(',')
      if (p.length < 4) continue
      let x = parseFloat(p[0])
      let y = parseFloat(p[1])
      const t = parseInt(p[2], 10)
      const type = parseInt(p[3], 10) || 0
      const hitSound = parseInt(p[4], 10) || 0
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(t)) continue

      // Clamp centers into playfield — fixes broken / edge-of-world coords showing "outside"
      const clamped = clampPlayfield({ x, y })
      x = clamped.x
      y = clamped.y

      if (type & 4) {
        comboIndex = (comboIndex + 1 + ((type >> 4) & 7)) % COMBO_COLORS.length
        comboNumber = 1
      } else {
        comboNumber += 1
      }
      const color = COMBO_COLORS[comboIndex % COMBO_COLORS.length]

      if (type & 8) {
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
          if (Number.isFinite(cx) && Number.isFinite(cy)) {
            // soft-clamp control points (curves can leave field briefly)
            cps.push({
              x: clamp(cx, -PLAY_W * 0.15, PLAY_W * 1.15),
              y: clamp(cy, -PLAY_H * 0.15, PLAY_H * 1.15),
            })
          }
        }
        let path = buildCurve(curveType, cps)
        if (pixelLength > 0) path = fitPathLength(path, pixelLength)
        if (path.length < 2) path = [{ x, y }, { x: x + 40, y }]
        const { pathLen, cumLens } = pathMetrics(path)
        const tm = timingAt(timing, t)
        const pxPerBeat = sliderMultiplier * 100 * tm.sv
        const oneSlide = pxPerBeat > 0 ? (Math.max(pathLen, 1) / pxPerBeat) * tm.beatLength : 500
        const endTime = t + oneSlide * slides
        objects.push({
          kind: 'slider',
          x,
          y,
          t,
          endTime,
          slides,
          path,
          pathLen: pathLen || 1,
          cumLens,
          hitSound,
          comboIndex,
          comboNumber,
          color,
        })
        continue
      }

      objects.push({
        kind: 'circle',
        x,
        y,
        t,
        hitSound,
        comboIndex,
        comboNumber,
        color,
      })
    }
  }

  objects.sort((a, b) => a.t - b.t)
  return {
    previewTime: previewTime < 0 ? 0 : previewTime,
    ar,
    cs,
    mode: modeNum,
    objects,
  }
}

function parseRgb(color: string): [number, number, number] {
  const m = color.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
  if (!m) return [10, 132, 255]
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)]
}

function rgba(color: string, a: number): string {
  const [r, g, b] = parseRgb(color)
  return `rgba(${r},${g},${b},${clamp(a, 0, 1)})`
}

// --- Hitsounds (Web Audio, no assets) ---

function ensureAudio(rt: PreviewRuntime): AudioContext | null {
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

function playHitSound(rt: PreviewRuntime, hitSound: number) {
  if (rt.volume <= 0.001) return
  const ctx = ensureAudio(rt)
  if (!ctx) return
  const now = ctx.currentTime
  const vol = 0.22 * rt.volume

  // normal click
  const o = ctx.createOscillator()
  const g = ctx.createGain()
  o.type = 'sine'
  let freq = 920
  if (hitSound & 2) freq = 1200 // whistle
  if (hitSound & 8) freq = 700 // clap-ish
  if (hitSound & 4) freq = 420 // finish
  o.frequency.setValueAtTime(freq, now)
  o.frequency.exponentialRampToValueAtTime(freq * 0.45, now + 0.045)
  g.gain.setValueAtTime(vol, now)
  g.gain.exponentialRampToValueAtTime(0.0008, now + 0.07)
  o.connect(g)
  g.connect(ctx.destination)
  o.start(now)
  o.stop(now + 0.08)

  // soft noise transient
  try {
    const n = ctx.createBufferSource()
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.02), ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    n.buffer = buf
    const ng = ctx.createGain()
    ng.gain.setValueAtTime(vol * 0.35, now)
    ng.gain.exponentialRampToValueAtTime(0.0008, now + 0.025)
    n.connect(ng)
    ng.connect(ctx.destination)
    n.start(now)
    n.stop(now + 0.03)
  } catch {
    /* ignore */
  }
}

function fireHits(data: ParsedBeatmap, t: number, rt: PreviewRuntime) {
  if (rt.lastT < 0) rt.lastT = t
  // process hits crossed since last frame
  const from = rt.lastT
  const to = t
  rt.lastT = t
  if (to < from) return

  data.objects.forEach((o, i) => {
    if (o.kind === 'circle') {
      const key = `c${i}`
      if (o.t >= from && o.t <= to + 0.5 && !rt.fired.has(key)) {
        rt.fired.add(key)
        playHitSound(rt, o.hitSound)
      }
    } else if (o.kind === 'slider') {
      const head = `sh${i}`
      if (o.t >= from && o.t <= to + 0.5 && !rt.fired.has(head)) {
        rt.fired.add(head)
        playHitSound(rt, o.hitSound)
      }
      const tail = `st${i}`
      if (o.endTime >= from && o.endTime <= to + 0.5 && !rt.fired.has(tail)) {
        rt.fired.add(tail)
        playHitSound(rt, o.hitSound)
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
      // end position after all slides / reverses
      a.push({ t: o.endTime, p: sliderBallPos(o, o.endTime) })
    } else {
      a.push({ t: o.t, p: { x: PLAY_W / 2, y: PLAY_H / 2 } })
      a.push({ t: o.endTime, p: { x: PLAY_W / 2, y: PLAY_H / 2 } })
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
  // Active slider: stick to ball
  for (const o of data.objects) {
    if (o.kind === 'slider' && t >= o.t && t <= o.endTime) {
      return sliderBallPos(o, t)
    }
    if (o.kind === 'spinner' && t >= o.t && t <= o.endTime) {
      return { x: PLAY_W / 2, y: PLAY_H / 2 }
    }
  }

  const anchors = buildAnchors(data.objects)
  if (!anchors.length) return { x: PLAY_W / 2, y: PLAY_H / 2 }

  if (t <= anchors[0].t) {
    // ease from center toward first note
    const first = anchors[0]
    const lead = 450
    const p = first.t - t
    if (p > lead) return { x: PLAY_W / 2, y: PLAY_H / 2 }
    const u = easeInOutCubic(1 - p / lead)
    return lerp({ x: PLAY_W / 2, y: PLAY_H / 2 }, first.p, u)
  }

  for (let i = 0; i < anchors.length - 1; i++) {
    const a = anchors[i]
    const b = anchors[i + 1]
    if (t >= a.t && t <= b.t) {
      // If a slider is active between these, already handled
      const span = Math.max(1, b.t - a.t)
      // Move mostly in the last portion (osu auto dwells then snaps)
      let u = (t - a.t) / span
      // ease: stay near previous, then accelerate to next
      const shaped = easeInOutCubic(Math.pow(u, 0.85))
      return lerp(a.p, b.p, shaped)
    }
  }

  return anchors[anchors.length - 1].p
}

function updateCursor(data: ParsedBeatmap, t: number, rt: PreviewRuntime) {
  const target = autoplayTarget(data, t)
  // Smooth follow so it never teleports harshly
  const k = 0.45
  rt.cursor = {
    x: rt.cursor.x + (target.x - rt.cursor.x) * k,
    y: rt.cursor.y + (target.y - rt.cursor.y) * k,
  }
  rt.trail.push({ x: rt.cursor.x, y: rt.cursor.y })
  if (rt.trail.length > 14) rt.trail.shift()
}

// --- Drawing ---

function drawHitCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  alpha: number,
  comboNumber: number,
  scaleMul = 1
) {
  const rr = r * scaleMul
  if (rr < 1 || alpha < 0.02) return

  ctx.beginPath()
  ctx.arc(cx, cy, rr, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(255,255,255,${(0.92 * alpha).toFixed(3)})`
  ctx.fill()

  ctx.beginPath()
  ctx.arc(cx, cy, rr * 0.9, 0, Math.PI * 2)
  const grad = ctx.createRadialGradient(cx - rr * 0.25, cy - rr * 0.25, rr * 0.08, cx, cy, rr * 0.9)
  const [cr, cg, cb] = parseRgb(color)
  grad.addColorStop(
    0,
    `rgba(${Math.min(255, cr + 45)},${Math.min(255, cg + 45)},${Math.min(255, cb + 45)},${alpha})`
  )
  grad.addColorStop(0.55, rgba(color, alpha))
  grad.addColorStop(1, `rgba(${Math.max(0, cr - 55)},${Math.max(0, cg - 55)},${Math.max(0, cb - 55)},${alpha})`)
  ctx.fillStyle = grad
  ctx.fill()

  ctx.beginPath()
  ctx.arc(cx, cy, rr * 0.42, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(28,28,32,${(0.9 * alpha).toFixed(3)})`
  ctx.fill()
  ctx.strokeStyle = `rgba(255,255,255,${(0.35 * alpha).toFixed(3)})`
  ctx.lineWidth = Math.max(1, rr * 0.06)
  ctx.stroke()

  if (comboNumber > 0 && rr > 7) {
    ctx.fillStyle = `rgba(255,255,255,${(0.95 * alpha).toFixed(3)})`
    ctx.font = `bold ${Math.max(10, Math.round(rr * 0.55))}px system-ui,sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(comboNumber), cx, cy + 0.5)
  }
}

/**
 * Compress osu playfield coords so a full hitcircle of radius `insetOsu`
 * always stays inside 0…512 / 0…384 (edge notes remain fully visible).
 */
function normalizeOsuPos(p: Pt, insetOsu: number): Pt {
  const inset = clamp(insetOsu, 0, Math.min(PLAY_W, PLAY_H) * 0.35)
  const usableW = Math.max(1, PLAY_W - 2 * inset)
  const usableH = Math.max(1, PLAY_H - 2 * inset)
  const cx = clamp(p.x, 0, PLAY_W)
  const cy = clamp(p.y, 0, PLAY_H)
  return {
    x: inset + (cx / PLAY_W) * usableW,
    y: inset + (cy / PLAY_H) * usableH,
  }
}

type FieldLayout = {
  ox: number
  oy: number
  scale: number
  pfW: number
  pfH: number
  rPx: number
  insetOsu: number
  /** osu raw → screen px */
  scr: (p: Pt) => Pt
  /** max approach/burst radius at a screen point without leaving the field */
  maxRadiusAt: (sx: number, sy: number) => number
}

function makeFieldLayout(canvasW: number, canvasH: number, cs: number): FieldLayout {
  const rOsu = circleRadius(cs)
  // Room for full circle body + thin border (slider stroke is ~2r thick around path)
  const insetOsu = rOsu + 3
  const scale = Math.min(canvasW / PLAY_W, canvasH / PLAY_H)
  const pfW = PLAY_W * scale
  const pfH = PLAY_H * scale
  const ox = (canvasW - pfW) / 2
  const oy = (canvasH - pfH) / 2
  const rPx = rOsu * scale
  const pad = 1.5 // keep stroke AA inside border

  const scr = (p: Pt): Pt => {
    const n = normalizeOsuPos(p, insetOsu)
    return { x: ox + n.x * scale, y: oy + n.y * scale }
  }

  const maxRadiusAt = (sx: number, sy: number) => {
    const left = sx - ox - pad
    const right = ox + pfW - sx - pad
    const top = sy - oy - pad
    const bottom = oy + pfH - sy - pad
    return Math.max(2, Math.min(left, right, top, bottom))
  }

  return { ox, oy, scale, pfW, pfH, rPx, insetOsu, scr, maxRadiusAt }
}

function drawApproach(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  alpha: number,
  progress: number,
  maxR: number
) {
  // progress 1 = start (large), 0 = hit — capped so ring stays inside the field
  const p = clamp(progress, 0, 1)
  const ideal = r * (1 + 2.5 * p)
  const apR = Math.min(ideal, Math.max(r * 1.02, maxR))
  ctx.beginPath()
  ctx.arc(cx, cy, apR, 0, Math.PI * 2)
  ctx.strokeStyle = rgba(color, 0.8 * alpha)
  ctx.lineWidth = Math.max(1.5, r * 0.11)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy, apR, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(255,255,255,${(0.28 * alpha).toFixed(3)})`
  ctx.lineWidth = Math.max(1, r * 0.045)
  ctx.stroke()
}

function strokePathMapped(
  ctx: CanvasRenderingContext2D,
  path: Pt[],
  layout: FieldLayout
) {
  if (path.length < 2) return
  const p0 = layout.scr(path[0])
  ctx.beginPath()
  ctx.moveTo(p0.x, p0.y)
  for (let i = 1; i < path.length; i++) {
    const p = layout.scr(path[i])
    ctx.lineTo(p.x, p.y)
  }
}

function drawSliderBody(
  ctx: CanvasRenderingContext2D,
  o: Extract<PreviewObject, { kind: 'slider' }>,
  layout: FieldLayout,
  r: number,
  alpha: number
) {
  if (o.path.length < 2 || alpha < 0.02) return
  // Body width = diameter; path is normalized so this stays inside the field
  const border = r * 2.0
  const body = r * 1.72

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  strokePathMapped(ctx, o.path, layout)
  ctx.strokeStyle = `rgba(255,255,255,${(0.88 * alpha).toFixed(3)})`
  ctx.lineWidth = border
  ctx.stroke()

  strokePathMapped(ctx, o.path, layout)
  ctx.strokeStyle = rgba(o.color, 0.82 * alpha)
  ctx.lineWidth = body
  ctx.stroke()

  strokePathMapped(ctx, o.path, layout)
  ctx.strokeStyle = `rgba(18,18,22,${(0.52 * alpha).toFixed(3)})`
  ctx.lineWidth = body * 0.52
  ctx.stroke()

  const end = layout.scr(o.path[o.path.length - 1])
  const endR = Math.min(r * 0.92, layout.maxRadiusAt(end.x, end.y))
  ctx.beginPath()
  ctx.arc(end.x, end.y, endR, 0, Math.PI * 2)
  ctx.fillStyle = rgba(o.color, 0.72 * alpha)
  ctx.fill()
  ctx.strokeStyle = `rgba(255,255,255,${(0.65 * alpha).toFixed(3)})`
  ctx.lineWidth = Math.max(1.5, r * 0.09)
  ctx.stroke()
}

function drawSliderBall(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  color: string,
  alpha: number
) {
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(255,255,255,${(0.95 * alpha).toFixed(3)})`
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.52, 0, Math.PI * 2)
  ctx.fillStyle = rgba(color, 0.95 * alpha)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx - r * 0.14, cy - r * 0.14, r * 0.16, 0, Math.PI * 2)
  ctx.fillStyle = `rgba(255,255,255,${(0.5 * alpha).toFixed(3)})`
  ctx.fill()
}

function drawSpinner(
  ctx: CanvasRenderingContext2D,
  layout: FieldLayout,
  t: number,
  o: Extract<PreviewObject, { kind: 'spinner' }>,
  alpha: number
) {
  const c = layout.scr({ x: PLAY_W / 2, y: PLAY_H / 2 })
  const R = Math.min(layout.pfW, layout.pfH) * 0.28
  const progress = clamp((t - o.t) / Math.max(1, o.endTime - o.t), 0, 1)
  ctx.beginPath()
  ctx.arc(c.x, c.y, R, 0, Math.PI * 2)
  ctx.strokeStyle = `rgba(255,255,255,${(0.22 * alpha).toFixed(3)})`
  ctx.lineWidth = 4 * layout.scale
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(c.x, c.y, R, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2)
  ctx.strokeStyle = `rgba(10,132,255,${(0.85 * alpha).toFixed(3)})`
  ctx.lineWidth = 6 * layout.scale
  ctx.lineCap = 'round'
  ctx.stroke()
}

function drawCursor(ctx: CanvasRenderingContext2D, layout: FieldLayout, rt: PreviewRuntime) {
  const rNote = layout.rPx
  for (let i = 0; i < rt.trail.length; i++) {
    const p = layout.scr(rt.trail[i])
    const a = ((i + 1) / rt.trail.length) * 0.35
    const rad = rNote * 0.22 * ((i + 1) / rt.trail.length)
    ctx.beginPath()
    ctx.arc(p.x, p.y, rad, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`
    ctx.fill()
  }

  const c = layout.scr(rt.cursor)
  const cr = Math.min(Math.max(5, rNote * 0.38), layout.maxRadiusAt(c.x, c.y) * 0.9)

  ctx.beginPath()
  ctx.arc(c.x, c.y, cr * 1.25, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = Math.max(1.5, cr * 0.18)
  ctx.stroke()

  const g = ctx.createRadialGradient(c.x - cr * 0.25, c.y - cr * 0.25, 1, c.x, c.y, cr)
  g.addColorStop(0, 'rgba(255,255,255,0.95)')
  g.addColorStop(0.45, 'rgba(200,220,255,0.9)')
  g.addColorStop(1, 'rgba(90,140,255,0.85)')
  ctx.beginPath()
  ctx.arc(c.x, c.y, cr, 0, Math.PI * 2)
  ctx.fillStyle = g
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = Math.max(1, cr * 0.12)
  ctx.stroke()
}

/** osu-like alpha/scale for a circle around hit time */
function circleAnim(t: number, hitT: number, preempt: number) {
  const dt = hitT - t
  if (dt > preempt) return null
  if (dt > 0) {
    // fade in over first 40% of approach, stay solid
    const lived = preempt - dt
    const fadeIn = clamp(lived / (preempt * 0.35), 0, 1)
    // smoothstep
    const alpha = fadeIn * fadeIn * (3 - 2 * fadeIn)
    return { alpha, scale: 1, approach: dt / preempt, showBody: true, showApproach: true }
  }
  // after hit: expand + fade (hit burst)
  const age = t - hitT
  const fade = 220
  if (age > fade) return null
  const p = age / fade
  const alpha = (1 - p) * (1 - p)
  const scale = 1 + 0.4 * p
  return { alpha, scale, approach: 0, showBody: true, showApproach: false }
}

function sliderAnim(t: number, o: Extract<PreviewObject, { kind: 'slider' }>, preempt: number) {
  const appear = o.t - preempt
  const gone = o.endTime + 220
  if (t < appear || t > gone) return null

  if (t < o.t) {
    const lived = t - appear
    const fadeIn = clamp(lived / (preempt * 0.35), 0, 1)
    const alpha = fadeIn * fadeIn * (3 - 2 * fadeIn)
    return {
      alpha,
      headScale: 1,
      approach: (o.t - t) / preempt,
      showApproach: true,
      showHead: true,
      showBall: false,
      bodyAlpha: alpha,
    }
  }

  if (t <= o.endTime) {
    return {
      alpha: 1,
      headScale: 1,
      approach: 0,
      showApproach: false,
      showHead: true,
      showBall: true,
      bodyAlpha: 1,
    }
  }

  // fade after slider end
  const age = t - o.endTime
  const p = age / 220
  const alpha = (1 - p) * (1 - p)
  return {
    alpha,
    headScale: 1 + 0.25 * p,
    approach: 0,
    showApproach: false,
    showHead: true,
    showBall: false,
    bodyAlpha: alpha,
  }
}

/**
 * Draw one frame.
 * Playfield stays 512×384 (osu area). Positions are normalized so full hitcircles
 * (CS radius) always fit inside the field — edge notes remain fully visible.
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
  const layout = makeFieldLayout(canvasW, canvasH, data.cs)
  const { ox, oy, scale, pfW, pfH } = layout
  const preempt = approachMs(data.ar)
  const r = layout.rPx
  const runtime = rt

  if (runtime) {
    fireHits(data, t, runtime)
    updateCursor(data, t, runtime)
  }

  ctx.clearRect(0, 0, canvasW, canvasH)
  ctx.fillStyle = '#0b0b10'
  ctx.fillRect(0, 0, canvasW, canvasH)

  const pfGrad = ctx.createLinearGradient(ox, oy, ox, oy + pfH)
  pfGrad.addColorStop(0, '#16161c')
  pfGrad.addColorStop(1, '#101016')
  ctx.fillStyle = pfGrad
  ctx.fillRect(ox, oy, pfW, pfH)

  ctx.save()
  ctx.beginPath()
  ctx.rect(ox, oy, pfW, pfH)
  ctx.clip()

  // grid (raw 64px osu grid, not normalized — visual reference)
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

  /**
   * Paint order (bottom → top):
   * 1) already-hit / fading notes (old)
   * 2) still approaching (by hit time ascending)
   * 3) active sliders
   * Within a group, earlier hit first so later (newer) notes end up on top.
   * Two passes: approaches+slider paths first, then solid circles/heads — so a
   * new note body is never buried under an old approach ring or hit-burst.
   */
  type DrawItem = {
    o: PreviewObject
    i: number
    phase: number
    anim: ReturnType<typeof circleAnim> | ReturnType<typeof sliderAnim> | { alpha: number }
  }

  function phaseOf(o: PreviewObject, now: number): number {
    if (o.kind === 'circle') {
      if (now >= o.t) return 0 // fading / past
      return 1 // approaching — newer stream notes sit above past hits
    }
    if (o.kind === 'slider') {
      if (now > o.endTime) return 0
      if (now >= o.t) return 2 // active
      return 1
    }
    // spinner
    if (now > o.endTime) return 0
    if (now >= o.t) return 2
    return 1
  }

  const drawItems: DrawItem[] = []
  data.objects.forEach((o, i) => {
    if (o.kind === 'circle') {
      const anim = circleAnim(t, o.t, preempt)
      if (!anim) return
      drawItems.push({ o, i, phase: phaseOf(o, t), anim })
    } else if (o.kind === 'slider') {
      const anim = sliderAnim(t, o, preempt)
      if (!anim) return
      drawItems.push({ o, i, phase: phaseOf(o, t), anim })
    } else if (o.kind === 'spinner') {
      if (t < o.t - 100 || t > o.endTime + 100) return
      const alpha =
        t < o.t
          ? clamp(1 - (o.t - t) / 100, 0, 1)
          : t > o.endTime
            ? clamp(1 - (t - o.endTime) / 100, 0, 1)
            : 1
      drawItems.push({ o, i, phase: phaseOf(o, t), anim: { alpha } })
    }
  })

  // Earlier phase first; within phase earlier hit time first → latest painted last = on top
  drawItems.sort((a, b) => a.phase - b.phase || a.o.t - b.o.t || a.i - b.i)

  // Pass A: slider bodies + approach rings (under)
  for (const item of drawItems) {
    const { o, anim } = item
    if (o.kind === 'slider') {
      const sa = anim as NonNullable<ReturnType<typeof sliderAnim>>
      drawSliderBody(ctx, o, layout, r, sa.bodyAlpha)
      if (sa.showApproach && sa.approach > 0) {
        const c = layout.scr({ x: o.x, y: o.y })
        const maxR = layout.maxRadiusAt(c.x, c.y)
        const drawR = Math.min(r, maxR / Math.max(sa.headScale, 1))
        drawApproach(ctx, c.x, c.y, drawR, o.color, sa.alpha, sa.approach, maxR)
      }
    } else if (o.kind === 'circle') {
      const ca = anim as NonNullable<ReturnType<typeof circleAnim>>
      if (ca.showApproach && ca.approach > 0) {
        const c = layout.scr({ x: o.x, y: o.y })
        const maxR = layout.maxRadiusAt(c.x, c.y)
        const drawR = Math.min(r, maxR / Math.max(ca.scale, 1))
        drawApproach(ctx, c.x, c.y, drawR, o.color, ca.alpha, ca.approach, maxR)
      }
    } else if (o.kind === 'spinner') {
      drawSpinner(ctx, layout, t, o, (anim as { alpha: number }).alpha)
    }
  }

  // Pass B: solid notes (over approaches and older notes)
  for (const item of drawItems) {
    const { o, anim } = item
    if (o.kind === 'circle') {
      const ca = anim as NonNullable<ReturnType<typeof circleAnim>>
      if (!ca.showBody) continue
      const c = layout.scr({ x: o.x, y: o.y })
      const maxR = layout.maxRadiusAt(c.x, c.y)
      const drawR = Math.min(r, maxR / Math.max(ca.scale, 1))
      drawHitCircle(ctx, c.x, c.y, drawR, o.color, ca.alpha, o.comboNumber, ca.scale)
    } else if (o.kind === 'slider') {
      const sa = anim as NonNullable<ReturnType<typeof sliderAnim>>
      const c = layout.scr({ x: o.x, y: o.y })
      const maxR = layout.maxRadiusAt(c.x, c.y)
      const drawR = Math.min(r, maxR / Math.max(sa.headScale, 1))
      if (sa.showHead) {
        drawHitCircle(ctx, c.x, c.y, drawR, o.color, sa.alpha, o.comboNumber, sa.headScale)
      }
      if (sa.showBall) {
        const bp = layout.scr(sliderBallPos(o, t))
        const br = Math.min(r, layout.maxRadiusAt(bp.x, bp.y))
        drawSliderBall(ctx, bp.x, bp.y, br, o.color, sa.alpha)
      }
    }
  }

  // Cursor always on top of notes
  if (runtime) {
    drawCursor(ctx, layout, runtime)
  }

  ctx.restore()

  ctx.fillStyle = '#0b0b10'
  if (oy > 0.5) ctx.fillRect(0, 0, canvasW, oy)
  if (oy + pfH < canvasH - 0.5) ctx.fillRect(0, oy + pfH, canvasW, canvasH - oy - pfH)
  if (ox > 0.5) ctx.fillRect(0, oy, ox, pfH)
  if (ox + pfW < canvasW - 0.5) ctx.fillRect(ox + pfW, oy, canvasW - ox - pfW, pfH)

  ctx.strokeStyle = 'rgba(255,255,255,0.16)'
  ctx.lineWidth = 1.5
  ctx.strokeRect(ox + 0.5, oy + 0.5, pfW - 1, pfH - 1)

  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.font = '12px system-ui,sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(`${(t / 1000).toFixed(1)}s`, 8, 16)

  return elapsed <= 12000
}
