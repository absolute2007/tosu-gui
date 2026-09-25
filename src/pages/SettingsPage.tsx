import { FolderOpen } from 'lucide-react'
import { KeybindInput } from '../components/KeybindInput'
import { NumberInput } from '../components/NumberInput'
import { Toggle } from '../components/Toggle'
import { useI18n } from '../i18n/context'
import type { TosuAppSettings } from '../../electron/tosu-api'

interface Props {
  settings: TosuAppSettings
  dirty: boolean
  saving: boolean
  checkAppUpdates: boolean
  closeToTray: boolean
  showBeatmapPanel: boolean
  songsPath: string
  songsPathResolved: string | null
  skinsPath: string
  skinsPathResolved: string | null
  skinsBrowserEnabled: boolean
  mapsOverlayKeybind: string
  disableHardwareAcceleration: boolean
  onCheckAppUpdatesChange: (enabled: boolean) => void
  onCloseToTrayChange: (enabled: boolean) => void
  onShowBeatmapPanelChange: (enabled: boolean) => void
  onMapsOverlayKeybindChange: (bind: string) => void
  onDisableHardwareAccelerationChange: (enabled: boolean) => void
  onPickSongsPath: () => Promise<string | null>
  onClearSongsPath: () => Promise<void>
  onPickSkinsPath: () => Promise<string | null>
  onClearSkinsPath: () => Promise<void>
  onSkinsBrowserEnabledChange: (enabled: boolean) => void
  onUpdate: <K extends keyof TosuAppSettings>(key: K, value: TosuAppSettings[K]) => void
  onSave: () => void
}

