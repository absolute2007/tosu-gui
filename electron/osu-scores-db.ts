/**
 * Read local osu!stable scores.db — keyed by beatmap MD5 (difficulty checksum).
 * This is the only reliable offline source for "passed this difficulty" in song select.
 */

import fs from 'fs'
import path from 'path'

export interface LocalBeatmapScore {
  played: boolean
  grade: string
  score: number
  accuracy: number
  maxCombo: number
  mods: number
  modsText: string
  timestamp: number
  onlineId: number
  mode: number
}

const EMPTY: LocalBeatmapScore = {
  played: false,
  grade: '',
  score: 0,
  accuracy: 0,
  maxCombo: 0,
  mods: 0,
  modsText: '',
  timestamp: 0,
  onlineId: 0,
  mode: 0,
}

interface Cache {
  mtimeMs: number
  size: number
  /** md5(lower) → best score for playerName (or any if name empty) */
  byMd5: Map<string, LocalBeatmapScore>
}

const fileCache = new Map<string, Cache>()

class DbReader {
  private view: DataView
  private offset = 0
  private buf: Buffer

  constructor(buf: Buffer) {
    this.buf = buf
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  }

  get remaining() {
    return this.buf.length - this.offset
  }

  u8() {
    const v = this.view.getUint8(this.offset)
    this.offset += 1
    return v
  }

  i16() {
    const v = this.view.getInt16(this.offset, true)
    this.offset += 2
    return v
  }

  i32() {
    const v = this.view.getInt32(this.offset, true)
    this.offset += 4
    return v
  }

  i64() {
    // scores.db timestamps / ids fit in safe integer range for practical purposes
    const lo = this.view.getUint32(this.offset, true)
    const hi = this.view.getInt32(this.offset + 4, true)
    this.offset += 8
    return hi * 0x1_0000_0000 + lo
  }

  bool() {
    return this.u8() !== 0
  }

  /** ULEB128 */
  private uleb() {
    let result = 0
    let shift = 0
    for (;;) {
      const b = this.u8()
      result |= (b & 0x7f) << shift
      if ((b & 0x80) === 0) break
      shift += 7
      if (shift > 35) throw new Error('uleb overflow')
    }
    return result
  }

  str(): string {
    if (this.remaining <= 0) return ''
    const flag = this.u8()
    if (flag === 0x00) return ''
    if (flag !== 0x0b) {
      // Unexpected — try to resync poorly; treat as empty
      return ''
    }
    const len = this.uleb()
    if (len <= 0) return ''
    if (this.offset + len > this.buf.length) throw new Error('string OOB')
    const s = this.buf.toString('utf8', this.offset, this.offset + len)
    this.offset += len
    return s
  }
}

const MOD_ACRONYMS: [number, string][] = [
  [1 << 0, 'NF'],
  [1 << 1, 'EZ'],
  [1 << 2, 'TD'],
  [1 << 3, 'HD'],
  [1 << 4, 'HR'],
  [1 << 5, 'SD'],
  [1 << 6, 'DT'],
  [1 << 7, 'RX'],
  [1 << 8, 'HT'],
  [1 << 9, 'NC'],
  [1 << 10, 'FL'],
  [1 << 12, 'SO'],
  [1 << 14, 'PF'],
]

function modsToText(mods: number): string {
  // NC implies DT in bitfield — show NC only
  let m = mods
  if (m & (1 << 9)) m &= ~(1 << 6)
  if (m & (1 << 14)) m &= ~(1 << 5)
  const parts: string[] = []
  for (const [bit, name] of MOD_ACRONYMS) {
    if (m & bit) parts.push(name)
  }
  return parts.join('')
}

function gradeFromHits(
  mode: number,
  c300: number,
  c100: number,
  c50: number,
  cGeki: number,
  cKatu: number,
  cMiss: number,
  mods: number,
  perfect: boolean
): string {
  // osu!standard letter grade (simplified, matches client closely enough for UI)
  if (mode === 0) {
    const total = c300 + c100 + c50 + cMiss
    if (total <= 0) return ''
    const acc = (300 * c300 + 100 * c100 + 50 * c50) / (300 * total)
    const silver = (mods & ((1 << 3) | (1 << 10))) !== 0 // HD or FL
    if (c300 === total) return silver ? 'XH' : 'X'
    if (acc > 0.9 && c50 === 0 && cMiss === 0) return silver ? 'SH' : 'S'
    if (acc > 0.8 && cMiss === 0) return 'A'
    if (acc > 0.9) return 'A'
    if (acc > 0.7 && cMiss === 0) return 'B'
    if (acc > 0.8) return 'B'
    if (acc > 0.6) return 'C'
    return 'D'
  }
  // Other modes: perfect flag + rough accuracy
  if (perfect) return 'X'
  const total =
    mode === 3
      ? c300 + cGeki + cKatu + c100 + c50 + cMiss
      : c300 + c100 + c50 + cMiss
  if (total <= 0) return 'D'
  return 'A'
}

