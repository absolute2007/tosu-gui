import { useEffect, useRef, useState } from 'react'

/**
 * After this quiet period we probe /json/v2.
 * tosu keeps the WS open when osu! exits and may also skip frames while idle,
 * so we never disconnect on silence alone — only after a failed probe.
 */
const OSU_STALE_MS = 2000
const OSU_PROBE_TIMEOUT_MS = 1200

export interface BeatmapPlayerScore {
  /** True when a personal best / leaderboard entry exists for the current user */
  played: boolean
  failed: boolean
  /** Global/local board position if known */
  position: number | null
  /** Letter grade e.g. SS, S, A */
  grade: string
  score: number
  accuracy: number
  maxCombo: number
  mods: string
}

export interface GameState {
  connected: boolean
  bridgeConnected: boolean
  state: string
  /** Meaningful map selected in-game (not empty / default placeholder) */
  hasBeatmap: boolean
  profileId: number
  profileName: string
  beatmapTitle: string
  beatmapArtist: string
  beatmapMapper: string
  beatmapVersion: string
  beatmapId: number
  beatmapSetId: number
  beatmapChecksum: string
  beatmapStatus: string
  coverUrl: string
  ppCurrent: number
  ppFc: number
  accuracy: number
  combo: number
  maxCombo: number
  hp: number
  mods: string
  mode: string
  bpm: number
  ar: number
  cs: number
  od: number
  stars: number
  /** osu! install path (for local scores.db) */
  osuPath: string
  /**
   * Only set from result screen for the current map — not live leaderboard.
   * Live board positions are NOT world ranks and must not drive "passed".
   */
  playerScore: BeatmapPlayerScore
}

const EMPTY_SCORE: BeatmapPlayerScore = {
  played: false,
  failed: false,
  position: null,
  grade: '',
  score: 0,
  accuracy: 0,
  maxCombo: 0,
  mods: '',
}

export const EMPTY_GAME_STATE: GameState = {
  connected: false,
  bridgeConnected: false,
  state: 'menu',
  hasBeatmap: false,
  profileId: 0,
  profileName: '',
  beatmapTitle: '—',
  beatmapArtist: '—',
  beatmapMapper: '—',
  beatmapVersion: '',
  beatmapId: 0,
  beatmapSetId: 0,
  beatmapChecksum: '',
  beatmapStatus: '',
  coverUrl: '',
  ppCurrent: 0,
  ppFc: 0,
  accuracy: 0,
  combo: 0,
  maxCombo: 0,
  hp: 0,
  mods: '',
  mode: 'osu',
  bpm: 0,
  ar: 0,
  cs: 0,
  od: 0,
  stars: 0,
  osuPath: '',
  playerScore: EMPTY_SCORE,
}

const STATE_NAMES = [
  'menu',
  'edit',
  'play',
  'exit',
  'selectEdit',
  'selectPlay',
  'selectDrawings',
  'resultScreen',
  'update',
  'busy',
  'unknown',
  'lobby',
  'matchSetup',
  'selectMulti',
  'rankingVs',
  'onlineSelection',
  'optionsOffsetWizard',
  'rankingTagCoop',
  'rankingTeam',
  'beatmapImport',
  'packageUpdater',
  'benchmark',
  'tourney',
  'charts',
]

const MODES = ['osu', 'taiko', 'catch', 'mania']

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {}
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

