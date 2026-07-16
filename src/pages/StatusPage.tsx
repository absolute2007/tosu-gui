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
              <span
                className={`status-dot ${
                  tosuStatus?.running ? '-online' : tosuStatus?.busy ? '-waiting' : '-offline'
                }`}
              />
              {tosuStatus?.running
                ? 'Работает'
                : tosuStatus?.busy
                  ? 'Запуск…'
                  : 'Остановлен'}
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
          <StatusRow label="Версия tosu">
            {tosuStatus?.version ? `v${tosuStatus.version}` : '—'}
          </StatusRow>
          <StatusRow label="Версия GUI">
            {tosuStatus?.appVersion ? `v${tosuStatus.appVersion}` : '—'}
          </StatusRow>
          <StatusRow label="Порт">{tosuStatus?.port ?? '—'}</StatusRow>
        </div>
      </div>

      <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          className="btn btn-ghost"
          onClick={onRestart}
          disabled={restarting}
          title={restarting ? 'Подождите…' : 'Остановить и снова запустить tosu'}
        >
          <RefreshCw size={14} className={restarting ? 'spin' : ''} />
          {restarting ? 'Перезапуск…' : 'Перезапустить tosu'}
        </button>
        {onCheckUpdate && (
          <button
            className="btn btn-ghost"
            onClick={onCheckUpdate}
            disabled={checkingUpdate}
            title="Проверить обновления tosu GUI и tosu"
          >
            <Download size={14} className={checkingUpdate ? 'spin' : ''} />
            {checkingUpdate ? 'Проверка…' : 'Проверить обновления'}
          </button>
        )}
      </div>
    </div>
  )
}