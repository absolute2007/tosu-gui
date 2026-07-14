import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import type { BeatmapPlayerScore, GameState } from '../hooks/useTosuSocket'
import './BeatmapPanel.css'

interface Props {
  game: GameState
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

function formatScore(n: number): string {
  if (!n) return '0'
  return n.toLocaleString('en-US')
}

function formatAcc(n: number): string {
  if (!n) return '0%'
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)}%`
}

function playerStatusLabel(score: BeatmapPlayerScore, loading: boolean): string {
  if (loading && !score.played) return 'Проверка…'
  if (!score.played) return 'Не пройдена'
  if (score.failed) return 'Фейл'

  const parts: string[] = ['Пройдена']
  // Only real global rank (from online top list), never in-game board slot
  if (score.position != null && score.position > 0) parts.push(`#${score.position}`)
  if (score.grade) parts.push(score.grade)
  return parts.join(' · ')
}

/**
 * Prefer dedicated lookup (local scores.db + online top-100 for this beatmap id).
 * Result-screen memory is only a fill-in while scores.db has not refreshed yet.
 */
function mergeScores(
  lookup: BeatmapPlayerScore | null,
  resultScreen: BeatmapPlayerScore
): BeatmapPlayerScore {
  if (lookup?.played) {
    if (resultScreen.played && resultScreen.score > lookup.score) {
      return {
        ...lookup,
        score: resultScreen.score,
        grade: resultScreen.grade || lookup.grade,
        accuracy: resultScreen.accuracy || lookup.accuracy,
        maxCombo: Math.max(resultScreen.maxCombo, lookup.maxCombo),
        mods: resultScreen.mods || lookup.mods,
        // keep online world position from lookup
      }
    }
    return lookup
  }
  if (resultScreen.played) return { ...resultScreen, position: null }
  return lookup ?? EMPTY_SCORE
}

function StatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bm-stat">
      <div className="bm-stat-label">{label}</div>
      <div className="bm-stat-value">{value}</div>
    </div>
  )
}

type EmptyKind = 'no-tosu' | 'no-osu' | 'no-map'

function emptyKind(game: GameState): EmptyKind {
  if (!game.bridgeConnected) return 'no-tosu'
  if (!game.connected) return 'no-osu'
  return 'no-map'
}

function EmptyArt({ kind }: { kind: EmptyKind }) {
  return (
    <div className={`beatmap-panel-empty-art -${kind}`} aria-hidden>
      <div className="bm-empty-visual">
        {kind === 'no-tosu' && (
          <>
            <span className="bm-empty-ring" />
            <span className="bm-empty-dot -offline" />
          </>
        )}
        {kind === 'no-osu' && (
          <>
            <span className="bm-empty-ring -pulse" />
            <span className="bm-empty-dot -waiting" />
          </>
        )}
        {kind === 'no-map' && (
          <span className="bm-empty-bars" aria-hidden>
            <i /><i /><i /><i />
          </span>
        )}
      </div>
    </div>
  )
}