export function SettingsPage({
  settings,
  dirty,
  saving,
  checkAppUpdates,
  closeToTray,
  showBeatmapPanel,
  songsPath,
  songsPathResolved,
  skinsPath,
  skinsPathResolved,
  skinsBrowserEnabled,
  mapsOverlayKeybind,
  disableHardwareAcceleration,
  onCheckAppUpdatesChange,
  onCloseToTrayChange,
  onShowBeatmapPanelChange,
  onMapsOverlayKeybindChange,
  onDisableHardwareAccelerationChange,
  onPickSongsPath,
  onClearSongsPath,
  onPickSkinsPath,
  onClearSkinsPath,
  onSkinsBrowserEnabledChange,
  onUpdate,
  onSave,
}: Props) {
  const { t, lang, setLang } = useI18n()
  const songsLabel = songsPath || songsPathResolved || t('settings.notFoundManual')
  const skinsLabel = skinsPath || skinsPathResolved || t('settings.notFoundManual')

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">{t('settings.title')}</h1>
        <p className="page-subtitle">{t('settings.subtitle')}</p>
      </div>

      <div className="glass-card">
        <div className="card-header">{t('settings.sectionMaps')}</div>
        <div className="card-body">
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">{t('settings.songsFolder')}</div>
              <div className="setting-desc" title={songsPathResolved || songsPath || undefined}>
                {t('settings.songsFolderDesc', { path: songsLabel })}
              </div>
            </div>
            <div className="setting-control" style={{ gap: 6 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onPickSongsPath()}>
                <FolderOpen size={14} strokeWidth={1.8} />
                {t('common.select')}
              </button>
              {songsPath ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onClearSongsPath()}>
                  {t('common.auto')}
                </button>
              ) : null}
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">{t('settings.inGameMaps')}</div>
              <div className="setting-desc">
                {t('settings.inGameMapsDesc')}
              </div>
            </div>
            <div className="setting-control">
              <KeybindInput value={mapsOverlayKeybind} onChange={onMapsOverlayKeybindChange} />
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card">
        <div className="card-header">{t('settings.sectionSkins')}</div>
        <div className="card-body">
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">{t('settings.skinsSection')}</div>
              <div className="setting-desc">
                {t('settings.skinsSectionDesc')}
              </div>
            </div>
            <div className="setting-control">
              <Toggle checked={skinsBrowserEnabled} onChange={onSkinsBrowserEnabledChange} />
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">{t('settings.skinsFolder')}</div>
              <div className="setting-desc" title={skinsPathResolved || skinsPath || undefined}>
                {t('settings.skinsFolderDesc', { path: skinsLabel })}
              </div>
            </div>
            <div className="setting-control" style={{ gap: 6 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onPickSkinsPath()}>
                <FolderOpen size={14} strokeWidth={1.8} />
                {t('common.select')}
              </button>
              {skinsPath ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onClearSkinsPath()}>
                  {t('common.auto')}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card">
        <div className="card-header">{t('settings.sectionUpdates')}</div>
        <div className="card-body">
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">{t('settings.updatesTitle')}</div>
              <div className="setting-desc">
                {t('settings.updatesDesc')}
              </div>
            </div>
            <div className="setting-control">
              <Toggle checked={checkAppUpdates} onChange={onCheckAppUpdatesChange} />
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card">
        <div className="card-header">{t('settings.general')}</div>
        <div className="card-body">
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">{t('settings.language')}</div>
              <div className="setting-desc">
                {t('settings.languageDesc')}
              </div>
            </div>
            <div className="setting-control">
              <div className="tabs-inline">
                <button
                  type="button"
                  className={`tab-btn ${lang === 'ru' ? '-active' : ''}`}
                  onClick={() => setLang('ru')}
                >
                  Русский (RU)
                </button>
                <button
                  type="button"
                  className={`tab-btn ${lang === 'en' ? '-active' : ''}`}
                  onClick={() => setLang('en')}
                >
                  English (EN)
                </button>
              </div>
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">{t('settings.closeToTray')}</div>
              <div className="setting-desc">
                {t('settings.closeToTrayDesc')}
              </div>
            </div>
            <div className="setting-control">
              <Toggle checked={closeToTray} onChange={onCloseToTrayChange} />
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">{t('settings.showBeatmapPanel')}</div>
              <div className="setting-desc">
                {t('settings.showBeatmapPanelDesc')}
              </div>
            </div>
            <div className="setting-control">
              <Toggle checked={showBeatmapPanel} onChange={onShowBeatmapPanelChange} />
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">{t('settings.disableHardwareAcceleration')}</div>
              <div className="setting-desc">
                {t('settings.disableHardwareAccelerationDesc')}
              </div>
            </div>
            <div className="setting-control">
              <Toggle checked={disableHardwareAcceleration} onChange={onDisableHardwareAccelerationChange} />
            </div>
          </div>
        </div>
      </div>

      <div className="glass-card">
        <div className="card-header">{t('settings.sectionData')}</div>
        <div className="card-body">
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">{t('settings.calcPp')}</div>
              <div className="setting-desc">{t('settings.calcPpDesc')}</div>
            </div>
            <div className="setting-control">
              <Toggle checked={settings.CALCULATE_PP} onChange={(v) => onUpdate('CALCULATE_PP', v)} />
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">{t('settings.maniaScroll')}</div>
              <div className="setting-desc">{t('settings.maniaScrollDesc')}</div>
            </div>
            <div className="setting-control">
              <Toggle checked={settings.READ_MANIA_SCROLL_SPEED} onChange={(v) => onUpdate('READ_MANIA_SCROLL_SPEED', v)} />
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">{t('settings.keyData')}</div>
              <div className="setting-desc">{t('settings.keyDataDesc')}</div>
            </div>
            <div className="setting-control">
              <Toggle checked={settings.ENABLE_KEY_OVERLAY} onChange={(v) => onUpdate('ENABLE_KEY_OVERLAY', v)} />
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">{t('settings.pollRate')}</div>
              <div className="setting-desc">{t('settings.pollRateDesc')}</div>
            </div>
            <div className="setting-control">
              <NumberInput
                value={settings.POLL_RATE}
                onChange={(v) => onUpdate('POLL_RATE', v)}
                min={1}
                max={5000}
                fallback={100}
              />
            </div>
          </div>
          <div className="setting-row">
            <div className="setting-info">
              <div className="setting-label">{t('settings.precisePollRate')}</div>
              <div className="setting-desc">{t('settings.precisePollRateDesc')}</div>
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
            {saving ? t('settings.saving') : t('settings.save')}
          </button>
        </div>
      )}
    </div>
  )
}