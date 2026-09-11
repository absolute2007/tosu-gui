import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { NumberInput } from './NumberInput'
import { Toggle } from './Toggle'
import type { CounterSetting } from '../../electron/tosu-api'
import { useI18n } from '../i18n/context'

interface Props {
  name: string
  onClose: () => void
  onSaved: () => void
  onError: () => void
}

export function CounterSettingsModal({ name, onClose, onSaved, onError }: Props) {
  const { lang } = useI18n()
  const [settings, setSettings] = useState<CounterSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.tosuGui.getCounterSettings(name)
      .then(setSettings)
      .catch(() => setSettings([]))
      .finally(() => setLoading(false))
  }, [name])

  const updateValue = (id: string, value: string | number | boolean) => {
    setSettings((prev) =>
      prev.map((s) => (s.uniqueID === id ? { ...s, value } : s))
    )
  }

  const save = async () => {
    setSaving(true)
    try {
      await window.tosuGui.saveCounterSettings(name, settings)
      onSaved()
    } catch {
      onError()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="glass-card modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{lang === 'en' ? `Settings: ${name}` : `Настройки: ${name}`}</div>
        <div className="modal-body">
          {loading ? (
            <div className="empty-state">
              <Loader2 size={18} className="spin" />
              <span>{lang === 'en' ? 'Loading parameters…' : 'Загрузка параметров…'}</span>
            </div>
          ) : settings.length === 0 ? (
            <div className="empty-state">
              <p>{lang === 'en' ? 'No configurable parameters' : 'Нет настраиваемых параметров'}</p>
            </div>
          ) : (
            settings.map((s) => (
              <div key={s.uniqueID} className="setting-row">
                <div className="setting-info">
                  <div className="setting-label">{s.name}</div>
                  {s.description && <div className="setting-desc">{s.description}</div>}
                </div>
                <div className="setting-control">
                  {s.type === 'checkbox' ? (
                    <Toggle
                      checked={!!s.value}
                      onChange={(v) => updateValue(s.uniqueID, v)}
                    />
                  ) : s.type === 'number' ? (
                    <NumberInput
                      value={typeof s.value === 'number' ? s.value : parseFloat(String(s.value)) || 0}
                      onChange={(v) => updateValue(s.uniqueID, v)}
                      fallback={0}
                    />
                  ) : s.type === 'color' ? (
                    <input
                      type="color"
                      value={s.value as string}
                      onChange={(e) => updateValue(s.uniqueID, e.target.value)}
                      style={{ width: 36, height: 28, border: 'none', background: 'transparent', cursor: 'pointer' }}
                    />
                  ) : s.type === 'select' && s.options ? (
                    <select
                      className="glass-input"
                      value={s.value as string}
                      onChange={(e) => updateValue(s.uniqueID, e.target.value)}
                    >
                      {s.options.map((o) => (
                        <option key={o.value} value={o.value}>{o.name}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="glass-input -wide"
                      value={s.value as string}
                      onChange={(e) => updateValue(s.uniqueID, e.target.value)}
                    />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>{lang === 'en' ? 'Cancel' : 'Отмена'}</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || loading}>
            {saving ? (lang === 'en' ? 'Saving...' : 'Сохранение...') : (lang === 'en' ? 'Save' : 'Сохранить')}
          </button>
        </div>
      </div>
    </div>
  )
}