function BeatmapPanelInner({ game }: Props) {
  const coverKey = game.beatmapChecksum || String(game.beatmapId) || game.coverUrl
  /** Identity of the selected difficulty — must change when switching versions in a set */
  const difficultyKey = `${game.beatmapId}|${game.beatmapChecksum}|${game.mode}`

  const [coverFailed, setCoverFailed] = useState(false)
  const [lookupScore, setLookupScore] = useState<BeatmapPlayerScore | null>(null)
  const [scoreLoading, setScoreLoading] = useState(false)
  const onCoverError = useCallback(() => setCoverFailed(true), [])

  useEffect(() => {
    setCoverFailed(false)
  }, [coverKey])

  // Always resolve PB for the selected difficulty (checksum + beatmap id).
  // Never skip because of live memory — that caused wrong #rank and cross-diff bleed.
  useEffect(() => {
    if (
      !game.connected ||
      !game.hasBeatmap ||
      (game.beatmapId <= 0 && !game.beatmapChecksum) ||
      (game.profileId <= 0 && !game.profileName && !game.osuPath)
    ) {
      setLookupScore(null)
      setScoreLoading(false)
      return
    }

    let cancelled = false
    const payload = {
      userId: game.profileId,
      userName: game.profileName,
      beatmapId: game.beatmapId,
      beatmapChecksum: game.beatmapChecksum,
      mode: game.mode,
      osuPath: game.osuPath,
    }

    setScoreLoading(true)
    setLookupScore(null)

    const timer = window.setTimeout(() => {
      void window.tosuGui
        .getUserBeatmapScore(payload)
        .then((res) => {
          if (cancelled) return
          if (res.played) {
            setLookupScore({
              played: true,
              failed: false,
              position: res.position,
              grade: res.grade,
              score: res.score,
              accuracy: res.accuracy,
              maxCombo: res.maxCombo,
              mods: res.mods,
            })
          } else {
            setLookupScore(EMPTY_SCORE)
          }
        })
        .catch(() => {
          if (!cancelled) setLookupScore(null)
        })
        .finally(() => {
          if (!cancelled) setScoreLoading(false)
        })
    }, 120)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    difficultyKey,
    game.connected,
    game.hasBeatmap,
    game.profileId,
    game.profileName,
    game.osuPath,
    game.beatmapId,
    game.beatmapChecksum,
    game.mode,
  ])

  const resolvedScore = useMemo(
    () => mergeScores(lookupScore, game.playerScore),
    [lookupScore, game.playerScore]
  )

  const showMap = game.connected && game.hasBeatmap
  const showCover = Boolean(showMap && game.coverUrl && !coverFailed)
  const kind = emptyKind(game)
  const statusClass = !resolvedScore.played
    ? scoreLoading
      ? '-loading'
      : '-empty'
    : resolvedScore.failed
      ? '-fail'
      : '-pass'

  return (
    <aside className="beatmap-panel" aria-label="Текущая карта">
      <div className="beatmap-panel-header">Карта</div>

      {!showMap ? (
        <div className="beatmap-panel-empty">
          <EmptyArt kind={kind} />
          <div className="beatmap-panel-empty-title">Карта не выбрана</div>
          <div className="beatmap-panel-empty-desc">
            {kind === 'no-map'
              ? 'Выберите карту в osu!'
              : kind === 'no-osu'
                ? 'Запустите osu!, чтобы видеть карту'
                : 'Нет связи с tosu'}
          </div>
        </div>
      ) : (
        <div className="beatmap-panel-body">
          <div className="beatmap-cover">
            {showCover ? (
              <img
                key={coverKey}
                src={game.coverUrl}
                alt=""
                className="beatmap-cover-img"
                draggable={false}
                onError={onCoverError}
              />
            ) : (
              <div className="beatmap-cover-fallback" aria-hidden />
            )}
          </div>

          <div className="beatmap-meta">
            <div className="beatmap-artist" title={game.beatmapArtist}>
              {game.beatmapArtist}
            </div>
            <div className="beatmap-title" title={game.beatmapTitle}>
              {game.beatmapTitle}
            </div>
            {game.beatmapVersion ? (
              <div className="beatmap-version" title={game.beatmapVersion}>
                [{game.beatmapVersion}]
              </div>
            ) : null}
            <div className="beatmap-mapper" title={game.beatmapMapper}>
              {game.beatmapMapper}
            </div>
          </div>

          <div className="beatmap-stats">
            <StatCell label="★" value={game.stars || '—'} />
            <StatCell label="BPM" value={game.bpm || '—'} />
            <StatCell label="AR" value={game.ar || '—'} />
            <StatCell label="CS" value={game.cs || '—'} />
            <StatCell label="OD" value={game.od || '—'} />
            <StatCell label="Combo" value={game.maxCombo || '—'} />
          </div>

          <div className="beatmap-extras">
            <div className="beatmap-extra-row">
              <span className="beatmap-extra-label">Режим</span>
              <span className="beatmap-extra-value">{game.mode}</span>
            </div>
            {game.mods ? (
              <div className="beatmap-extra-row">
                <span className="beatmap-extra-label">Моды</span>
                <span className="beatmap-extra-value">{game.mods}</span>
              </div>
            ) : null}
            {game.beatmapId > 0 ? (
              <div className="beatmap-extra-row">
                <span className="beatmap-extra-label">Beatmap</span>
                <span className="beatmap-extra-value">#{game.beatmapId}</span>
              </div>
            ) : null}
          </div>

          <div className={`beatmap-player-status ${statusClass}`}>
            <div className="beatmap-player-status-label">Ваш результат</div>
            <div className="beatmap-player-status-value">
              {playerStatusLabel(resolvedScore, scoreLoading)}
            </div>
            {resolvedScore.played && !resolvedScore.failed && resolvedScore.score > 0 ? (
              <div className="beatmap-player-status-detail">
                {formatScore(resolvedScore.score)}
                {resolvedScore.accuracy > 0 ? ` · ${formatAcc(resolvedScore.accuracy)}` : ''}
                {resolvedScore.maxCombo > 0 ? ` · ${resolvedScore.maxCombo}x` : ''}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </aside>
  )
}

export const BeatmapPanel = memo(BeatmapPanelInner)