function accuracyFromHits(
  mode: number,
  c300: number,
  c100: number,
  c50: number,
  cGeki: number,
  cKatu: number,
  cMiss: number
): number {
  if (mode === 0) {
    const total = c300 + c100 + c50 + cMiss
    if (total <= 0) return 0
    return ((300 * c300 + 100 * c100 + 50 * c50) / (300 * total)) * 100
  }
  if (mode === 1) {
    // taiko
    const total = c300 + c100 + cMiss
    if (total <= 0) return 0
    return ((c300 * 300 + c100 * 150) / (total * 300)) * 100
  }
  if (mode === 2) {
    // catch
    const total = c300 + c100 + c50 + cMiss + cKatu
    if (total <= 0) return 0
    return ((c300 + c100 + c50) / total) * 100
  }
  // mania
  const total = c300 + cGeki + cKatu + c100 + c50 + cMiss
  if (total <= 0) return 0
  return (
    ((c300 + cGeki) * 300 + cKatu * 200 + c100 * 100 + c50 * 50) /
    (total * 300) *
    100
  )
}

function preferScore(a: LocalBeatmapScore, b: LocalBeatmapScore): LocalBeatmapScore {
  if (!a.played) return b
  if (!b.played) return a
  if (b.score !== a.score) return b.score > a.score ? b : a
  return b.timestamp >= a.timestamp ? b : a
}

function parseScoresDb(buf: Buffer, playerName: string): Map<string, LocalBeatmapScore> {
  const r = new DbReader(buf)
  r.i32() // version
  const beatmapCount = r.i32()
  const wantName = playerName.trim().toLowerCase()
  const byMd5 = new Map<string, LocalBeatmapScore>()

  for (let i = 0; i < beatmapCount; i++) {
    if (r.remaining <= 0) break
    const md5 = r.str().toLowerCase()
    const scoreCount = r.i32()
    if (scoreCount < 0 || scoreCount > 10_000) break

    for (let s = 0; s < scoreCount; s++) {
      if (r.remaining < 4) break
      const mode = r.u8()
      r.i32() // score version / client version
      r.str() // beatmap md5 again
      const name = r.str()
      r.str() // replay md5
      const c300 = r.i16() & 0xffff
      const c100 = r.i16() & 0xffff
      const c50 = r.i16() & 0xffff
      const cGeki = r.i16() & 0xffff
      const cKatu = r.i16() & 0xffff
      const cMiss = r.i16() & 0xffff
      const score = r.i32() >>> 0
      const maxCombo = r.i16() & 0xffff
      const perfect = r.bool()
      const mods = r.i32() >>> 0
      r.str() // life bar graph
      const timestamp = r.i64()
      r.i32() // always -1
      const onlineId = r.i64()

      if (!md5) continue
      if (wantName && name.trim().toLowerCase() !== wantName) continue
      if (score <= 0 && c300 + c100 + c50 === 0) continue

      const acc = accuracyFromHits(mode, c300, c100, c50, cGeki, cKatu, cMiss)
      const grade = gradeFromHits(mode, c300, c100, c50, cGeki, cKatu, cMiss, mods, perfect)
      const entry: LocalBeatmapScore = {
        played: true,
        grade,
        score,
        accuracy: Math.round(acc * 100) / 100,
        maxCombo,
        mods,
        modsText: modsToText(mods),
        timestamp,
        onlineId,
        mode,
      }

      const prev = byMd5.get(md5)
      byMd5.set(md5, prev ? preferScore(prev, entry) : entry)
    }
  }

  return byMd5
}

function resolveScoresDbPath(osuDir: string): string | null {
  if (!osuDir) return null
  const candidates = [
    path.join(osuDir, 'scores.db'),
    path.join(osuDir, 'Scores.db'),
  ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p
    } catch {
      /* continue */
    }
  }
  return null
}

/**
 * Best local score for a difficulty (by .osu MD5 checksum).
 * playerName filters to the logged-in profile when provided.
 */
export function lookupLocalScore(
  osuDir: string,
  beatmapChecksum: string,
  playerName: string
): LocalBeatmapScore {
  const md5 = beatmapChecksum.trim().toLowerCase()
  if (!osuDir || !md5 || md5.length < 16) return EMPTY

  const dbPath = resolveScoresDbPath(osuDir)
  if (!dbPath) return EMPTY

  let st: fs.Stats
  try {
    st = fs.statSync(dbPath)
  } catch {
    return EMPTY
  }

  const cacheKey = `${dbPath}|${playerName.trim().toLowerCase()}`
  let cache = fileCache.get(cacheKey)
  if (!cache || cache.mtimeMs !== st.mtimeMs || cache.size !== st.size) {
    try {
      // Cap read size — pathological files should not freeze the app
      if (st.size > 400 * 1024 * 1024) return EMPTY
      const buf = fs.readFileSync(dbPath)
      const byMd5 = parseScoresDb(buf, playerName)
      cache = { mtimeMs: st.mtimeMs, size: st.size, byMd5 }
      fileCache.set(cacheKey, cache)
    } catch (err) {
      console.warn('[scores.db] parse failed:', err)
      return EMPTY
    }
  }

  return cache.byMd5.get(md5) ?? EMPTY
}
