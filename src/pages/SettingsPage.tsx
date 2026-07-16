import { FolderOpen } from 'lucide-react'
import { KeybindInput } from '../components/KeybindInput'
import { NumberInput } from '../components/NumberInput'
import { Toggle } from '../components/Toggle'
import type { TosuAppSettings } from '../../electron/tosu-api'

interface Props {
  settings: TosuAppSettings
  dirty: boolean
  saving: boolean
  checkAppUpdates: boolean
  checkTosuUpdates: boolean
  closeToTray: boolean
  showBeatmapPanel: boolean
  songsPath: string
  songsPathResolved: string | null
  mapsOverlayKeybind: string
  onCheckAppUpdatesChange: (enabled: boolean) => void
  onCheckTosuUpdatesChange: (enabled: boolean) => void
  onCloseToTrayChange: (enabled: boolean) => void
  onShowBeatmapPanelChange: (enabled: boolean) => void
  onMapsOverlayKeybindChange: (bind: string) => void
  onPickSongsPath: () => Promise<string | null>
  onClearSongsPath: () => Promise<void>
  onUpdate: <K extends keyof TosuAppSettings>(key: K, value: TosuAppSettings[K]) => void
  onSave: () => void
}

export function SettingsPage({
  settings,
  dirty,
  saving,
  checkAppUpdates,
  checkTosuUpdates,
  closeToTray,
  showBeatmapPanel,
  songsPath,
  songsPathResolved,
  mapsOverlayKeybind,
  onCheckAppUpdatesChange,
  onCheckTosuUpdatesChange,
  onCloseToTrayChange,
  onShowBeatmapPanelChange,
  onMapsOverlayKeybindChange,
  onPickSongsPath,
  onClearSongsPath,
  onUpdate,
  onSave,
}: Props) {
  const songsLabel = songsPath || songsPathResolved || 'не найдена (выберите вручную)'

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Настройки</h1>
        <p className="page-subtitle">Параметры tosu и опроса данных</p>
      </div>

      <div className="glass-card">
        <div className="card-header">Карты</div>
        <div className="card-body">
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">Папка Songs</div>
              <div className="setting-desc" title={songsPathResolved || songsPath || undefined}>
                Куда скачивать .osz. Сейчас: {songsLabel}
              </div>
            </div>
            <div className="setting-control" style={{ gap: 6 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onPickSongsPath()}>
                <FolderOpen size={14} strokeWidth={1.8} />
                Выбрать
              </button>
              {songsPath ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onClearSongsPath()}>
                  Авто
                </button>
              ) : null}
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">Карты в игре</div>
              <div className="setting-desc">
                Хоткей панели карт поверх osu! (нужен in-game overlay). По умолчанию Control+Shift+M.
              </div>
            </div>
            <div className="setting-control">
              <KeybindInput value={mapsOverlayKeybind} onChange={onMapsOverlayKeybindChange} />
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card">
        <div className="card-header">Обновления</div>
        <div className="card-body">
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">Обновления tosu GUI</div>
              <div className="setting-desc">
                Проверять новые версии этой программы на GitHub и предлагать установить
              </div>
            </div>
            <div className="setting-control">
              <Toggle checked={checkAppUpdates} onChange={onCheckAppUpdatesChange} />
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">Обновления tosu</div>
              <div className="setting-desc">
                Проверять новые версии tosu.exe и in-game overlay
              </div>
            </div>
            <div className="setting-control">
              <Toggle checked={checkTosuUpdates} onChange={onCheckTosuUpdatesChange} />
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card">
        <div className="card-header">Общие</div>
        <div className="card-body">
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">Сворачивать в трей</div>
              <div className="setting-desc">
                Если включено — крестик скрывает окно в системный трей. Если выключено — программа полностью закрывается
              </div>
            </div>
            <div className="setting-control">
              <Toggle checked={closeToTray} onChange={onCloseToTrayChange} />
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">Панель текущей карты</div>
              <div className="setting-desc">
                Правая панель с обложкой и данными карты. Если выключено — панель скрыта и данные для неё не обрабатываются
              </div>
            </div>
            <div className="setting-control">
              <Toggle checked={showBeatmapPanel} onChange={onShowBeatmapPanelChange} />
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card">
        <div className="card-header">Данные</div>
        <div className="card-body">
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">Расчёт PP в реальном времени</div>
              <div className="setting-desc">Отключите для турниров или если PP не нужен</div>
            </div>
            <div className="setting-control">
              <Toggle checked={settings.CALCULATE_PP} onChange={(v) => onUpdate('CALCULATE_PP', v)} />
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">Mania scroll speed</div>
              <div className="setting-desc">Читать scrollSpeed из памяти игры</div>
            </div>
            <div className="setting-control">
              <Toggle checked={settings.READ_MANIA_SCROLL_SPEED} onChange={(v) => onUpdate('READ_MANIA_SCROLL_SPEED', v)} />
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">Данные клавиш</div>
              <div className="setting-desc">K1/K2/M1/M2 для оверлеев клавиш</div>
            </div>
            <div className="setting-control">
              <Toggle checked={settings.ENABLE_KEY_OVERLAY} onChange={(v) => onUpdate('ENABLE_KEY_OVERLAY', v)} />
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">Частота опроса</div>
              <div className="setting-desc">Интервал общих данных (мс)</div>
            </div>
            <div className="setting-control">
              <NumberInput
                value={settings.POLL_RATE}
                onChange={(v) => onUpdate('POLL_RATE', v)}
                min={100}
                max={5000}
                fallback={500}
              />
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">Точный опрос</div>
              <div className="setting-desc">HitError, KeyOverlay (мс). 0 = выкл</div>
            </div>
            <div className="setting-control">
              <NumberInput
                value={settings.PRECISE_DATA_POLL_RATE}
                onChange={(v) => onUpdate('PRECISE_DATA_POLL_RATE', v)}
                min={0}
                max={1000}
                fallback={0}
              />
            </div>
          </div>
        </div>
      </div>

      {dirty && (
        <div className="save-bar">
          <button className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        </div>
      )}
    </div>
  )
}