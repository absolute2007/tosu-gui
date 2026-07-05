import type { ReactNode } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import type { GameState } from '../hooks/useTosuSocket'
import type { TosuStatus } from '../../electron/preload'

interface Props {
  game: GameState
  tosuStatus: TosuStatus | null
  onRestart: () => void
  restarting: boolean
  onCheckUpdate?: () => void
  checkingUpdate?: boolean
}

const STATE_LABELS: Record<string, string> = {
  menu: 'Меню',
  play: 'Игра',
  resultScreen: 'Результат',
  edit: 'Редактор',
  selectPlay: 'Выбор карты',
}

function StatusRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-info">
        <div className="setting-label">{label}</div>
      </div>
      <div className="setting-control">{children}</div>
    </div>
  )
}

export function StatusPage({
  game,
  tosuStatus,
  onRestart,
  restarting,
  onCheckUpdate,
  checkingUpdate,
}: Props) {
  const stateLabel = STATE_LABELS[game.state] ?? game.state

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Статус</h1>
        <p className="page-subtitle">Состояние tosu и подключение к osu!</p>
      </div>

      <div className="glass-card">
        <div className="card-header">Подключение</div>
        <div className="card-body">
          <StatusRow label="tosu">
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <span className={`status-dot ${tosuStatus?.running ? '-online' : '-offline'}`} />
              {tosuStatus?.running ? 'Работает' : 'Остановлен'}
            </span>
          </StatusRow>
          <StatusRow label="osu!">
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <span
                className={`status-dot ${
                  game.connected ? '-online' : game.bridgeConnected ? '-waiting' : '-offline'
                }`}
              />
              {game.connected
                ? 'Подключён'
                : game.bridgeConnected
                  ? 'Не найден — запустите osu!'
                  : 'Нет связи с tosu'}
            </span>
          </StatusRow>
          <StatusRow label="Состояние">{stateLabel}</StatusRow>
          <StatusRow label="Версия">
            {tosuStatus?.version ? `v${tosuStatus.version}` : '—'}
          </StatusRow>
          <StatusRow label="Порт">{tosuStatus?.port ?? '—'}</StatusRow>
        </div>
      </div>

      {game.connected && (
        <div className="glass-card">
          <div className="card-header">Текущая карта</div>
          <div className="card-body">
            <StatusRow label="Название">{game.beatmapTitle}</StatusRow>
            <StatusRow label="Исполнитель">{game.beatmapArtist}</StatusRow>
            <StatusRow label="PP (текущий)">{game.ppCurrent}</StatusRow>
            <StatusRow label="PP (FC)">{game.ppFc}</StatusRow>
            <StatusRow label="Звёзды">{game.stars}★</StatusRow>
            <StatusRow label="BPM">{game.bpm}</StatusRow>
            {game.state === 'play' && (
              <>
                <StatusRow label="Точность">{game.accuracy}%</StatusRow>
                <StatusRow label="Комбо">{game.combo}x</StatusRow>
              </>
            )}
            {game.mods && <StatusRow label="Моды">{game.mods}</StatusRow>}
          </div>
        </div>
      )}

      <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" onClick={onRestart} disabled={restarting}>
          <RefreshCw size={14} className={restarting ? 'spin' : ''} />
          Перезапустить tosu
        </button>
        {onCheckUpdate && (
          <button className="btn btn-ghost" onClick={onCheckUpdate} disabled={checkingUpdate}>
            <Download size={14} className={checkingUpdate ? 'spin' : ''} />
            Проверить обновления
          </button>
        )}
      </div>
    </div>
  )
}