/** v2 stats are often `{ original, converted }`; older payloads may send a bare number. */
function statValue(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const o = asRecord(v)
  if (typeof o.converted === 'number' && Number.isFinite(o.converted) && o.converted !== 0) {
    return o.converted
  }
  if (typeof o.original === 'number' && Number.isFinite(o.original)) return o.original
  if (typeof o.total === 'number' && Number.isFinite(o.total)) return o.total
  if (typeof o.live === 'number' && Number.isFinite(o.live)) return o.live
  return 0
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function isOsuProcessAttached(data: Record<string, unknown>): boolean {
  // Explicit error payloads from tosu when the process is gone
  if (typeof data.error === 'string' && /osu/i.test(data.error)) return false

  const profile = asRecord(data.profile)
  const settings = asRecord(data.settings)
  const client = asRecord(settings.client)
  const folders = asRecord(data.folders)
  const userStatus = asRecord(profile.userStatus)
  const instance = asRecord(data.instance)

  if (instance.found === true || instance.status === 'connected') return true
  if (typeof data.client === 'string' && data.client.length > 0 && data.client !== 'unknown') {
    return true
  }

  // Live client version only present while the process is readable
  if (typeof client.version === 'string' && client.version.length > 0) return true
  if (typeof folders.game === 'string' && folders.game.length > 0) return true

  if (typeof profile.id === 'number' && profile.id > 0) return true
  if (typeof profile.name === 'string' && profile.name.trim().length > 0) return true
  if (typeof userStatus.name === 'string' && userStatus.name.length > 0) return true

  // Presence of a real game state object from v2
  const state = asRecord(data.state)
  if (typeof state.number === 'number' || typeof state.name === 'string') return true

  return false
}

function resolveStateName(data: Record<string, unknown>): string {
  const state = asRecord(data.state)
  const menu = asRecord(data.menu)

  if (typeof state.number === 'number') {
    return STATE_NAMES[state.number] ?? asString(state.name, 'menu').toLowerCase()
  }
  if (typeof menu.stateNumber === 'number') {
    return STATE_NAMES[menu.stateNumber] ?? 'menu'
  }
  if (typeof menu.state === 'number') {
    return STATE_NAMES[menu.state] ?? 'menu'
  }
  if (typeof state.name === 'string' && state.name) {
    return state.name.toLowerCase()
  }
  return 'menu'
}

function resolveMods(play: Record<string, unknown>, beatmap: Record<string, unknown>): string {
  const playMods = asRecord(play.mods)
  if (typeof playMods.name === 'string' && playMods.name) {
    return playMods.name.replace(/\s+/g, '')
  }

  const bmMods = beatmap.mods
  if (Array.isArray(bmMods)) {
    return bmMods
      .map((m) => asString(asRecord(m).acronym))
      .filter(Boolean)
      .join('')
  }
  return ''
}

function hasMeaningfulBeatmap(beatmap: Record<string, unknown>, title: string, artist: string): boolean {
  const checksum = asString(beatmap.checksum)
  const version = asString(beatmap.version).trim()
  const id = asNumber(beatmap.id)
  const set = asNumber(beatmap.set, -1)
  const mapper = asString(beatmap.mapper).trim()

  if (!title || title === '—' || title === 'circles!') {
    // Default peppy circles! on first boot without a real selection
    if (set <= 0 && id <= 0 && !version && !checksum) return false
  }
  if (!artist && !title) return false
  if (set < 0 && id <= 0 && !checksum && !version && !mapper) return false
  if (checksum || version || id > 0 || set > 0) return true
  return Boolean(title && title !== '—' && artist && artist !== '—')
}

/**
 * Live in-game leaderboard is intentionally ignored:
 * - position is the on-screen board slot (~1–50), not world rank
 * - during play it always "looks passed" for the current attempt
 * - it is not bound cleanly to difficulty when switching maps
 *
 * Only the result screen reflects a finished play of the current difficulty.
 */
function findPlayerScore(
  profile: Record<string, unknown>,
  play: Record<string, unknown>,
  results: Record<string, unknown>,
  gameStateName: string
): BeatmapPlayerScore {
  if (gameStateName !== 'resultScreen') return EMPTY_SCORE

  const profileName = asString(profile.name).trim().toLowerCase()
  const playName = asString(play.playerName).trim().toLowerCase()
  const resultName = asString(results.playerName ?? results.name).trim().toLowerCase()
  const resultScore = asNumber(results.score)
  const resultGrade = asString(results.rank)
  const resultAcc = asNumber(results.accuracy)

  if (resultScore <= 0 && !resultGrade) return EMPTY_SCORE
  if (
    profileName &&
    resultName &&
    resultName !== profileName &&
    resultName !== playName
  ) {
    return EMPTY_SCORE
  }

  return {
    played: true,
    failed: false,
    position: null,
    grade: resultGrade,
    score: resultScore,
    accuracy: round2(resultAcc > 0 && resultAcc <= 1 ? resultAcc * 100 : resultAcc),
    maxCombo: asNumber(results.maxCombo),
    mods: asString(asRecord(results.mods).name).replace(/\s+/g, ''),
  }
}

function parseState(data: Record<string, unknown>, baseUrl: string, includePanel: boolean): GameState {
  const connected = isOsuProcessAttached(data)
  if (!connected) {
    return { ...EMPTY_GAME_STATE, bridgeConnected: true }
  }

  const menu = asRecord(data.menu)
  const play = asRecord(data.play)
  const beatmap = asRecord(data.beatmap)
  const profile = asRecord(data.profile)
  const results = asRecord(data.resultsScreen)
  const stats = asRecord(beatmap.stats)
  const playPp = asRecord(play.pp)
  // Legacy / gosu-style top-level pp
  const topPp = asRecord(data.pp)
  const menuBm = asRecord(menu.bm)

  const title =
    asString(beatmap.title) ||
    asString(menuBm.title) ||
    asString(menu.bmTitle) ||
    '—'
  const artist =
    asString(beatmap.artist) ||
    asString(menuBm.artist) ||
    asString(menu.bmArtist) ||
    '—'
  const mapper = asString(beatmap.mapper) || '—'
  const version = asString(beatmap.version)
  const checksum = asString(beatmap.checksum)
  const beatmapId = asNumber(beatmap.id)
  const beatmapSetId = asNumber(beatmap.set)
  const hasBeatmap = hasMeaningfulBeatmap(beatmap, title, artist)

  const modeNum =
    asNumber(asRecord(play.mode).number, -1) >= 0
      ? asNumber(asRecord(play.mode).number)
      : asNumber(asRecord(profile.mode).number)

  const bpmCommon = asNumber(asRecord(stats.bpm).common) || asNumber(asRecord(beatmap.bpm).common)
  const stars = statValue(asRecord(stats.stars).total) || statValue(stats.stars)

  const health = asRecord(play.healthBar)
  const hpRaw =
    typeof health.normal === 'number'
      ? health.normal
      : asNumber(asRecord(play.hp).current)

  let coverUrl = ''
  if (includePanel && hasBeatmap && baseUrl) {
    const root = baseUrl.replace(/\/$/, '')
    const bust = checksum || String(beatmapId) || String(beatmapSetId)
    coverUrl = `${root}/files/beatmap/background${bust ? `?v=${encodeURIComponent(bust)}` : ''}`
  }

  const stateName = resolveStateName(data)
  const playerScore = includePanel
    ? findPlayerScore(profile, play, results, stateName)
    : EMPTY_SCORE

  const statusObj = asRecord(beatmap.status)
  const folders = asRecord(data.folders)
  const playAcc = asNumber(play.accuracy)

  return {
    connected: true,
    bridgeConnected: true,
    state: stateName,
    hasBeatmap,
    profileId: asNumber(profile.id),
    profileName: asString(profile.name),
    beatmapTitle: title,
    beatmapArtist: artist,
    beatmapMapper: mapper,
    beatmapVersion: version,
    beatmapId,
    beatmapSetId,
    beatmapChecksum: checksum,
    beatmapStatus: asString(statusObj.name) || String(statusObj.number ?? ''),
    coverUrl,
    ppCurrent: round2(asNumber(playPp.current) || asNumber(topPp.current)),
    ppFc: round2(asNumber(playPp.fc) || asNumber(topPp.fc)),
    accuracy: round2(playAcc > 0 && playAcc <= 1 ? playAcc * 100 : playAcc),
    combo: asNumber(asRecord(play.combo).current),
    maxCombo: asNumber(stats.maxCombo) || asNumber(beatmap.maxCombo),
    hp: Math.round(hpRaw <= 1 ? hpRaw * 100 : hpRaw),
    mods: resolveMods(play, beatmap),
    mode: MODES[modeNum] ?? 'osu',
    bpm: Math.round(bpmCommon),
    ar: round2(statValue(stats.ar)),
    cs: round2(statValue(stats.cs)),
    od: round2(statValue(stats.od)),
    stars: round2(stars),
    osuPath: asString(folders.game),
    playerScore,
  }
}

/** Cheap equality — skip React updates when the frame did not change visible fields. */
function gameStateEqual(a: GameState, b: GameState): boolean {
  return (
    a.connected === b.connected &&
    a.bridgeConnected === b.bridgeConnected &&
    a.state === b.state &&
    a.hasBeatmap === b.hasBeatmap &&
    a.profileId === b.profileId &&
    a.profileName === b.profileName &&
    a.beatmapTitle === b.beatmapTitle &&
    a.beatmapArtist === b.beatmapArtist &&
    a.beatmapMapper === b.beatmapMapper &&
    a.beatmapVersion === b.beatmapVersion &&
    a.beatmapId === b.beatmapId &&
    a.beatmapSetId === b.beatmapSetId &&
    a.beatmapChecksum === b.beatmapChecksum &&
    a.coverUrl === b.coverUrl &&
    a.ppCurrent === b.ppCurrent &&
    a.ppFc === b.ppFc &&
    a.accuracy === b.accuracy &&
    a.combo === b.combo &&
    a.maxCombo === b.maxCombo &&
    a.hp === b.hp &&
    a.mods === b.mods &&
    a.mode === b.mode &&
    a.bpm === b.bpm &&
    a.ar === b.ar &&
    a.cs === b.cs &&
    a.od === b.od &&
    a.stars === b.stars &&
    a.osuPath === b.osuPath &&
    a.playerScore.played === b.playerScore.played &&
    a.playerScore.failed === b.playerScore.failed &&
    a.playerScore.position === b.playerScore.position &&
    a.playerScore.grade === b.playerScore.grade &&
    a.playerScore.score === b.playerScore.score
  )
}

async function probeOsuPayload(baseUrl: string): Promise<Record<string, unknown> | null> {
  if (!baseUrl) return null
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), OSU_PROBE_TIMEOUT_MS)
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/json/v2`, {
      signal: ctrl.signal,
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as Record<string, unknown>
    if (typeof data.error === 'string') return null
    if (!isOsuProcessAttached(data)) return null
    return data
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function useTosuSocket(baseUrl: string, options?: { beatmapPanelEnabled?: boolean }) {
  const beatmapPanelEnabled = options?.beatmapPanelEnabled ?? true
  const [gameState, setGameState] = useState<GameState>(EMPTY_GAME_STATE)
  const baseUrlRef = useRef(baseUrl)
  const panelRef = useRef(beatmapPanelEnabled)
  const staleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const probing = useRef(false)
  const lastConnected = useRef(false)
  const alive = useRef(true)

  baseUrlRef.current = baseUrl
  panelRef.current = beatmapPanelEnabled

  const clearStaleTimer = () => {
    if (staleTimer.current) {
      clearTimeout(staleTimer.current)
      staleTimer.current = null
    }
  }

  const markOsuGone = (opts?: { keepProbing?: boolean }) => {
    lastConnected.current = false
    setGameState((prev) => {
      if (!prev.connected && !prev.hasBeatmap && prev.bridgeConnected) return prev
      return { ...EMPTY_GAME_STATE, bridgeConnected: prev.bridgeConnected }
    })
    // Keep probing while tosu bridge is up so reconnect after osu! restart is picked up
    if (opts?.keepProbing !== false) armStaleTimer()
  }

  const armStaleTimer = () => {
    clearStaleTimer()
    staleTimer.current = setTimeout(() => {
      void (async () => {
        if (!alive.current || probing.current) return
        // Probe whenever the bridge is up; covers silent frames and osu! exit
        probing.current = true
        try {
          const payload = await probeOsuPayload(baseUrlRef.current)
          if (!alive.current) return
          if (!payload) {
            markOsuGone()
            return
          }
          const next = parseState(payload, baseUrlRef.current, panelRef.current)
          lastConnected.current = next.connected
          setGameState((prev) => (gameStateEqual(prev, next) ? prev : next))
          armStaleTimer()
        } finally {
          probing.current = false
        }
      })()
    }, OSU_STALE_MS)
  }

  useEffect(() => {
    if (!baseUrl) {
      clearStaleTimer()
      lastConnected.current = false
      setGameState(EMPTY_GAME_STATE)
    }
  }, [baseUrl])

  // When panel is toggled off mid-session, drop panel-only fields immediately
  useEffect(() => {
    if (beatmapPanelEnabled) return
    setGameState((prev) => {
      if (!prev.coverUrl && !prev.playerScore.played && !prev.playerScore.failed) return prev
      return {
        ...prev,
        coverUrl: '',
        playerScore: EMPTY_SCORE,
      }
    })
  }, [beatmapPanelEnabled])

  useEffect(() => {
    alive.current = true
    const unsubscribe = window.tosuGui.onSocketEvent((event) => {
      if (event.type === 'bridge') {
        if (!event.connected) {
          clearStaleTimer()
          lastConnected.current = false
          setGameState({ ...EMPTY_GAME_STATE, bridgeConnected: false })
          return
        }
        setGameState((prev) =>
          prev.bridgeConnected ? prev : { ...prev, bridgeConnected: true }
        )
        // Bridge up — start health probes (covers silent osu! attach/detach)
        armStaleTimer()
        return
      }

      try {
        const data = JSON.parse(event.data) as Record<string, unknown>
        if (typeof data.error === 'string' && /osu/i.test(data.error)) {
          markOsuGone()
          return
        }

        const next = parseState(data, baseUrlRef.current, panelRef.current)
        lastConnected.current = next.connected
        setGameState((prev) => (gameStateEqual(prev, next) ? prev : next))
        // Any frame resets the quiet timer; probe still runs if frames stop
        armStaleTimer()
      } catch {
        /* ignore malformed payloads */
      }
    })

    return () => {
      alive.current = false
      clearStaleTimer()
      unsubscribe()
    }
  }, [])

  return gameState
}
