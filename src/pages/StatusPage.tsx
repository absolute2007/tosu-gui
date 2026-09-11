import type { ReactNode } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import type { GameState } from '../hooks/useTosuSocket'
import type { TosuStatus } from '../../electron/preload'
import { useI18n } from '../i18n/context'

interface Props {
  game: GameState
  tosuStatus: TosuStatus | null
  onRestart: () => void
  restarting: boolean
  onCheckUpdate?: () => void
  checkingUpdate?: boolean
}

const STATE_LABELS_RU: Record<string, string> = {
  menu: 'Меню',
  play: 'Игра',
  resultScreen: 'Результат',
  edit: 'Редактор',
  selectPlay: 'Выбор карты',
}

const STATE_LABELS_EN: Record<string, string> = {
  menu: 'Menu',
  play: 'Playing',
  resultScreen: 'Results',
  edit: 'Editor',
  selectPlay: 'Song Select',
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
  const { t, lang } = useI18n()
  const stateLabel = (lang === 'en' ? STATE_LABELS_EN[game.state] : STATE_LABELS_RU[game.state]) ?? game.state

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">{t('status.title')}</h1>
        <p className="page-subtitle">{t('status.subtitle')}</p>
      </div>

      <div className="glass-card">
        <div className="card-header">{lang === 'en' ? 'Connection' : 'Подключение'}</div>
        <div className="card-body">
          <StatusRow label="tosu">
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <span
                className={`status-dot ${
                  tosuStatus?.running ? '-online' : tosuStatus?.busy ? '-waiting' : '-offline'
                }`}
              />
              {tosuStatus?.running
                ? (lang === 'en' ? 'Running' : 'Работает')
                : tosuStatus?.busy
                  ? (lang === 'en' ? 'Starting…' : 'Запуск…')
                  : (lang === 'en' ? 'Stopped' : 'Остановлен')}
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
                ? (lang === 'en' ? 'Connected' : 'Подключён')
                : game.bridgeConnected
                  ? (lang === 'en' ? 'Not found — launch osu!' : 'Не найден — запустите osu!')
                  : (lang === 'en' ? 'No connection to tosu' : 'Нет связи с tosu')}
            </span>
          </StatusRow>
          <StatusRow label={lang === 'en' ? 'State' : 'Состояние'}>{stateLabel}</StatusRow>
          <StatusRow label={lang === 'en' ? 'tosu version' : 'Версия tosu'}>
            {tosuStatus?.version ? `v${tosuStatus.version}` : '—'}
          </StatusRow>
          <StatusRow label={lang === 'en' ? 'GUI version' : 'Версия GUI'}>
            {tosuStatus?.appVersion ? `v${tosuStatus.appVersion}` : '—'}
          </StatusRow>
          <StatusRow label={lang === 'en' ? 'Port' : 'Порт'}>{tosuStatus?.port ?? '—'}</StatusRow>
        </div>
      </div>

      <div style={{ marginTop: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          className="btn btn-ghost"
          onClick={onRestart}
          disabled={restarting}
          title={restarting ? (lang === 'en' ? 'Please wait…' : 'Подождите…') : (lang === 'en' ? 'Stop and start tosu again' : 'Остановить и снова запустить tosu')}
        >
          <RefreshCw size={14} className={restarting ? 'spin' : ''} />
          {restarting ? t('status.restarting') : t('status.restartBtn')}
        </button>
        {onCheckUpdate && (
          <button
            className="btn btn-ghost"
            onClick={onCheckUpdate}
            disabled={checkingUpdate}
            title={lang === 'en' ? 'Check for tosu GUI updates' : 'Проверить обновления tosu GUI'}
          >
            <Download size={14} className={checkingUpdate ? 'spin' : ''} />
            {checkingUpdate ? t('status.checkingUpdates') : t('status.checkUpdates')}
          </button>
        )}
      </div>
    </div>
  )
}