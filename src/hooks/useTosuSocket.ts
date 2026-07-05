import { useEffect, useState } from 'react'

export interface GameState {
  connected: boolean
  bridgeConnected: boolean
  state: string
  beatmapTitle: string
  beatmapArtist: string
  beatmapMapper: string
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
}

const EMPTY: GameState = {
  connected: false,
  bridgeConnected: false,
  state: 'menu',
  beatmapTitle: '—',
  beatmapArtist: '—',
  beatmapMapper: '—',
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
}

function isOsuProcessAttached(data: Record<string, unknown>): boolean {
  const profile = (data.profile as Record<string, unknown>) ?? {}
  const instance = (data.instance as Record<string, unknown>) ?? {}
  const menu = (data.menu as Record<string, unknown>) ?? {}

  if (typeof data.client === 'string' && data.client.length > 0 && data.client !== 'unknown') {
    return true
  }

  if (typeof profile.id === 'number' && profile.id > 0) return true
  if (typeof profile.name === 'string' && profile.name.trim().length > 0) return true
  if (instance.found === true || instance.status === 'connected') return true
  if (typeof menu.stateNumber === 'number') return true

  return false
}

function parseState(data: Record<string, unknown>): GameState {
  const menu = (data.menu as Record<string, unknown>) ?? {}
  const play = (data.play as Record<string, unknown>) ?? {}
  const beatmap = (data.beatmap as Record<string, unknown>) ?? {}
  const pp = (data.pp as Record<string, unknown>) ?? {}
  const profile = (data.profile as Record<string, unknown>) ?? {}

  const stateNum = (menu.stateNumber as number) ?? 0
  const stateNames = ['menu', 'edit', 'play', 'exit', 'selectEdit', 'selectPlay', 'selectDrawings', 'resultScreen']
  const state = stateNames[stateNum] ?? 'menu'

  const modsArr = (beatmap.mods as { acronym?: string }[]) ?? []
  const mods = modsArr.map((m) => m.acronym).filter(Boolean).join('')

  const modeNum = (profile.mode as { number?: number })?.number ?? 0
  const modes = ['osu', 'taiko', 'catch', 'mania']

  return {
    connected: isOsuProcessAttached(data),
    bridgeConnected: true,
    state,
    beatmapTitle: (beatmap.title as string) || (menu.bmTitle as string) || '—',
    beatmapArtist: (beatmap.artist as string) || (menu.bmArtist as string) || '—',
    beatmapMapper: (beatmap.mapper as string) || '—',
    ppCurrent: Math.round(((pp.current as number) ?? 0) * 100) / 100,
    ppFc: Math.round(((pp.fc as number) ?? 0) * 100) / 100,
    accuracy: Math.round(((play.accuracy as number) ?? 0) * 10000) / 100,
    combo: (play.combo as { current?: number })?.current ?? 0,
    maxCombo: (beatmap.maxCombo as number) ?? 0,
    hp: Math.round(((play.hp as { current?: number })?.current ?? 0) * 100),
    mods,
    mode: modes[modeNum] ?? 'osu',
    bpm: Math.round((beatmap.bpm as { common?: number })?.common ?? 0),
    ar: (beatmap.stats as { ar?: number })?.ar ?? 0,
    cs: (beatmap.stats as { cs?: number })?.cs ?? 0,
    od: (beatmap.stats as { od?: number })?.od ?? 0,
    stars: Math.round(((beatmap.stats as { stars?: { total?: number } })?.stars?.total ?? 0) * 100) / 100,
  }
}

export function useTosuSocket(baseUrl: string) {
  const [gameState, setGameState] = useState<GameState>(EMPTY)

  useEffect(() => {
    if (!baseUrl) setGameState(EMPTY)
  }, [baseUrl])

  useEffect(() => {
    const unsubscribe = window.tosuGui.onSocketEvent((event) => {
      if (event.type === 'bridge') {
        if (!event.connected) {
          setGameState({ ...EMPTY, bridgeConnected: false })
          return
        }
        setGameState((prev) => ({ ...prev, bridgeConnected: true }))
        return
      }

      try {
        const data = JSON.parse(event.data) as Record<string, unknown>
        setGameState(parseState(data))
      } catch {
        /* ignore malformed payloads */
      }
    })
    return () => {
      unsubscribe()
    }
  }, [])

  return gameState
}