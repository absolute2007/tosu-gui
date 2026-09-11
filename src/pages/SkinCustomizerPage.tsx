import { useCallback, useEffect, useRef, useState } from 'react'
import {
  FolderOpen,
  Loader2,
  Palette,
  Pause,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Undo2,
  Volume2,
} from 'lucide-react'
import { useI18n } from '../i18n/context'
import type {
  LocalSkinEntry,
  SkinCustomizationData,
  SkinTweakCategory,
  SkinTweakInfo,
} from '../../electron/preload'
import './SkinCustomizerPage.css'

interface Props {
  visible?: boolean
  onToast: (msg: string, type: 'success' | 'error') => void
  onOpenSettings?: () => void
}

type FilterCategory = 'all' | SkinTweakCategory

export function SkinCustomizerPage({ visible, onToast }: Props) {
  const { t, lang } = useI18n()

  const CATEGORIES: { id: FilterCategory; label: string }[] = [
    { id: 'all', label: t('skinCustomizer.catAll') },
    { id: 'cursor', label: t('skinCustomizer.catCursor') },
    { id: 'gameplay', label: t('skinCustomizer.catGameplay') },
    { id: 'interface', label: t('skinCustomizer.catInterface') },
    { id: 'audio', label: t('skinCustomizer.catAudio') },
  ]
  const [skins, setSkins] = useState<LocalSkinEntry[]>([])
  const [selectedSkinPath, setSelectedSkinPath] = useState<string>('')
  const [loadingSkins, setLoadingSkins] = useState<boolean>(true)
  const [customData, setCustomData] = useState<SkinCustomizationData | null>(null)
  const [loadingCustomData, setLoadingCustomData] = useState<boolean>(false)
  const [mainView, setMainView] = useState<'tweaks' | 'colors'>('tweaks')
  const [colorSubTab, setColorSubTab] = useState<'combo' | 'cursor'>('combo')
  const [activeCategory, setActiveCategory] = useState<FilterCategory>('all')
  const [busyTweakId, setBusyTweakId] = useState<string | null>(null)
  const [showResetModal, setShowResetModal] = useState<boolean>(false)
  const [resettingAll, setResettingAll] = useState<boolean>(false)

  // Load local skins list
  const loadLocalSkins = useCallback(async (preferredPath?: string) => {
    setLoadingSkins(true)
    try {
      const res = await window.tosuGui.getLocalSkins()
      const dirSkins = (res.entries || []).filter((e) => e.isDirectory)
      setSkins(dirSkins)

      if (dirSkins.length > 0) {
        const toSelect = preferredPath && dirSkins.some((s) => s.path === preferredPath)
          ? preferredPath
          : dirSkins[0].path
        setSelectedSkinPath(toSelect)
      } else {
        setSelectedSkinPath('')
        setCustomData(null)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Не удалось загрузить список скинов'
      onToast(msg, 'error')
    } finally {
      setLoadingSkins(false)
    }
  }, [onToast])

  // Load custom data for selected skin
  const loadSkinData = useCallback(async (skinPath: string) => {
    if (!skinPath) {
      setCustomData(null)
      return
    }
    setLoadingCustomData(true)
    try {
      const data = await window.tosuGui.getSkinCustomization(skinPath)
      setCustomData(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка считывания настроек скина'
      onToast(msg, 'error')
    } finally {
      setLoadingCustomData(false)
    }
  }, [onToast])

  useEffect(() => {
    if (visible) {
      void loadLocalSkins(selectedSkinPath)
    }
  }, [visible, loadLocalSkins])

  useEffect(() => {
    if (selectedSkinPath) {
      void loadSkinData(selectedSkinPath)
    }
  }, [selectedSkinPath, loadSkinData])

  const handleToggleTweak = async (tweak: SkinTweakInfo) => {
    if (!selectedSkinPath || busyTweakId) return
    const nextState = !tweak.applied
    setBusyTweakId(tweak.id)
    try {
      const updated = await window.tosuGui.applySkinTweak({
        skinPath: selectedSkinPath,
        tweakId: tweak.id,
        enable: nextState,
      })
      setCustomData(updated)
      const title = t(`skinCustomizer.tweaks.${tweak.id}.title`) || tweak.title
      onToast(
        nextState
          ? (lang === 'en' ? `Applied «${title}»` : `Настройка «${title}» применена`)
          : (lang === 'en' ? `Reverted «${title}»` : `Настройка «${title}» отменена`),
        'success'
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : (lang === 'en' ? 'Failed to apply tweak' : 'Ошибка применения настройки')
      onToast(msg, 'error')
    } finally {
      setBusyTweakId(null)
    }
  }

  const handleResetTweak = async (tweak: SkinTweakInfo) => {
    if (!selectedSkinPath || busyTweakId) return
    setBusyTweakId(tweak.id)
    try {
      const updated = await window.tosuGui.resetSkinTweak({
        skinPath: selectedSkinPath,
        tweakId: tweak.id,
      })
      setCustomData(updated)
      const title = t(`skinCustomizer.tweaks.${tweak.id}.title`) || tweak.title
      onToast(
        lang === 'en'
          ? `Element «${title}» restored to original state`
          : `Элемент «${title}» возвращён к исходному состоянию`,
        'success'
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : (lang === 'en' ? 'Failed to reset element' : 'Ошибка сброса элемента')
      onToast(msg, 'error')
    } finally {
      setBusyTweakId(null)
    }
  }

  const handleRecolorCursor = async (hue: number, recolorTrail: boolean) => {
    if (!selectedSkinPath || busyTweakId) return
    setBusyTweakId('cursor-color')
    try {
      const updated = await window.tosuGui.recolorSkinCursor({
        skinPath: selectedSkinPath,
        hue,
        recolorTrail,
      })
      setCustomData(updated)
      onToast(lang === 'en' ? 'Cursor color successfully updated in skin' : 'Цвет курсора успешно обновлен в скине', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : (lang === 'en' ? 'Failed to recolor cursor' : 'Ошибка применения цвета курсора')
      onToast(msg, 'error')
    } finally {
      setBusyTweakId(null)
    }
  }

  const handleRevertPreviousCursorColor = async () => {
    if (!selectedSkinPath || busyTweakId) return
    setBusyTweakId('cursor-color')
    try {
      const updated = await window.tosuGui.revertPreviousCursorColor(selectedSkinPath)
      setCustomData(updated)
      onToast(
        lang === 'en'
          ? 'Cursor color reverted to previous change'
          : 'Цвет курсора возвращён к предыдущему изменению',
        'success'
      )
    } catch (err) {
      const msg = err instanceof Error ? err.message : (lang === 'en' ? 'Failed to revert cursor color' : 'Ошибка возврата цвета курсора')
      onToast(msg, 'error')
    } finally {
      setBusyTweakId(null)
    }
  }

  const handleSetComboColors = async (colors: string[]) => {
    if (!selectedSkinPath || busyTweakId) return
    setBusyTweakId('combo-colors')
    try {
      const updated = await window.tosuGui.setSkinComboColors({
        skinPath: selectedSkinPath,
        colors,
      })
      setCustomData(updated)
      onToast(lang === 'en' ? 'Combo note colors saved to skin.ini' : 'Цвета комбо-нот успешно сохранены в скине', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : (lang === 'en' ? 'Failed to save combo colors' : 'Ошибка сохранения цветов комбо')
      onToast(msg, 'error')
    } finally {
      setBusyTweakId(null)
    }
  }

  const handleResetAll = async () => {
    if (!selectedSkinPath || resettingAll) return
    setResettingAll(true)
    try {
      const updated = await window.tosuGui.resetAllSkinTweaks(selectedSkinPath)
      setCustomData(updated)
      setShowResetModal(false)
      onToast(lang === 'en' ? 'All skin modifications successfully reset to original' : 'Все настройки скина успешно сброшены к оригиналу', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : (lang === 'en' ? 'Failed to reset skin modifications' : 'Ошибка сброса настроек скина')
      onToast(msg, 'error')
    } finally {
      setResettingAll(false)
    }
  }

  const handleOpenFolder = async () => {
    try {
      await window.tosuGui.openSkinsFolder()
    } catch (err) {
      const msg = err instanceof Error ? err.message : (lang === 'en' ? 'Skins folder not found' : 'Папка Skins не найдена')
      onToast(msg, 'error')
    }
  }

  // Split tweaks into element modifications and color tweaks
  const allTweaks = customData?.tweaks || []
  const toggleTweaks = allTweaks.filter((t) => t.id !== 'cursor-color' && t.id !== 'combo-colors')
  const cursorColorTweak = allTweaks.find((t) => t.id === 'cursor-color')
  const comboColorTweak = allTweaks.find((t) => t.id === 'combo-colors')

  const modifiedColorsCount =
    (cursorColorTweak?.applied ? 1 : 0) + (comboColorTweak?.applied ? 1 : 0)

  // Filter tweaks by category
  const filteredTweaks = toggleTweaks.filter((t) => {
    if (activeCategory === 'all') return true
    return t.category === activeCategory
  })

  // Category counts (only counting element modifications)
  const getCategoryCount = (catId: FilterCategory) => {
    if (!customData) return 0
    if (catId === 'all') return toggleTweaks.length
    return toggleTweaks.filter((t) => t.category === catId).length
  }

  return (
    <div className="customizer-page">
      {/* Header */}
      <div className="customizer-header">
        <div className="customizer-title-row">
          <div className="customizer-title-group">
            <h1>{t('skinCustomizer.title')}</h1>
            <p className="customizer-subtitle">
              {t('skinCustomizer.subtitle')}
            </p>
          </div>
          {customData && (
            <div className="customizer-status-summary">
              {customData.modifiedCount > 0 ? (
                <span className="customizer-status-badge -active">
                  {t('skinCustomizer.modifiedElements', { count: customData.modifiedCount })}
                </span>
              ) : (
                <span className="customizer-status-badge">
                  {t('skinCustomizer.originalSkin')}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="customizer-actions-row">
          <div className="customizer-skin-picker">
            <select
              className="customizer-select"
              value={selectedSkinPath}
              onChange={(e) => setSelectedSkinPath(e.target.value)}
              disabled={loadingSkins || skins.length === 0}
            >
              {skins.length === 0 ? (
                <option value="">{t('skinCustomizer.noSkinsFound')}</option>
              ) : (
                skins.map((skin) => (
                  <option key={skin.path} value={skin.path}>
                    {skin.name}
                  </option>
                ))
              )}
            </select>

            <button
              className="customizer-btn"
              onClick={() => void loadLocalSkins(selectedSkinPath)}
              title={t('skinCustomizer.updateSkinList')}
              disabled={loadingSkins}
            >
              <RefreshCw size={14} className={loadingSkins ? 'spin' : ''} />
              {t('skinCustomizer.updateSkinList')}
            </button>

            <button
              className="customizer-btn"
              onClick={() => void handleOpenFolder()}
              title={t('skinCustomizer.skinsFolder')}
            >
              <FolderOpen size={14} />
              {t('skinCustomizer.skinsFolder')}
            </button>
          </div>

          <div className="customizer-global-actions">
            <button
              className="customizer-btn -danger"
              disabled={!customData || customData.modifiedCount === 0 || !customData.hasBackup}
              onClick={() => setShowResetModal(true)}
              title={t('skinCustomizer.resetAll')}
            >
              <RotateCcw size={14} />
              {t('skinCustomizer.resetAll')}
            </button>
          </div>
        </div>

        {/* Top-Level Mode Switcher: Tweaks vs Color Studio */}
        <div className="customizer-mode-switch-row">
          <div className="customizer-mode-switch">
            <button
              type="button"
              className={`customizer-mode-btn ${mainView === 'tweaks' ? '-active' : ''}`}
              onClick={() => setMainView('tweaks')}
            >
              <SlidersHorizontal size={14} />
              <span>{t('skinCustomizer.modeTweaks')}</span>
              <span className="customizer-mode-count">{toggleTweaks.length}</span>
            </button>

            <button
              type="button"
              className={`customizer-mode-btn ${mainView === 'colors' ? '-active' : ''}`}
              onClick={() => setMainView('colors')}
            >
              <Palette size={14} />
              <span>{t('skinCustomizer.modeColors')}</span>
              {modifiedColorsCount > 0 ? (
                <span className="customizer-mode-badge -modified">{t('skinCustomizer.modifiedCount', { count: modifiedColorsCount })}</span>
              ) : (
                <span className="customizer-mode-count">2</span>
              )}
            </button>
          </div>
        </div>

        {/* Category Filter Pills (when in tweaks mode) */}
        {mainView === 'tweaks' && (
          <div className="customizer-filter-row">
            <div className="customizer-tabs">
              {CATEGORIES.map((cat) => {
                const count = getCategoryCount(cat.id)
                return (
                  <button
                    key={cat.id}
                    className={`customizer-tab ${activeCategory === cat.id ? '-active' : ''}`}
                    onClick={() => setActiveCategory(cat.id)}
                  >
                    {cat.label}
                    <span className="customizer-tab-count">{count}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Sub-Navigation (when in colors mode) */}
        {mainView === 'colors' && (
          <div className="color-studio-nav-row">
            <div className="color-studio-tabs">
              <button
                type="button"
                className={`color-studio-tab ${colorSubTab === 'combo' ? '-active' : ''}`}
                onClick={() => setColorSubTab('combo')}
              >
                <span className="color-studio-tab-indicator -combo" />
                <span>{t('skinCustomizer.subtabCombo')}</span>
                {comboColorTweak?.applied && (
                  <span className="color-studio-tab-pill">{t('skinCustomizer.modified')}</span>
                )}
              </button>

              <button
                type="button"
                className={`color-studio-tab ${colorSubTab === 'cursor' ? '-active' : ''}`}
                onClick={() => setColorSubTab('cursor')}
              >
                <span className="color-studio-tab-indicator -cursor" />
                <span>{t('skinCustomizer.subtabCursor')}</span>
                {cursorColorTweak?.applied && (
                  <span className="color-studio-tab-pill">{t('skinCustomizer.modified')}</span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Body Content */}
      {loadingCustomData ? (
        <div className="customizer-empty">
          <Loader2 size={24} className="spin" />
          <span>{t('skinCustomizer.readingElements')}</span>
        </div>
      ) : skins.length === 0 ? (
        <div className="customizer-empty">
          <p>{t('skinCustomizer.noSkinsInFolder')}</p>
          <button className="customizer-btn" onClick={() => void handleOpenFolder()}>
            <FolderOpen size={14} />
            {t('skinCustomizer.openSkinsFolder')}
          </button>
        </div>
      ) : mainView === 'colors' ? (
        <div className="color-studio-container">
          {colorSubTab === 'combo' ? (
            comboColorTweak ? (
              <ComboColorStudio
                tweak={comboColorTweak}
                isBusy={busyTweakId === 'combo-colors'}
                onSetComboColors={handleSetComboColors}
                onReset={() => void handleResetTweak(comboColorTweak)}
              />
            ) : (
              <div className="customizer-empty">
                <p>{lang === 'en' ? 'Combo color settings are not available for this skin.' : 'Настройки комбо-цветов недоступны для этого скина.'}</p>
              </div>
            )
          ) : cursorColorTweak ? (
            <CursorColorStudio
              tweak={cursorColorTweak}
              isBusy={busyTweakId === 'cursor-color'}
              isTrailDisabled={Boolean(
                toggleTweaks.find((t) => t.id === 'cursor-trail')?.applied
              )}
              isContinuousTrail={Boolean(
                toggleTweaks.find((t) => t.id === 'continuous-cursor-trail')?.applied
              )}
              onRecolorCursor={handleRecolorCursor}
              onReset={() => void handleResetTweak(cursorColorTweak)}
              onRevertPrevious={handleRevertPreviousCursorColor}
            />
          ) : (
            <div className="customizer-empty">
              <p>{lang === 'en' ? 'Cursor color settings are not available for this skin.' : 'Настройки цвета курсора недоступны для этого скина.'}</p>
            </div>
          )}
        </div>
      ) : filteredTweaks.length === 0 ? (
        <div className="customizer-empty">
          <p>{t('skinCustomizer.noTweaksInCategory')}</p>
        </div>
      ) : (
        <div className="customizer-grid">
          {(() => {
            const isTrailDisabled = Boolean(
              toggleTweaks.find((t) => t.id === 'cursor-trail')?.applied
            )
            const isContinuousTrail = Boolean(
              toggleTweaks.find((t) => t.id === 'continuous-cursor-trail')?.applied
            )
            return filteredTweaks.map((tweak) => (
              <TweakCard
                key={tweak.id}
                tweak={tweak}
                isBusy={busyTweakId === tweak.id}
                isTrailDisabled={isTrailDisabled}
                isContinuousTrail={isContinuousTrail}
                onToggle={() => void handleToggleTweak(tweak)}
                onReset={() => void handleResetTweak(tweak)}
              />
            ))
          })()}
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div className="customizer-modal-overlay" onClick={() => setShowResetModal(false)}>
          <div className="customizer-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="customizer-modal-title">{t('skinCustomizer.resetConfirmTitle')}</h2>
            <p className="customizer-modal-desc">
              {t('skinCustomizer.resetConfirmDesc')}
            </p>
            <div className="customizer-modal-actions">
              <button
                className="customizer-btn"
                onClick={() => setShowResetModal(false)}
                disabled={resettingAll}
              >
                {t('common.cancel')}
              </button>
              <button
                className="customizer-btn -danger"
                onClick={() => void handleResetAll()}
                disabled={resettingAll}
              >
                {resettingAll ? (
                  <>
                    <Loader2 size={14} className="spin" />
                    {t('skinCustomizer.restoring')}
                  </>
                ) : (
                  t('skinCustomizer.resetAllBtn')
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// --- Color & Math helpers ---

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6
        break
      case g:
        h = ((b - r) / d + 2) / 6
        break
      case b:
        h = ((r - g) / d + 4) / 6
        break
    }
  }

  return [h * 360, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = (((h % 360) + 360) % 360) / 360
  let r: number, g: number, b: number

  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

function rgbStringToRgb(str: string): [number, number, number] {
  if (!str) return [255, 255, 255]
  const parts = str.split(',').map((p) => parseInt(p.trim(), 10))
  if (parts.length >= 3 && parts.slice(0, 3).every((n) => !isNaN(n))) {
    return [
      Math.max(0, Math.min(255, parts[0])),
      Math.max(0, Math.min(255, parts[1])),
      Math.max(0, Math.min(255, parts[2])),
    ]
  }
  return [255, 255, 255]
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(n)))
    return clamped.toString(16).padStart(2, '0')
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function rgbStringToHex(str: string): string {
  const [r, g, b] = rgbStringToRgb(str)
  return rgbToHex(r, g, b)
}

function hexToRgb(hex: string): [number, number, number] {
  let clean = hex.replace(/^#/, '').trim()
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
  }
  if (clean.length !== 6) {
    return [255, 255, 255]
  }
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  return [
    isNaN(r) ? 255 : Math.max(0, Math.min(255, r)),
    isNaN(g) ? 255 : Math.max(0, Math.min(255, g)),
    isNaN(b) ? 255 : Math.max(0, Math.min(255, b)),
  ]
}

function hexToRgbString(hex: string): string {
  const [r, g, b] = hexToRgb(hex)
  return `${r}, ${g}, ${b}`
}

function hslToHex(h: number, s: number, l: number): string {
  const [r, g, b] = hslToRgb(h, s, l)
  return rgbToHex(r, g, b)
}

function tintHitcircleSprite(
  img: HTMLImageElement,
  rgb: [number, number, number]
): HTMLCanvasElement | null {
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  if (!w || !h) return null

  const off = document.createElement('canvas')
  off.width = w
  off.height = h
  const octx = off.getContext('2d')
  if (!octx) return null

  octx.drawImage(img, 0, 0)
  const imgData = octx.getImageData(0, 0, w, h)
  const data = imgData.data
  const [cr, cg, cb] = rgb

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 5) continue
    data[i] = Math.round((data[i] * cr) / 255)
    data[i + 1] = Math.round((data[i + 1] * cg) / 255)
    data[i + 2] = Math.round((data[i + 2] * cb) / 255)
  }

  octx.putImageData(imgData, 0, 0)
  return off
}

// --- Tweak Card Component ---

interface TweakCardProps {
  tweak: SkinTweakInfo
  isBusy: boolean
  isTrailDisabled?: boolean
  isContinuousTrail?: boolean
  onToggle: () => void
  onReset: () => void
}

const COLOR_PRESETS = [
  { name: 'Красный', hue: 0, hex: '#ff453a' },
  { name: 'Оранжевый', hue: 30, hex: '#ff9f0a' },
  { name: 'Желтый', hue: 60, hex: '#ffd60a' },
  { name: 'Зеленый', hue: 120, hex: '#32d74b' },
  { name: 'Бирюзовый', hue: 175, hex: '#64d2ff' },
  { name: 'Синий', hue: 215, hex: '#0a84ff' },
  { name: 'Фиолетовый', hue: 275, hex: '#bf5af2' },
  { name: 'Розовый', hue: 330, hex: '#ff375f' },
]

const COMBO_COLOR_PRESETS = [
  { name: 'Красный', hex: '#ff453a' },
  { name: 'Оранжевый', hex: '#ff9f0a' },
  { name: 'Желтый', hex: '#ffd60a' },
  { name: 'Лайм', hex: '#32d74b' },
  { name: 'Мята', hex: '#30e0a5' },
  { name: 'Циан', hex: '#40c8e0' },
  { name: 'Синий', hex: '#0a84ff' },
  { name: 'Индиго', hex: '#5e5ce6' },
  { name: 'Фиолетовый', hex: '#af52de' },
  { name: 'Розовый', hex: '#ff2d55' },
  { name: 'Белый', hex: '#ffffff' },
  { name: 'Графит', hex: '#8e8e93' },
]

const COMBO_THEMES = [
  {
    name: 'Стандарт',
    colors: ['255, 192, 0', '0, 202, 0', '18, 124, 255', '242, 24, 57'],
  },
  {
    name: 'Киберпанк',
    colors: ['0, 240, 255', '255, 0, 119', '153, 0, 255', '50, 215, 75'],
  },
  {
    name: 'Пастель',
    colors: ['255, 179, 186', '255, 223, 186', '255, 255, 186', '186, 225, 255'],
  },
  {
    name: 'Закат',
    colors: ['123, 31, 162', '244, 81, 30', '255, 179, 0', '233, 30, 99'],
  },
  {
    name: 'Монохром',
    colors: ['255, 255, 255', '144, 202, 249', '176, 190, 197'],
  },
]

function TweakCard({
  tweak,
  isBusy,
  isTrailDisabled,
  isContinuousTrail,
  onToggle,
  onReset,
}: TweakCardProps) {
  const { t } = useI18n()
  const categoryLabels: Record<SkinTweakCategory, string> = {
    cursor: t('skinCustomizer.catCursor'),
    gameplay: t('skinCustomizer.catGameplay'),
    interface: t('skinCustomizer.catInterface'),
    audio: t('skinCustomizer.catAudioSingle'),
  }

  const localizedTitle = t(`skinCustomizer.tweaks.${tweak.id}.title`)
  const title = localizedTitle || tweak.title
  const desc = t(`skinCustomizer.tweaks.${tweak.id}.desc`) || tweak.description

  return (
    <div
      className={`customizer-card ${tweak.applied ? '-applied' : ''} ${
        isBusy ? '-busy' : ''
      }`}
    >
      {/* Top Header */}
      <div className="customizer-card-header">
        <div className="customizer-card-titles">
          <div className="customizer-card-title-row">
            <span className="customizer-card-title">{title}</span>
            <span className="customizer-card-badge">
              {categoryLabels[tweak.category] || tweak.category}
            </span>
          </div>
          {tweak.subtitle && (
            <span className="customizer-card-subtitle">{tweak.subtitle}</span>
          )}
        </div>

        {/* Toggle Switch */}
        <div className="customizer-card-switch">
          {tweak.canReset && (
            <button
              type="button"
              className="customizer-icon-btn"
              onClick={onReset}
              disabled={isBusy}
              title={t('skinCustomizer.revertBackupTooltip')}
            >
              <RotateCcw size={13} />
            </button>
          )}
          <label className="customizer-switch">
            <input
              type="checkbox"
              checked={tweak.applied}
              onChange={onToggle}
              disabled={isBusy}
            />
            <span className="customizer-slider" />
          </label>
        </div>
      </div>

      {/* Preview Box */}
      <div className="customizer-card-preview">
        {tweak.previewType === 'cursor' ? (
          <CursorInteractivePreview
            key={`card-preview-${tweak.id}-${tweak.applied ? 'applied' : 'clean'}-${tweak.previewImage?.length || 0}`}
            cursorUrl={tweak.previewCursorImage}
            trailUrl={tweak.previewImage}
            trailDisabled={Boolean(tweak.id === 'cursor-trail' ? tweak.applied : isTrailDisabled)}
            continuousTrail={Boolean(tweak.id === 'continuous-cursor-trail' ? tweak.applied : isContinuousTrail)}
          />
        ) : tweak.previewType === 'audio' ? (
          <AudioTweakPreview
            audioUrl={tweak.previewAudio}
            applied={tweak.applied}
          />
        ) : tweak.previewType === 'ini' ? (
          <IniCursorPreview
            cursorUrl={tweak.previewCursorImage || tweak.previewImage}
            isExpandTweak={tweak.id === 'cursor-expand'}
            isRotateTweak={tweak.id === 'cursor-rotate'}
            applied={tweak.applied}
          />
        ) : (
          <ImageTweakPreview
            imageUrl={tweak.previewImage}
            applied={tweak.applied}
          />
        )}
      </div>

      {/* Card Body */}
      <div className="customizer-card-body">
        <h3 className="customizer-card-title">{title}</h3>
        <span className="customizer-card-files" title={tweak.subtitle}>
          {tweak.subtitle}
        </span>
        <p className="customizer-card-desc">{desc}</p>
      </div>

      {/* Card Footer */}
      <div className="customizer-card-footer">
        <span className={`customizer-status-text ${tweak.applied ? '-on' : ''}`}>
          {tweak.applied ? t('skinCustomizer.tweakActive') : t('skinCustomizer.standardLook')}
        </span>
        {isBusy && <Loader2 size={14} className="spin" />}
      </div>
    </div>
  )
}

// --- Dedicated Color Studio Components ---

interface ComboColorStudioProps {
  tweak: SkinTweakInfo
  isBusy: boolean
  onSetComboColors: (colors: string[]) => Promise<void>
  onReset: () => void
}

function ComboColorStudio({
  tweak,
  isBusy,
  onSetComboColors,
  onReset,
}: ComboColorStudioProps) {
  const { t } = useI18n()
  const rawComboColors: string[] =
    Array.isArray(tweak.meta?.colors) && tweak.meta.colors.length > 0
      ? tweak.meta.colors
      : ['255, 192, 0', '0, 202, 0', '18, 124, 255', '242, 24, 57']

  const [comboColors, setComboColors] = useState<string[]>(rawComboColors)
  const [selectedComboIdx, setSelectedComboIdx] = useState<number>(0)
  const [hasComboChanged, setHasComboChanged] = useState<boolean>(false)

  // Persistent Hue & Saturation per combo index so dragging Saturation to 0 or Lightness to extremes never destroys Hue
  const [comboHues, setComboHues] = useState<Record<number, number>>({})
  const [comboSats, setComboSats] = useState<Record<number, number>>({})

  useEffect(() => {
    const metaColors = tweak.meta?.colors
    if (Array.isArray(metaColors) && metaColors.length > 0) {
      setComboColors(metaColors)
      setSelectedComboIdx((prev) => Math.min(prev, metaColors.length - 1))
      setHasComboChanged(false)
    }
  }, [tweak.meta?.colors])

  const activeComboRgbStr = comboColors[selectedComboIdx] || '255, 192, 0'
  const activeComboHex = rgbStringToHex(activeComboRgbStr)
  const [hexInputVal, setHexInputVal] = useState<string>(activeComboHex)

  useEffect(() => {
    setHexInputVal(activeComboHex)
  }, [activeComboHex, selectedComboIdx])

  const [activeR, activeG, activeB] = rgbStringToRgb(activeComboRgbStr)
  const [rawHue, rawSat, rawLit] = rgbToHsl(activeR, activeG, activeB)

  // Cache Hue and Saturation whenever the active color has chromatic info (sat > 0.02 and not pure black/white)
  useEffect(() => {
    if (rawSat > 0.02 && rawLit > 0.03 && rawLit < 0.97) {
      setComboHues((prev) => (prev[selectedComboIdx] === rawHue ? prev : { ...prev, [selectedComboIdx]: rawHue }))
      setComboSats((prev) => (prev[selectedComboIdx] === rawSat ? prev : { ...prev, [selectedComboIdx]: rawSat }))
    }
  }, [selectedComboIdx, rawHue, rawSat, rawLit])

  const currentComboHue = comboHues[selectedComboIdx] !== undefined ? comboHues[selectedComboIdx] : rawHue
  const currentComboSat = comboSats[selectedComboIdx] !== undefined ? comboSats[selectedComboIdx] : rawSat
  const currentComboLit = rawLit

  const handleComboPresetSelect = (hex: string) => {
    const [r, g, b] = hexToRgb(hex)
    const [h, s] = rgbToHsl(r, g, b)
    if (s > 0.02) {
      setComboHues((prev) => ({ ...prev, [selectedComboIdx]: h }))
      setComboSats((prev) => ({ ...prev, [selectedComboIdx]: s }))
    }
    const updated = [...comboColors]
    updated[selectedComboIdx] = hexToRgbString(hex)
    setComboColors(updated)
    setHasComboChanged(true)
  }

  const handleComboHueSlider = (hue: number) => {
    setComboHues((prev) => ({ ...prev, [selectedComboIdx]: hue }))
    const sat = Math.max(0.4, currentComboSat)
    setComboSats((prev) => ({ ...prev, [selectedComboIdx]: sat }))
    const lit = Math.max(0.2, Math.min(0.8, currentComboLit))
    const [nr, ng, nb] = hslToRgb(hue, sat, lit)
    const updated = [...comboColors]
    updated[selectedComboIdx] = `${nr}, ${ng}, ${nb}`
    setComboColors(updated)
    setHasComboChanged(true)
  }

  const handleComboSatSlider = (satPct: number) => {
    const sat = satPct / 100
    setComboSats((prev) => ({ ...prev, [selectedComboIdx]: sat }))
    const lit = Math.max(0.05, Math.min(0.95, currentComboLit))
    const [nr, ng, nb] = hslToRgb(currentComboHue, sat, lit)
    const updated = [...comboColors]
    updated[selectedComboIdx] = `${nr}, ${ng}, ${nb}`
    setComboColors(updated)
    setHasComboChanged(true)
  }

  const handleComboLitSlider = (litPct: number) => {
    const lit = litPct / 100
    const sat = currentComboSat
    const [nr, ng, nb] = hslToRgb(currentComboHue, sat, lit)
    const updated = [...comboColors]
    updated[selectedComboIdx] = `${nr}, ${ng}, ${nb}`
    setComboColors(updated)
    setHasComboChanged(true)
  }

  const handleCancelComboChanges = () => {
    const metaColors = tweak.meta?.colors
    if (Array.isArray(metaColors) && metaColors.length > 0) {
      setComboColors(metaColors)
      setSelectedComboIdx((prev) => Math.min(prev, metaColors.length - 1))
    }
    setHasComboChanged(false)
  }

  const handleNativeColorChange = (hex: string) => {
    const [r, g, b] = hexToRgb(hex)
    const [h, s] = rgbToHsl(r, g, b)
    if (s > 0.02) {
      setComboHues((prev) => ({ ...prev, [selectedComboIdx]: h }))
      setComboSats((prev) => ({ ...prev, [selectedComboIdx]: s }))
    }
    const updated = [...comboColors]
    updated[selectedComboIdx] = hexToRgbString(hex)
    setComboColors(updated)
    setHasComboChanged(true)
  }

  const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setHexInputVal(val)
    const clean = val.replace(/^#/, '').trim()
    if (clean.length === 6 && /^[0-9a-fA-F]{6}$/.test(clean)) {
      const hex = '#' + clean
      const [r, g, b] = hexToRgb(hex)
      const [h, s] = rgbToHsl(r, g, b)
      if (s > 0.02) {
        setComboHues((prev) => ({ ...prev, [selectedComboIdx]: h }))
        setComboSats((prev) => ({ ...prev, [selectedComboIdx]: s }))
      }
      const updated = [...comboColors]
      updated[selectedComboIdx] = hexToRgbString(hex)
      setComboColors(updated)
      setHasComboChanged(true)
    }
  }

  const handleHexInputBlur = () => {
    setHexInputVal(activeComboHex)
  }

  const handleAddCombo = () => {
    if (comboColors.length >= 8) return
    const suggestions = [
      '255, 75, 255',
      '255, 165, 0',
      '0, 255, 255',
      '255, 215, 0',
      '144, 238, 144',
      '255, 105, 180',
    ]
    const next = suggestions[comboColors.length % suggestions.length]
    const updated = [...comboColors, next]
    setComboColors(updated)
    setSelectedComboIdx(updated.length - 1)
    setHasComboChanged(true)
  }

  const handleRemoveCombo = () => {
    if (comboColors.length <= 1) return
    const updated = comboColors.filter((_, i) => i !== selectedComboIdx)
    setComboColors(updated)
    setSelectedComboIdx((prev) => Math.max(0, Math.min(prev, updated.length - 1)))
    setHasComboChanged(true)
  }

  const handleApplyTheme = (colors: string[]) => {
    setComboColors([...colors])
    setSelectedComboIdx(0)
    setHasComboChanged(true)
  }

  const handleApplyComboColors = () => {
    void onSetComboColors(comboColors)
    setHasComboChanged(false)
  }

  return (
    <div className="color-studio-pane">
      <div className="color-studio-header">
        <div className="color-studio-header-info">
          <div className="color-studio-title-badge-row">
            <h2>{t('skinCustomizer.comboTitle')}</h2>
            <span className="color-studio-tag">Combo 1–{comboColors.length}</span>
          </div>
          <span className="color-studio-header-files">skin.ini: [Colours] → Combo1…Combo8</span>
          <p className="color-studio-header-desc">
            {t('skinCustomizer.comboDesc')}
          </p>
        </div>
        <div className="color-studio-header-status">
          <span className={`customizer-status-badge ${tweak.applied ? '-active' : ''}`}>
            {tweak.applied
              ? t('skinCustomizer.customPaletteActive', { count: comboColors.length })
              : tweak.meta?.isDefault
              ? t('skinCustomizer.defaultColorsOsu', { count: comboColors.length })
              : t('skinCustomizer.originalSkinColors', { count: comboColors.length })}
          </span>
          {tweak.canReset && (
            <button
              type="button"
              className="customizer-btn -danger"
              onClick={onReset}
              disabled={isBusy}
              title={t('skinCustomizer.revertBackup')}
            >
              <RotateCcw size={13} />
              {t('skinCustomizer.revertBackup')}
            </button>
          )}
        </div>
      </div>

      <div className="color-studio-grid">
        {/* Left Column: Interactive Canvas & Combo Pills */}
        <div className="color-studio-preview-col">
          <div className="color-studio-preview-box">
            <ComboInteractivePreview
              colors={comboColors}
              selectedComboIndex={selectedComboIdx}
              hitcircleUrl={tweak.meta?.hitcircleImage}
              overlayUrl={tweak.meta?.hitcircleOverlayImage}
              default1Url={tweak.meta?.default1Image}
              digitImages={tweak.meta?.digitImages}
              approachCircleUrl={tweak.meta?.approachCircleImage}
              onSelectCombo={(idx) => setSelectedComboIdx(idx)}
            />
          </div>

          <div className="color-studio-pills-card">
            <div className="color-studio-pills-header">
              <span className="color-studio-pills-title">{t('skinCustomizer.comboSequence')}</span>
              <span className="color-studio-pills-count">{t('skinCustomizer.comboOfEight', { count: comboColors.length })}</span>
            </div>

            <div className="combo-pills-row">
              {comboColors.map((colStr, idx) => {
                const hex = rgbStringToHex(colStr)
                return (
                  <button
                    key={idx}
                    type="button"
                    className={`combo-pill ${selectedComboIdx === idx ? '-active' : ''}`}
                    style={{ backgroundColor: hex }}
                    onClick={() => setSelectedComboIdx(idx)}
                    title={`Combo ${idx + 1}: ${hex} (RGB: ${colStr})`}
                    disabled={isBusy}
                  >
                    {idx + 1}
                  </button>
                )
              })}

              <button
                type="button"
                className="combo-pill-btn"
                onClick={handleAddCombo}
                disabled={isBusy || comboColors.length >= 8}
                title="+ Combo (max 8)"
              >
                <Plus size={14} />
              </button>

              <button
                type="button"
                className="combo-pill-btn -danger"
                onClick={handleRemoveCombo}
                disabled={isBusy || comboColors.length <= 1}
                title="- Combo"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <span className="color-studio-pills-hint">
              {t('skinCustomizer.clickNoteHint')}
            </span>
          </div>
        </div>

        {/* Right Column: Colors, Presets & Controls */}
        <div className="color-studio-controls-col">
          {/* Active Note Info & Direct Input */}
          <div className="color-studio-section">
            <div className="color-studio-section-title">
              <span>{t('skinCustomizer.activeNoteColor', { num: selectedComboIdx + 1 })}</span>
              <span className="combo-color-badge">{activeComboHex.toUpperCase()}</span>
            </div>

            <div className="combo-inputs-row">
              <div
                className="combo-native-picker-wrapper"
                style={{ backgroundColor: activeComboHex }}
                title={t('skinCustomizer.nativePickerTitle')}
              >
                <input
                  type="color"
                  value={activeComboHex}
                  onChange={(e) => handleNativeColorChange(e.target.value)}
                  className="combo-native-picker"
                  disabled={isBusy}
                />
              </div>

              <input
                type="text"
                value={hexInputVal}
                onChange={handleHexInputChange}
                onBlur={handleHexInputBlur}
                className="combo-hex-input"
                maxLength={7}
                placeholder="#ff9f0a"
                disabled={isBusy}
                title="HEX"
              />

              <div className="combo-rgb-badge" title="RGB">
                <span>R: {activeR}</span>
                <span>G: {activeG}</span>
                <span>B: {activeB}</span>
              </div>
            </div>
          </div>

          {/* Quick Swatches */}
          <div className="color-studio-section">
            <span className="color-studio-section-title">{t('skinCustomizer.quickColors')}</span>
            <div className="combo-swatches-grid">
              {COMBO_COLOR_PRESETS.map((p) => {
                const isSelected = activeComboHex.toLowerCase() === p.hex.toLowerCase()
                return (
                  <button
                    key={p.hex}
                    type="button"
                    className={`combo-swatch ${isSelected ? '-active' : ''}`}
                    style={{ backgroundColor: p.hex }}
                    onClick={() => handleComboPresetSelect(p.hex)}
                    title={p.name}
                    disabled={isBusy}
                  />
                )
              })}
            </div>
          </div>

          {/* HSL Sliders */}
          <div className="color-studio-section">
            <span className="color-studio-section-title">{t('skinCustomizer.hslTitle')}</span>
            <div className="combo-sliders-block">
              <div className="combo-slider-row">
                <span className="combo-slider-label">{t('skinCustomizer.smoothHue')}</span>
                <input
                  type="range"
                  min="0"
                  max="360"
                  value={Math.round(currentComboHue)}
                  onChange={(e) => handleComboHueSlider(Number(e.target.value))}
                  className="combo-hue-slider"
                  disabled={isBusy}
                  title="Hue (0-360°)"
                />
                <span className="combo-slider-val">{Math.round(currentComboHue)}°</span>
              </div>

              <div className="combo-slider-row">
                <span className="combo-slider-label">{t('skinCustomizer.saturation')}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round(currentComboSat * 100)}
                  onChange={(e) => handleComboSatSlider(Number(e.target.value))}
                  className="combo-sat-slider"
                  style={{
                    background: `linear-gradient(to right, ${hslToHex(currentComboHue, 0, currentComboLit || 0.5)}, ${hslToHex(currentComboHue, 1, currentComboLit || 0.5)})`,
                  }}
                  disabled={isBusy}
                  title="Saturation (0-100%)"
                />
                <span className="combo-slider-val">{Math.round(currentComboSat * 100)}%</span>
              </div>

              <div className="combo-slider-row">
                <span className="combo-slider-label">{t('skinCustomizer.lightness')}</span>
                <input
                  type="range"
                  min="5"
                  max="95"
                  value={Math.round(currentComboLit * 100)}
                  onChange={(e) => handleComboLitSlider(Number(e.target.value))}
                  className="combo-lit-slider"
                  style={{
                    background: `linear-gradient(to right, #000000, ${hslToHex(currentComboHue, currentComboSat || 0.85, 0.5)}, #ffffff)`,
                  }}
                  disabled={isBusy}
                  title="Lightness (5-95%)"
                />
                <span className="combo-slider-val">{Math.round(currentComboLit * 100)}%</span>
              </div>
            </div>
          </div>

          {/* Themes Presets */}
          <div className="color-studio-section">
            <span className="color-studio-section-title">{t('skinCustomizer.themes')}</span>
            <div className="combo-themes-list">
              {COMBO_THEMES.map((theme) => (
                <button
                  key={theme.name}
                  type="button"
                  className="combo-theme-btn"
                  onClick={() => handleApplyTheme(theme.colors)}
                  disabled={isBusy}
                  title={theme.name}
                >
                  <span className="combo-theme-preview-dots">
                    {theme.colors.map((c, i) => (
                      <span
                        key={i}
                        className="combo-theme-dot"
                        style={{ backgroundColor: rgbStringToHex(c) }}
                      />
                    ))}
                  </span>
                  {theme.name}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="color-studio-actions">
            <button
              type="button"
              className="color-studio-apply-btn"
              onClick={handleApplyComboColors}
              disabled={isBusy || (!hasComboChanged && tweak.applied)}
              title={t('skinCustomizer.applyColorsIni')}
            >
              {isBusy ? <Loader2 size={14} className="spin" /> : <Palette size={14} />}
              {t('skinCustomizer.applyColorsIni')}
            </button>

            {hasComboChanged && (
              <button
                type="button"
                className="color-studio-cancel-btn"
                onClick={handleCancelComboChanges}
                disabled={isBusy}
                title={t('skinCustomizer.cancelChanges')}
              >
                <RotateCcw size={13} />
                {t('skinCustomizer.cancelChanges')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

interface CursorColorStudioProps {
  tweak: SkinTweakInfo
  isBusy: boolean
  isTrailDisabled: boolean
  isContinuousTrail?: boolean
  onRecolorCursor: (hue: number, recolorTrail: boolean) => Promise<void>
  onReset: () => void
  onRevertPrevious?: () => void
}

function CursorColorStudio({
  tweak,
  isBusy,
  isTrailDisabled,
  isContinuousTrail,
  onRecolorCursor,
  onReset,
  onRevertPrevious,
}: CursorColorStudioProps) {
  const { t } = useI18n()
  const initialHue = typeof tweak.meta?.hue === 'number' ? tweak.meta.hue : 215
  const initialRecolorTrail = typeof tweak.meta?.recolorTrail === 'boolean' ? tweak.meta.recolorTrail : true

  const [selectedHue, setSelectedHue] = useState<number>(initialHue)
  const [recolorTrail, setRecolorTrail] = useState<boolean>(initialRecolorTrail)
  const [hasColorChanged, setHasColorChanged] = useState<boolean>(false)
  const [resetCount, setResetCount] = useState<number>(0)

  const hasHistory = Array.isArray(tweak.meta?.history) && tweak.meta.history.length > 0
  const canRevertPrevious = tweak.applied && (hasHistory || tweak.canReset)

  useEffect(() => {
    if (tweak.applied && typeof tweak.meta?.hue === 'number') {
      setSelectedHue(tweak.meta.hue)
      setRecolorTrail(typeof tweak.meta?.recolorTrail === 'boolean' ? tweak.meta.recolorTrail : true)
      setHasColorChanged(false)
    } else if (!tweak.applied) {
      setSelectedHue(215)
      setRecolorTrail(true)
      setHasColorChanged(false)
    }
  }, [tweak.applied, tweak.meta?.hue, tweak.meta?.recolorTrail])

  const handlePresetSelect = (hue: number) => {
    setSelectedHue(hue)
    setHasColorChanged(true)
  }

  const handleHueSlider = (val: number) => {
    setSelectedHue(val)
    setHasColorChanged(true)
  }

  const handleApplyColor = () => {
    void onRecolorCursor(selectedHue, recolorTrail)
    setHasColorChanged(false)
  }

  const handleReset = () => {
    setHasColorChanged(false)
    setSelectedHue(215)
    setRecolorTrail(true)
    setResetCount((c) => c + 1)
    onReset()
  }

  const handleRevertPrevious = () => {
    setHasColorChanged(false)
    setResetCount((c) => c + 1)
    onRevertPrevious?.()
  }

  const handleCancelChanges = () => {
    if (tweak.applied && typeof tweak.meta?.hue === 'number') {
      setSelectedHue(tweak.meta.hue)
      setRecolorTrail(typeof tweak.meta?.recolorTrail === 'boolean' ? tweak.meta.recolorTrail : true)
    } else {
      setSelectedHue(215)
      setRecolorTrail(true)
    }
    setHasColorChanged(false)
  }

  const effectiveCursorHue = hasColorChanged
    ? selectedHue
    : (tweak.applied && typeof tweak.meta?.hue === 'number' ? tweak.meta.hue : undefined)
  const effectiveTrailHue = recolorTrail ? effectiveCursorHue : undefined

  return (
    <div className="color-studio-pane">
      <div className="color-studio-header">
        <div className="color-studio-header-info">
          <div className="color-studio-title-badge-row">
            <h2>{t('skinCustomizer.cursorTitle')}</h2>
            <span className="color-studio-tag">cursor.png, cursortrail.png</span>
          </div>
          <p className="color-studio-header-desc">
            {t('skinCustomizer.cursorDesc')}
          </p>
        </div>
        <div className="color-studio-header-status">
          <span className={`customizer-status-badge ${tweak.applied ? '-active' : ''}`}>
            {tweak.applied ? t('skinCustomizer.customColorActive') : t('skinCustomizer.originalSkinColor')}
          </span>
          {canRevertPrevious && onRevertPrevious && (
            <button
              type="button"
              className="customizer-btn -secondary"
              onClick={handleRevertPrevious}
              disabled={isBusy}
              title={t('skinCustomizer.revertPreviousColorTooltip')}
            >
              <Undo2 size={13} />
              {t('skinCustomizer.revertPreviousColor')}
            </button>
          )}
          {tweak.canReset && (
            <button
              type="button"
              className="customizer-btn -danger"
              onClick={handleReset}
              disabled={isBusy}
              title={t('skinCustomizer.revertCursorBackup')}
            >
              <RotateCcw size={13} />
              {t('skinCustomizer.revertCursorBackup')}
            </button>
          )}
        </div>
      </div>

      <div className="color-studio-grid">
        {/* Left Column: Interactive Cursor Canvas */}
        <div className="color-studio-preview-col">
          <div className="color-studio-preview-box">
            <CursorInteractivePreview
              key={`studio-cursor-preview-${resetCount}-${tweak.applied ? 'applied' : 'clean'}-${tweak.meta?.hue ?? 'orig'}-${hasColorChanged ? selectedHue : 'unchanged'}-${recolorTrail ? 'trail-sync' : 'trail-keep'}-${isContinuousTrail ? 'continuous' : 'standard'}-${tweak.previewCursorImage?.length || 0}-${tweak.previewImage?.length || 0}`}
              cursorUrl={tweak.previewCursorImage}
              trailUrl={tweak.previewImage}
              trailDisabled={Boolean(isTrailDisabled)}
              continuousTrail={isContinuousTrail}
              hueShift={effectiveCursorHue}
              trailHueShift={effectiveTrailHue}
            />
          </div>

          <div className="color-studio-trail-info-card">
            <div className="color-studio-trail-info-row">
              <span className="color-studio-trail-info-title">{t('skinCustomizer.trailStatus')}</span>
              <span className={`color-studio-trail-badge ${isTrailDisabled ? '-disabled' : '-enabled'}`}>
                {isTrailDisabled ? t('skinCustomizer.trailDisabled') : t('skinCustomizer.trailEnabled')}
              </span>
            </div>
            <p className="color-studio-trail-info-desc">
              {isTrailDisabled
                ? t('skinCustomizer.trailDescDisabled')
                : recolorTrail
                ? t('skinCustomizer.trailDescSync')
                : t('skinCustomizer.trailDescKeep')}
            </p>
          </div>
        </div>

        {/* Right Column: Presets & Controls */}
        <div className="color-studio-controls-col">
          <div className="color-studio-section">
            <span className="color-studio-section-title">{t('skinCustomizer.quickCursorColors')}</span>
            <div className="cursor-color-palette">
              {COLOR_PRESETS.map((p) => (
                <button
                  key={p.hue}
                  type="button"
                  className={`cursor-color-swatch ${selectedHue === p.hue ? '-active' : ''}`}
                  style={{ backgroundColor: p.hex }}
                  onClick={() => handlePresetSelect(p.hue)}
                  title={p.name}
                  disabled={isBusy}
                />
              ))}
            </div>
          </div>

          <div className="color-studio-section">
            <div className="color-studio-section-title">
              <span>{t('skinCustomizer.smoothHueTitle')}</span>
              <span className="cursor-hue-badge">{selectedHue}°</span>
            </div>
            <div className="cursor-hue-row">
              <input
                type="range"
                min="0"
                max="360"
                value={selectedHue}
                onChange={(e) => handleHueSlider(Number(e.target.value))}
                className="cursor-hue-slider"
                disabled={isBusy}
                title="Hue (0–360°)"
              />
            </div>
          </div>

          <div className="color-studio-section">
            <label className="cursor-trail-toggle-label">
              <input
                type="checkbox"
                checked={recolorTrail}
                onChange={(e) => {
                  setRecolorTrail(e.target.checked)
                  setHasColorChanged(true)
                }}
                disabled={isBusy}
              />
              <span>{t('skinCustomizer.trailSync')}</span>
            </label>
          </div>

          <div className="color-studio-actions">
            <button
              type="button"
              className="color-studio-apply-btn"
              onClick={handleApplyColor}
              disabled={isBusy || (!hasColorChanged && tweak.applied)}
              title={t('skinCustomizer.applyCursorColor')}
            >
              {isBusy ? <Loader2 size={14} className="spin" /> : <Palette size={14} />}
              {t('skinCustomizer.applyCursorColor')}
            </button>

            {hasColorChanged && (
              <button
                type="button"
                className="color-studio-cancel-btn"
                onClick={handleCancelChanges}
                disabled={isBusy}
                title={t('skinCustomizer.cancelChanges')}
              >
                <RotateCcw size={13} />
                {t('skinCustomizer.cancelChanges')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Preview Components ---

function ComboInteractivePreview({
  colors,
  selectedComboIndex,
  hitcircleUrl,
  overlayUrl,
  default1Url,
  digitImages,
  approachCircleUrl,
  onSelectCombo,
}: {
  colors: string[]
  selectedComboIndex: number
  hitcircleUrl?: string | null
  overlayUrl?: string | null
  default1Url?: string | null
  digitImages?: Record<number, string | null>
  approachCircleUrl?: string | null
  onSelectCombo?: (index: number) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const hitcircleImgRef = useRef<HTMLImageElement | null>(null)
  const overlayImgRef = useRef<HTMLImageElement | null>(null)
  const digitImgsRef = useRef<Record<number, HTMLImageElement | null>>({})
  const approachCircleImgRef = useRef<HTMLImageElement | null>(null)
  const tintedHitcircleRef = useRef<HTMLCanvasElement | null>(null)
  const tintedApproachRef = useRef<HTMLCanvasElement | null>(null)
  const ripplesRef = useRef<{ x: number; y: number; birth: number; color: [number, number, number] }[]>([])
  const hitScaleRef = useRef<number>(1)
  const lastTimeRef = useRef<number>(performance.now())

  const activeColorStr = colors[selectedComboIndex] || '255, 192, 0'
  const activeRgb = rgbStringToRgb(activeColorStr)

  useEffect(() => {
    if (!hitcircleUrl) {
      hitcircleImgRef.current = null
      tintedHitcircleRef.current = null
      return
    }
    const img = new Image()
    img.src = hitcircleUrl
    img.onload = () => {
      hitcircleImgRef.current = img
      tintedHitcircleRef.current = tintHitcircleSprite(img, activeRgb)
    }
  }, [hitcircleUrl])

  useEffect(() => {
    if (!overlayUrl) {
      overlayImgRef.current = null
      return
    }
    const img = new Image()
    img.src = overlayUrl
    img.onload = () => {
      overlayImgRef.current = img
    }
  }, [overlayUrl])

  useEffect(() => {
    const nextMap: Record<number, HTMLImageElement | null> = {}
    for (let d = 1; d <= 8; d++) {
      const url = digitImages?.[d] || (d === 1 ? default1Url : null)
      if (url) {
        const img = new Image()
        img.src = url
        img.onload = () => {
          nextMap[d] = img
        }
        nextMap[d] = img
      } else {
        nextMap[d] = null
      }
    }
    digitImgsRef.current = nextMap
  }, [digitImages, default1Url])

  useEffect(() => {
    if (!approachCircleUrl) {
      approachCircleImgRef.current = null
      tintedApproachRef.current = null
      return
    }
    const img = new Image()
    img.src = approachCircleUrl
    img.onload = () => {
      approachCircleImgRef.current = img
      tintedApproachRef.current = tintHitcircleSprite(img, activeRgb)
    }
  }, [approachCircleUrl])

  useEffect(() => {
    if (hitcircleImgRef.current) {
      tintedHitcircleRef.current = tintHitcircleSprite(hitcircleImgRef.current, activeRgb)
    }
    if (approachCircleImgRef.current) {
      tintedApproachRef.current = tintHitcircleSprite(approachCircleImgRef.current, activeRgb)
    }
  }, [activeColorStr])

  useEffect(() => {
    const updateSize = () => {
      const container = containerRef.current
      const canvas = canvasRef.current
      if (!container || !canvas) return
      const rect = container.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.round(rect.width * dpr)
        canvas.height = Math.round(rect.height * dpr)
      }
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    const CYCLE_DURATION = 1100

    const render = (time: number) => {
      const dpr = window.devicePixelRatio || 1
      const rect = containerRef.current?.getBoundingClientRect()
      const width = rect?.width || 240
      const height = rect?.height || 140

      ctx.save()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const now = performance.now()
      const dt = Math.min(50, now - lastTimeRef.current)
      lastTimeRef.current = now

      if (hitScaleRef.current > 1) {
        hitScaleRef.current = Math.max(1, hitScaleRef.current - dt * 0.0018)
      }

      const cx = width / 2
      const cy = height / 2
      const baseCircleRadius = 35
      const noteSize = baseCircleRadius * 2 * hitScaleRef.current

      const [cr, cg, cb] = activeRgb

      const cycleProgress = (time % CYCLE_DURATION) / CYCLE_DURATION
      const approachScale = 2.35 - cycleProgress * 1.35
      const approachAlpha = Math.min(1, Math.max(0.15, cycleProgress * 1.8))

      if (cycleProgress < 0.025 && time > 500) {
        if (ripplesRef.current.length === 0 || now - ripplesRef.current[ripplesRef.current.length - 1].birth > 900) {
          ripplesRef.current.push({ x: cx, y: cy, birth: now, color: [cr, cg, cb] })
          hitScaleRef.current = 1.08
        }
      }

      const RIPPLE_LIFESPAN = 400
      ripplesRef.current = ripplesRef.current.filter((r) => now - r.birth < RIPPLE_LIFESPAN)
      for (const rip of ripplesRef.current) {
        const age = now - rip.birth
        const progress = age / RIPPLE_LIFESPAN
        const ripRadius = baseCircleRadius + progress * 24
        const ripAlpha = (1 - progress) * 0.65
        ctx.save()
        ctx.strokeStyle = `rgba(${rip.color[0]}, ${rip.color[1]}, ${rip.color[2]}, ${ripAlpha})`
        ctx.lineWidth = 2.5 * (1 - progress * 0.5)
        ctx.beginPath()
        ctx.arc(rip.x, rip.y, ripRadius, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }

      const approachRadius = baseCircleRadius * approachScale
      const approachDrawable = tintedApproachRef.current || approachCircleImgRef.current
      if (approachDrawable && (approachDrawable instanceof HTMLCanvasElement || (approachDrawable.complete && approachDrawable.naturalWidth > 1))) {
        ctx.save()
        ctx.globalAlpha = approachAlpha
        const appSize = approachRadius * 2
        const rawW = approachDrawable instanceof HTMLCanvasElement ? approachDrawable.width : approachDrawable.naturalWidth
        const rawH = approachDrawable instanceof HTMLCanvasElement ? approachDrawable.height : approachDrawable.naturalHeight
        const aspect = rawW && rawH ? rawW / rawH : 1
        const appW = aspect >= 1 ? appSize : appSize * aspect
        const appH = aspect >= 1 ? appSize / aspect : appSize
        ctx.drawImage(approachDrawable, cx - appW / 2, cy - appH / 2, appW, appH)
        ctx.restore()
      } else {
        ctx.save()
        ctx.globalAlpha = approachAlpha
        ctx.strokeStyle = `rgb(${cr}, ${cg}, ${cb})`
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.arc(cx, cy, approachRadius, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }

      const hitcircleDrawable = tintedHitcircleRef.current
      if (hitcircleDrawable) {
        ctx.save()
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'
        ctx.shadowBlur = 8
        ctx.shadowOffsetY = 2
        const aspect = hitcircleDrawable.width / hitcircleDrawable.height
        const dw = aspect >= 1 ? noteSize : noteSize * aspect
        const dh = aspect >= 1 ? noteSize / aspect : noteSize
        ctx.drawImage(hitcircleDrawable, cx - dw / 2, cy - dh / 2, dw, dh)
        ctx.restore()
      } else {
        ctx.save()
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
        ctx.shadowBlur = 8
        ctx.shadowOffsetY = 3

        const grad = ctx.createRadialGradient(
          cx - noteSize * 0.12,
          cy - noteSize * 0.12,
          noteSize * 0.05,
          cx,
          cy,
          noteSize / 2
        )
        grad.addColorStop(0, `rgba(${Math.min(255, cr + 45)}, ${Math.min(255, cg + 45)}, ${Math.min(255, cb + 45)}, 0.95)`)
        grad.addColorStop(0.7, `rgba(${cr}, ${cg}, ${cb}, 0.95)`)
        grad.addColorStop(1, `rgba(${Math.round(cr * 0.7)}, ${Math.round(cg * 0.7)}, ${Math.round(cb * 0.7)}, 1)`)

        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(cx, cy, noteSize / 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      const overlayDrawable = overlayImgRef.current
      if (overlayDrawable && overlayDrawable.complete && overlayDrawable.naturalWidth > 1) {
        ctx.save()
        const aspect = overlayDrawable.naturalWidth / overlayDrawable.naturalHeight
        const dw = aspect >= 1 ? noteSize : noteSize * aspect
        const dh = aspect >= 1 ? noteSize / aspect : noteSize
        ctx.drawImage(overlayDrawable, cx - dw / 2, cy - dh / 2, dw, dh)
        ctx.restore()
      } else if (!hitcircleDrawable) {
        ctx.save()
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)'
        ctx.lineWidth = 3.5
        ctx.beginPath()
        ctx.arc(cx, cy, noteSize / 2 - 1.5, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }

      const currentDigitNum = selectedComboIndex + 1
      const digitDrawable = digitImgsRef.current[currentDigitNum]
      if (digitDrawable && digitDrawable.complete && digitDrawable.naturalWidth > 1 && digitDrawable.naturalHeight > 1) {
        ctx.save()
        const digitH = noteSize * 0.46
        const aspect = digitDrawable.naturalWidth / digitDrawable.naturalHeight
        const digitW = digitH * aspect
        ctx.drawImage(digitDrawable, cx - digitW / 2, cy - digitH / 2, digitW, digitH)
        ctx.restore()
      } else if (digitDrawable && (digitDrawable.naturalWidth <= 1 || digitDrawable.naturalHeight <= 1)) {
        // Blank 1x1 sprite (no-number skin); omit number rendering
      } else {
        ctx.save()
        ctx.fillStyle = '#ffffff'
        ctx.font = '700 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'
        ctx.shadowBlur = 4
        ctx.shadowOffsetY = 1
        ctx.fillText(String(currentDigitNum), cx, cy + 1)
        ctx.restore()
      }

      ctx.restore()
      animId = requestAnimationFrame(render)
    }

    animId = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animId)
  }, [activeColorStr, selectedComboIndex])

  const handleClick = () => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const cx = rect.width / 2
    const cy = rect.height / 2
    ripplesRef.current.push({
      x: cx,
      y: cy,
      birth: performance.now(),
      color: activeRgb,
    })
    hitScaleRef.current = 1.15
    if (onSelectCombo && colors.length > 1) {
      onSelectCombo((selectedComboIndex + 1) % colors.length)
    }
  }

  return (
    <div
      ref={containerRef}
      className="combo-preview-container"
      onClick={handleClick}
      title="Кликните по ноте для проверки анимации и перехода к следующему цвету"
    >
      <canvas ref={canvasRef} className="combo-preview-canvas" />
      <span className="combo-preview-hint">Кликните для попадания</span>
      <span className="customizer-preview-overlay-badge">
        Комбо #{selectedComboIndex + 1}: {rgbStringToHex(activeColorStr).toUpperCase()}
      </span>
    </div>
  )
}

// --- Preview Components ---

function ImageTweakPreview({
  imageUrl,
  applied,
}: {
  imageUrl?: string | null
  applied: boolean
}) {
  if (!imageUrl) {
    return (
      <div className="audio-preview-container">
        <span className="audio-preview-label">Стандартный ассет osu!</span>
        {applied && (
          <span className="customizer-preview-overlay-badge -hidden">Скрыт</span>
        )}
      </div>
    )
  }

  return (
    <>
      <img
        src={imageUrl}
        alt="Preview"
        className={`customizer-preview-img ${applied ? '-suppressed' : ''}`}
        draggable={false}
      />
      {applied && (
        <span className="customizer-preview-overlay-badge -hidden">
          Скрыт (1x1 прозрачный)
        </span>
      )}
    </>
  )
}

/**
 * Creates an offscreen canvas with authentic HSL pixel mapping matching the backend:
 * Centers dominant hue on targetHue, preserves gradient variations and white/black borders.
 */
function tintCanvasImage(img: HTMLImageElement, targetHue: number): HTMLCanvasElement | null {
  const w = img.naturalWidth || img.width
  const h = img.naturalHeight || img.height
  if (!w || !h) return null

  const off = document.createElement('canvas')
  off.width = w
  off.height = h
  const octx = off.getContext('2d')
  if (!octx) return null

  octx.drawImage(img, 0, 0)
  const imgData = octx.getImageData(0, 0, w, h)
  const data = imgData.data
  const pixelCount = w * h

  // Pass 1: detect dominant base hue
  let coloredPixels = 0
  let sinSum = 0
  let cosSum = 0

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 20) continue
    const [hue, sat, lit] = rgbToHsl(data[i], data[i + 1], data[i + 2])
    if (sat > 0.08 && lit > 0.08 && lit < 0.94) {
      coloredPixels++
      const rad = (hue * Math.PI) / 180
      sinSum += Math.sin(rad)
      cosSum += Math.cos(rad)
    }
  }

  const isGrayscale = coloredPixels < Math.max(10, pixelCount * 0.01)
  const baseHue =
    coloredPixels > 0
      ? ((Math.atan2(sinSum / coloredPixels, cosSum / coloredPixels) * 180) / Math.PI + 360) % 360
      : 0

  // Pass 2: apply precise HSL shift
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 5) continue
    const [hue, sat, lit] = rgbToHsl(data[i], data[i + 1], data[i + 2])

    if (isGrayscale) {
      if (lit > 0.05 && lit < 0.96) {
        const s = Math.sin(lit * Math.PI) * 0.92
        const [nr, ng, nb] = hslToRgb(targetHue, s, lit)
        data[i] = nr
        data[i + 1] = ng
        data[i + 2] = nb
      }
    } else {
      if (sat > 0.08 && lit > 0.04 && lit < 0.97) {
        let hueDiff = hue - baseHue
        if (hueDiff > 180) hueDiff -= 360
        if (hueDiff < -180) hueDiff += 360

        const newH = (targetHue + hueDiff * 0.7 + 360) % 360
        const [nr, ng, nb] = hslToRgb(newH, Math.max(sat, 0.75), lit)
        data[i] = nr
        data[i + 1] = ng
        data[i + 2] = nb
      }
    }
  }

  octx.putImageData(imgData, 0, 0)
  return off
}

interface TrailParticle {
  x: number
  y: number
  birth: number
}

function CursorInteractivePreview({
  cursorUrl,
  trailUrl,
  trailDisabled,
  continuousTrail,
  hueShift,
  trailHueShift,
}: {
  cursorUrl?: string | null
  trailUrl?: string | null
  trailDisabled: boolean
  continuousTrail?: boolean
  hueShift?: number
  trailHueShift?: number
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const particlesRef = useRef<TrailParticle[]>([])
  const lastPosRef = useRef<{ x: number; y: number } | null>(null)
  const currentPosRef = useRef<{ x: number; y: number }>({ x: 120, y: 75 })
  const isHoveredRef = useRef(false)
  const cursorImgRef = useRef<HTMLImageElement | null>(null)
  const trailImgRef = useRef<HTMLImageElement | null>(null)
  const tintedCursorRef = useRef<HTMLCanvasElement | null>(null)
  const tintedTrailRef = useRef<HTMLCanvasElement | null>(null)

  const effectiveTrailHue = trailHueShift !== undefined ? trailHueShift : hueShift

  const updateTintedCursor = (img: HTMLImageElement | null, hue?: number) => {
    if (!img || hue === undefined) {
      tintedCursorRef.current = null
      return
    }
    tintedCursorRef.current = tintCanvasImage(img, hue)
  }

  const updateTintedTrail = (img: HTMLImageElement | null, hue?: number) => {
    if (!img || hue === undefined) {
      tintedTrailRef.current = null
      return
    }
    tintedTrailRef.current = tintCanvasImage(img, hue)
  }

  // Preload cursor sprite
  useEffect(() => {
    if (!cursorUrl) {
      cursorImgRef.current = null
      tintedCursorRef.current = null
      return
    }
    const img = new Image()
    img.src = cursorUrl
    img.onload = () => {
      cursorImgRef.current = img
      updateTintedCursor(img, hueShift)
    }
  }, [cursorUrl])

  // Preload trail sprite
  useEffect(() => {
    if (!trailUrl) {
      trailImgRef.current = null
      tintedTrailRef.current = null
      return
    }
    const img = new Image()
    img.src = trailUrl
    img.onload = () => {
      trailImgRef.current = img
      updateTintedTrail(img, effectiveTrailHue)
    }
  }, [trailUrl])

  useEffect(() => {
    if (cursorImgRef.current) {
      updateTintedCursor(cursorImgRef.current, hueShift)
    }
  }, [hueShift])

  useEffect(() => {
    if (trailImgRef.current) {
      updateTintedTrail(trailImgRef.current, effectiveTrailHue)
    }
  }, [effectiveTrailHue])

  // Responsive canvas size
  useEffect(() => {
    const updateSize = () => {
      const container = containerRef.current
      const canvas = canvasRef.current
      if (!container || !canvas) return
      const rect = container.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        const dpr = window.devicePixelRatio || 1
        canvas.width = Math.round(rect.width * dpr)
        canvas.height = Math.round(rect.height * dpr)
      }
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // Animation & Rendering Loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    const LIFESPAN = continuousTrail ? 520 : 360 // ms — longer lingering for continuous trail

    const render = (time: number) => {
      const dpr = window.devicePixelRatio || 1
      const rect = containerRef.current?.getBoundingClientRect()
      const width = rect?.width || 240
      const height = rect?.height || 150

      ctx.save()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)

      const now = performance.now()

      // When not hovering, run smooth figure-8 demo motion
      if (!isHoveredRef.current) {
        const t = time * 0.0022
        const cx = width / 2
        const cy = height / 2
        const rx = Math.min(width * 0.38, 85)
        const ry = Math.min(height * 0.28, 40)
        const x = cx + Math.sin(t) * rx
        const y = cy + Math.sin(t * 2) * 0.5 * ry

        const last = lastPosRef.current
        if (!trailDisabled && last) {
          const dx = x - last.x
          const dy = y - last.y
          const dist = Math.hypot(dx, dy)
          const stepDist = continuousTrail ? 1.8 : 4
          const steps = Math.max(1, Math.min(Math.floor(dist / stepDist), continuousTrail ? 36 : 16))
          for (let i = 1; i <= steps; i++) {
            particlesRef.current.push({
              x: last.x + dx * (i / steps),
              y: last.y + dy * (i / steps),
              birth: now,
            })
          }
        } else if (!trailDisabled) {
          particlesRef.current.push({ x, y, birth: now })
        }
        lastPosRef.current = { x, y }
        currentPosRef.current = { x, y }
      }

      // Filter expired particles
      particlesRef.current = particlesRef.current.filter((p) => now - p.birth < LIFESPAN)

      // Render Trail Particles (if enabled)
      if (!trailDisabled && particlesRef.current.length > 0) {
        const trailDrawable = (effectiveTrailHue !== undefined && tintedTrailRef.current)
          ? tintedTrailRef.current
          : trailImgRef.current

        for (let i = 0; i < particlesRef.current.length; i++) {
          const p = particlesRef.current[i]
          const age = now - p.birth
          const progress = age / LIFESPAN // 0 = newly born, 1 = dying
          // Smooth decay curve matching osu!
          const alpha = continuousTrail
            ? Math.max(0, Math.pow(1 - progress, 1.1) * 0.92)
            : Math.max(0, Math.pow(1 - progress, 1.25) * 0.85)
          const size = continuousTrail
            ? Math.max(16, 28 * (1 - progress * 0.25))
            : Math.max(14, 28 * (1 - progress * 0.3))

          ctx.save()
          ctx.globalAlpha = alpha

          if (trailDrawable && (trailDrawable instanceof HTMLCanvasElement || (trailDrawable.complete && trailDrawable.naturalWidth > 0))) {
            ctx.drawImage(trailDrawable, p.x - size / 2, p.y - size / 2, size, size)
          } else {
            // Authentic glowing round particle fallback
            const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size / 2)
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
            grad.addColorStop(0.35, 'rgba(255, 180, 220, 0.65)')
            grad.addColorStop(1, 'rgba(255, 102, 170, 0)')
            ctx.fillStyle = grad
            ctx.beginPath()
            ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2)
            ctx.fill()
          }
          ctx.restore()
        }
      }

      // Draw Main Cursor Sprite on top
      const cursorDrawable = (hueShift !== undefined && tintedCursorRef.current)
        ? tintedCursorRef.current
        : cursorImgRef.current
      const cursorPos = currentPosRef.current
      const cursorSize = 32

      ctx.save()
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'
      ctx.shadowBlur = 5
      ctx.shadowOffsetY = 2

      if (cursorDrawable && (cursorDrawable instanceof HTMLCanvasElement || (cursorDrawable.complete && cursorDrawable.naturalWidth > 0))) {
        ctx.drawImage(
          cursorDrawable,
          cursorPos.x - cursorSize / 2,
          cursorPos.y - cursorSize / 2,
          cursorSize,
          cursorSize
        )
      } else {
        // Fallback default osu cursor (pink with white border)
        ctx.fillStyle = '#ff66aa'
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.arc(cursorPos.x, cursorPos.y, 11, 0, Math.PI * 2)
        ctx.fill()
        ctx.stroke()
      }
      ctx.restore()

      ctx.restore()
      animId = requestAnimationFrame(render)
    }

    animId = requestAnimationFrame(render)
    return () => cancelAnimationFrame(animId)
  }, [trailDisabled, hueShift, effectiveTrailHue, continuousTrail])

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    isHoveredRef.current = true
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = Math.max(8, Math.min(rect.width - 8, e.clientX - rect.left))
    const y = Math.max(8, Math.min(rect.height - 8, e.clientY - rect.top))
    lastPosRef.current = { x, y }
    currentPosRef.current = { x, y }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    isHoveredRef.current = true
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = Math.max(8, Math.min(rect.width - 8, e.clientX - rect.left))
    const y = Math.max(8, Math.min(rect.height - 8, e.clientY - rect.top))

    const now = performance.now()
    const last = lastPosRef.current

    if (!trailDisabled && last) {
      const dx = x - last.x
      const dy = y - last.y
      const dist = Math.hypot(dx, dy)
      // Interpolate for a continuous smooth ribbon
      const stepDist = continuousTrail ? 1.8 : 4.5
      const steps = Math.max(1, Math.min(Math.floor(dist / stepDist), continuousTrail ? 48 : 28))

      for (let i = 1; i <= steps; i++) {
        const t = i / steps
        particlesRef.current.push({
          x: last.x + dx * t,
          y: last.y + dy * t,
          birth: now,
        })
      }
    } else if (!trailDisabled) {
      particlesRef.current.push({ x, y, birth: now })
    }

    // Limit buffer length
    const maxParticles = continuousTrail ? 260 : 140
    if (particlesRef.current.length > maxParticles) {
      particlesRef.current = particlesRef.current.slice(-maxParticles)
    }

    lastPosRef.current = { x, y }
    currentPosRef.current = { x, y }
  }

  const handleMouseLeave = () => {
    isHoveredRef.current = false
    lastPosRef.current = null
  }

  const { t } = useI18n()

  return (
    <div
      ref={containerRef}
      className="cursor-preview-container"
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <canvas ref={canvasRef} className="cursor-preview-canvas" />
      <span className="cursor-preview-hint">{t('skinCustomizer.hoverCursorHint')}</span>
      <span className="customizer-preview-overlay-badge">
        {trailDisabled ? t('skinCustomizer.trailDisabled') : t('skinCustomizer.trailEnabled')}
      </span>
    </div>
  )
}

function IniCursorPreview({
  cursorUrl,
  isExpandTweak,
  isRotateTweak,
  applied,
}: {
  cursorUrl?: string | null
  isExpandTweak: boolean
  isRotateTweak: boolean
  applied: boolean
}) {
  const { t } = useI18n()
  const [clicked, setClicked] = useState(false)
  const [rotation, setRotation] = useState(0)

  useEffect(() => {
    if (!isRotateTweak || applied) {
      setRotation(0)
      return
    }
    const interval = setInterval(() => {
      setRotation((prev) => (prev + 3) % 360)
    }, 30)
    return () => clearInterval(interval)
  }, [isRotateTweak, applied])

  const handleClick = () => {
    if (isExpandTweak && !applied) {
      setClicked(true)
      setTimeout(() => setClicked(false), 160)
    }
  }

  const scale = clicked ? 1.35 : 1.0

  return (
    <div
      className="cursor-preview-container"
      onClick={handleClick}
      title={isExpandTweak ? t('skinCustomizer.clickTestHint') : ''}
    >
      <span className="cursor-preview-hint">
        {isExpandTweak ? t('skinCustomizer.clickTestHint') : isRotateTweak ? t('skinCustomizer.autoRotateHint') : ''}
      </span>

      <div
        className="cursor-preview-cursor"
        style={{
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotation}deg)`,
          transition: 'transform 0.1s cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      >
        {cursorUrl ? (
          <img src={cursorUrl} alt="Cursor" className="cursor-preview-cursor-img" />
        ) : (
          <div className="cursor-preview-cursor-fallback" />
        )}
      </div>

      <span className="customizer-preview-overlay-badge">
        {isExpandTweak
          ? applied
            ? t('skinCustomizer.staticSizeBadge')
            : t('skinCustomizer.pulseOnClickBadge')
          : isRotateTweak
          ? applied
            ? t('skinCustomizer.rotationOffBadge')
            : t('skinCustomizer.rotatingBadge')
          : ''}
      </span>
    </div>
  )
}

function AudioTweakPreview({
  audioUrl,
  applied,
}: {
  audioUrl?: string | null
  applied: boolean
}) {
  const { t } = useI18n()
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const togglePlay = () => {
    if (!audioUrl) return
    if (!audioRef.current) {
      audioRef.current = new Audio(audioUrl)
      audioRef.current.onended = () => setPlaying(false)
    }
    if (playing) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setPlaying(false)
    } else {
      audioRef.current.play().catch(() => setPlaying(false))
      setPlaying(true)
    }
  }

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [audioUrl])

  return (
    <div className="audio-preview-container">
      {audioUrl ? (
        <button
          className="audio-play-btn"
          onClick={togglePlay}
          title={playing ? t('skinCustomizer.stopAudio') : t('skinCustomizer.playOriginal')}
        >
          {playing ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: 2 }} />}
        </button>
      ) : (
        <Volume2 size={24} style={{ opacity: 0.4 }} />
      )}
      <span className="audio-preview-label">
        {audioUrl ? (playing ? t('skinCustomizer.playing') : t('skinCustomizer.playOriginal')) : t('skinCustomizer.audioSkinLabel')}
      </span>
      {applied && (
        <span className="customizer-preview-overlay-badge -hidden">
          {t('skinCustomizer.mutedBadge')}
        </span>
      )}
    </div>
  )
}
