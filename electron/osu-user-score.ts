/**
 * Resolve personal best for a specific difficulty:
 * 1) Local scores.db (by beatmap MD5) — works in song select, per-difficulty
 * 2) Online osu! top-100 for that beatmap_id — only source of real world #rank
 *
 * Never use in-game live leaderboard slots (those are ~top-50 board indices, not world rank).
 */

import { lookupLocalScore } from './osu-scores-db'

export interface OnlineBeatmapScore {
  played: boolean
  /** Global leaderboard position when known from online top list; null otherwise */
  position: number | null
  grade: string
  score: number
  accuracy: number
  maxCombo: number
  mods: string
  pp: number | null
  source: 'local' | 'online' | 'none'
}

const EMPTY: OnlineBeatmapScore = {
  played: false,
  position: null,
  grade: '',
  score: 0,
  accuracy: 0,
  maxCombo: 0,
  mods: '',
  pp: null,
  source: 'none',
}

const SCORE_TTL_MS = 3 * 60_000
const FETCH_TIMEOUT_MS = 8_000
/** osu! web only returns a limited global window — never invent ranks beyond it */
const ONLINE_TOP_LIMIT = 100

type CacheEntry<T> = { at: number; value: T }

const scoreCache = new Map<string, CacheEntry<OnlineBeatmapScore>>()
const inflight = new Map<string, Promise<OnlineBeatmapScore>>()

function modeToRuleset(mode: string): string {
  switch (mode) {
    case 'taiko':
      return 'taiko'
    case 'catch':
    case 'fruits':
      return 'fruits'
    case 'mania':
      return 'mania'
    default:
      return 'osu'
  }
}

function modeToDbMode(mode: string): number {
  switch (mode) {
    case 'taiko':
      return 1
    case 'catch':
    case 'fruits':
      return 2
    case 'mania':
      return 3
    default:
      return 0
  }
}

function scoreKey(
  userId: number,
  beatmapId: number,
  checksum: string,
  mode: string
) {
  return `${userId}:${beatmapId}:${checksum.toLowerCase()}:${modeToRuleset(mode)}`
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'tosu-gui',
      },
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

interface OsuWebScore {
  user_id?: number
  beatmap_id?: number
  rank?: string
  accuracy?: number
  total_score?: number
  classic_total_score?: number
  legacy_total_score?: number
  max_combo?: number
  pp?: number | null
  passed?: boolean
  mods?: { acronym?: string }[]
  beatmap?: { id?: number }
}

function parseWebScore(raw: OsuWebScore, position: number | null): OnlineBeatmapScore {
  const acc = typeof raw.accuracy === 'number' ? raw.accuracy : 0
  const score =
    (typeof raw.total_score === 'number' && raw.total_score) ||
    (typeof raw.classic_total_score === 'number' && raw.classic_total_score) ||
    (typeof raw.legacy_total_score === 'number' && raw.legacy_total_score) ||
    0
  const grade = typeof raw.rank === 'string' ? raw.rank : ''
  const mods = Array.isArray(raw.mods)
    ? raw.mods.map((m) => m.acronym).filter(Boolean).join('')
    : ''
  const played = raw.passed !== false && (score > 0 || grade.length > 0)

  return {
    played,
    position,
    grade,
    score,
    accuracy: Math.round((acc > 0 && acc <= 1 ? acc * 100 : acc) * 100) / 100,
    maxCombo: typeof raw.max_combo === 'number' ? raw.max_combo : 0,
    mods,
    pp: typeof raw.pp === 'number' ? raw.pp : null,
    source: 'online',
  }
}

/**
 * World rank only when the player appears in the public top list for THIS beatmap id.
 * Index in that list is the real global position (#1 … #limit). Never extrapolate.
 */
