import { useState } from 'react'
import { ExternalLink, Settings } from 'lucide-react'
import { CounterPreview } from '../components/CounterPreview'
import { KeybindInput } from '../components/KeybindInput'
import { NumberInput } from '../components/NumberInput'
import { Toggle } from '../components/Toggle'
import { CounterSettingsModal } from '../components/CounterSettingsModal'
import type { TosuAppSettings } from '../../electron/tosu-api'
import type { TosuStatus } from '../../electron/preload'
import { useTosuCounters } from '../hooks/useTosuCounters'

interface Props {
  baseUrl: string
  tosuStatus: TosuStatus | null
  settings: TosuAppSettings
  dirty: boolean
  saving: boolean
  onUpdate: <K extends keyof TosuAppSettings>(key: K, value: TosuAppSettings[K]) => void
  onSave: () => void
  onSaveSnapshot: (snapshot: TosuAppSettings, successMessage?: string) => Promise<boolean>
  onToast: (msg: string, type: 'success' | 'error') => void
}

export function OverlayPage({ baseUrl, tosuStatus, settings, dirty, saving, onUpdate, onSave, onSaveSnapshot, onToast }: Props) {
  const { counters, reload: reloadCounters } = useTosuCounters(tosuStatus)
  const [settingsCounter, setSettingsCounter] = useState<string | null>(null)

  const quickEnable = async () => {
    const next = { ...settings, ENABLE_INGAME_OVERLAY: true }
    const ok = await onSaveSnapshot(
      next,
      'Оверлей включён. Запустите osu! и нажмите горячую клавишу для настройки позиций.'
    )
    if (ok) await reloadCounters()
  }

  const overlayActive = settings.ENABLE_INGAME_OVERLAY

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Внутриигровой оверлей</h1>
        <p className="page-subtitle">PP-счётчики поверх osu!</p>
      </div>

      <div className="glass-card overlay-status-card">
        <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className={`status-dot ${overlayActive ? '-online' : '-offline'}`} />
            <div>
              <div className="setting-label">
                {overlayActive ? 'Оверлей включён' : 'Оверлей выключен'}
              </div>
              <div className="setting-desc">
                {overlayActive
                  ? 'Счётчики будут отображаться при запуске osu!'
                  : 'Включите оверлей, чтобы видеть счётчики в игре'}
              </div>
            </div>
          </div>
          {!overlayActive && (
            <button className="btn btn-primary" onClick={quickEnable} disabled={saving || counters.length === 0}>
              Включить оверлей
            </button>
          )}
        </div>
      </div>

      <div className="glass-card">
        <div className="card-header">Основное</div>
        <div className="card-body">
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">Включить оверлей</div>
              <div className="setting-desc">
                GPU-оверлей поверх окна osu! (OpenGL / DirectX)
              </div>
            </div>
            <div className="setting-control">
              <Toggle
                checked={settings.ENABLE_INGAME_OVERLAY}
                onChange={(v) => onUpdate('ENABLE_INGAME_OVERLAY', v)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card">
        <div className="card-header">Параметры</div>
        <div className="card-body">
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">Горячая клавиша</div>
              <div className="setting-desc">
                Открывает режим редактирования: перетаскивание и масштаб счётчиков
              </div>
            </div>
            <div className="setting-control">
              <KeybindInput
                value={settings.INGAME_OVERLAY_KEYBIND}
                onChange={(v) => onUpdate('INGAME_OVERLAY_KEYBIND', v)}
                placeholder="Control + Shift + Space"
              />
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">Макс. FPS оверлея</div>
              <div className="setting-desc">Меньше FPS — меньше нагрузка на GPU</div>
            </div>
            <div className="setting-control">
              <NumberInput
                value={settings.INGAME_OVERLAY_MAX_FPS}
                onChange={(v) => onUpdate('INGAME_OVERLAY_MAX_FPS', v)}
                min={15}
                max={240}
                fallback={60}
              />
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">Отключить сглаживание (AA)</div>
              <div className="setting-desc">
                Чёткий текст без размытия. Применяется ко всем PP-счётчикам
              </div>
            </div>
            <div className="setting-control">
              <Toggle
                checked={settings.INGAME_OVERLAY_DISABLE_ANTIALIASING}
                onChange={(v) => onUpdate('INGAME_OVERLAY_DISABLE_ANTIALIASING', v)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card">
        <div className="card-header">Счётчики в оверлее ({counters.length})</div>
        <div className="card-body">
          {counters.length === 0 ? (
            <div className="empty-state" style={{ padding: '20px 0' }}>
              Нет установленных счётчиков
              <p>Скачайте счётчик на вкладке «Счётчики», затем вернитесь сюда</p>
            </div>
          ) : (
            <div className="counter-list">
              {counters.map((c) => (
                <div key={c.folderName} className="counter-item overlay-counter-item">
                  <CounterPreview
                    counter={c}
                    baseUrl={baseUrl}
                    variant="large"
                    preferLive
                    sessionKey={tosuStatus?.pid ?? 'off'}
                    liveReady={Boolean(tosuStatus?.running && baseUrl)}
                  />
                  <div className="counter-info">
                    <div className="counter-name">{c.name}</div>
                    <div className="counter-meta">
                      {c.author} · {c.resolution[0]}×{c.resolution[1]}
                    </div>
                    <div className="setting-desc" style={{ marginTop: 6 }}>
                      Позицию настраивается в игре через горячую клавишу
                    </div>
                  </div>
                  <div className="counter-actions">
                    {c.settings.length > 0 && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setSettingsCounter(c.folderName)}
                      >
                        <Settings size={13} />
                        Настройки
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => window.tosuGui.openExternal(`${baseUrl}/${c.folderName}/`)}
                    >
                      <ExternalLink size={13} />
                      Превью
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="glass-card">
        <div className="card-header">Как настроить в игре</div>
        <div className="card-body overlay-guide">
          <div className="overlay-step">
            <span className="overlay-step-num">1</span>
            <div>
              <strong>Включите оверлей</strong> и нажмите «Сохранить и перезапустить»
            </div>
          </div>
          <div className="overlay-step">
            <span className="overlay-step-num">2</span>
            <div>
              <strong>Запустите osu!</strong> — счётчики появятся автоматически
            </div>
          </div>
          <div className="overlay-step">
            <span className="overlay-step-num">3</span>
            <div>
              Нажмите <span className="hotkey-hint">{settings.INGAME_OVERLAY_KEYBIND}</span> — войдёте в режим редактирования
            </div>
          </div>
          <div className="overlay-step">
            <span className="overlay-step-num">4</span>
            <div>
              Перетащите счётчики мышью, измените размер — <strong>Esc</strong> для выхода
            </div>
          </div>
        </div>
      </div>

      {(dirty || overlayActive) && (
        <div className="save-bar">
          {dirty && (
            <button className="btn btn-primary" onClick={onSave} disabled={saving}>
              {saving ? 'Сохранение...' : 'Сохранить и перезапустить'}
            </button>
          )}
        </div>
      )}

      {settingsCounter && (
        <CounterSettingsModal
          name={settingsCounter}
          onClose={() => setSettingsCounter(null)}
          onSaved={() => {
            onToast('Настройки счётчика сохранены', 'success')
            setSettingsCounter(null)
            reloadCounters()
          }}
          onError={() => onToast('Ошибка сохранения счётчика', 'error')}
        />
      )}
    </div>
  )
}