async function findGlobalRank(
  userId: number,
  beatmapId: number,
  mode: string
): Promise<OnlineBeatmapScore | null> {
  if (!userId || !beatmapId) return null
  const ruleset = modeToRuleset(mode)
  const data = await fetchJson<{ scores?: OsuWebScore[] }>(
    `https://osu.ppy.sh/beatmaps/${beatmapId}/scores?mode=${ruleset}&type=global&limit=${ONLINE_TOP_LIMIT}`
  )
  const scores = data?.scores
  if (!Array.isArray(scores) || scores.length === 0) return null

  const idx = scores.findIndex((s) => s.user_id === userId)
  if (idx < 0) return null
  // Verify row is for this difficulty when beatmap_id is present
  const row = scores[idx]
  if (typeof row.beatmap_id === 'number' && row.beatmap_id > 0 && row.beatmap_id !== beatmapId) {
    return null
  }
  return parseWebScore(row, idx + 1)
}

export interface ScoreLookupInput {
  userId: number
  userName: string
  beatmapId: number
  beatmapChecksum: string
  mode: string
  /** osu! install folder (from tosu folders.game) for scores.db */
  osuPath: string
}

/**
 * Resolve PB for the currently selected difficulty only.
 */
export async function lookupUserBeatmapScore(
  input: ScoreLookupInput
): Promise<OnlineBeatmapScore> {
  const userId = Number(input.userId) || 0
  const beatmapId = Number(input.beatmapId) || 0
  const checksum = (input.beatmapChecksum || '').trim()
  const mode = input.mode || 'osu'
  const userName = input.userName || ''
  const osuPath = input.osuPath || ''

  if (!checksum && beatmapId <= 0) return EMPTY

  const key = scoreKey(userId, beatmapId, checksum, mode)
  const cached = scoreCache.get(key)
  if (cached && Date.now() - cached.at < SCORE_TTL_MS) {
    return cached.value
  }

  const existing = inflight.get(key)
  if (existing) return existing

  const task = (async (): Promise<OnlineBeatmapScore> => {
    // 1) Local difficulty score (menu + offline) — keyed by MD5 of THIS .osu
    let local: OnlineBeatmapScore | null = null
    if (checksum && osuPath) {
      const raw = lookupLocalScore(osuPath, checksum, userName)
      const wantMode = modeToDbMode(mode)
      if (raw.played && (raw.mode === wantMode || raw.mode === 0 || mode === 'osu')) {
        // Prefer exact mode match; allow mode 0 when profile mode is osu
        if (raw.mode === wantMode || (wantMode === 0 && raw.mode === 0)) {
          local = {
            played: true,
            position: null,
            grade: raw.grade,
            score: raw.score,
            accuracy: raw.accuracy,
            maxCombo: raw.maxCombo,
            mods: raw.modsText,
            pp: null,
            source: 'local',
          }
        }
      }
      // If mode filter rejected, still accept if only one mode of scores
      if (!local && raw.played) {
        local = {
          played: true,
          position: null,
          grade: raw.grade,
          score: raw.score,
          accuracy: raw.accuracy,
          maxCombo: raw.maxCombo,
          mods: raw.modsText,
          pp: null,
          source: 'local',
        }
      }
    }

    // 2) Online world rank for THIS beatmap id only (top-100 window)
    let online: OnlineBeatmapScore | null = null
    if (userId > 0 && beatmapId > 0) {
      online = await findGlobalRank(userId, beatmapId, mode)
    }

    let result = EMPTY
    if (local?.played && online?.played) {
      result = {
        played: true,
        position: online.position,
        grade: online.grade || local.grade,
        score: Math.max(local.score, online.score),
        accuracy: online.accuracy || local.accuracy,
        maxCombo: Math.max(local.maxCombo, online.maxCombo),
        mods: online.mods || local.mods,
        pp: online.pp,
        source: 'online',
      }
    } else if (online?.played) {
      result = online
    } else if (local?.played) {
      result = local
    }

    scoreCache.set(key, { at: Date.now(), value: result })
    return result
  })()

  inflight.set(key, task)
  try {
    return await task
  } finally {
    inflight.delete(key)
  }
}

/** @deprecated kept for simple call sites — prefer full input object */
export async function lookupUserBeatmapScoreLegacy(
  userId: number,
  beatmapId: number,
  mode: string
): Promise<OnlineBeatmapScore> {
  return lookupUserBeatmapScore({
    userId,
    userName: '',
    beatmapId,
    beatmapChecksum: '',
    mode,
    osuPath: '',
  })
}
