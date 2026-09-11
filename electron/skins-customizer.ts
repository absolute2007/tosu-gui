import fs from 'fs'
import path from 'path'
import { PNG } from 'pngjs'

export type SkinTweakCategory = 'cursor' | 'gameplay' | 'interface' | 'audio'
export type SkinPreviewType = 'cursor' | 'image' | 'audio' | 'ini' | 'combo'

export interface SkinTweakInfo {
  id: string
  title: string
  subtitle: string
  description: string
  category: SkinTweakCategory
  previewType: SkinPreviewType
  applied: boolean
  canReset: boolean
  previewImage: string | null
  previewCursorImage?: string | null
  previewAudio?: string | null
  affectedFiles: string[]
  meta?: Record<string, any>
}

export interface SkinCustomizationData {
  skinName: string
  skinPath: string
  modifiedCount: number
  hasBackup: boolean
  tweaks: SkinTweakInfo[]
}

interface BackupFileRecord {
  relPath: string
  existedBefore: boolean
  backupRelPath?: string | null
}

interface BackupIniRecord {
  section: string
  key: string
  originalValue: string | null
  appliedValue: string
}

interface BackupTweakRecord {
  tweakId: string
  appliedAt: number
  files: BackupFileRecord[]
  iniChanges?: BackupIniRecord[]
  meta?: Record<string, any>
}

interface BackupManifest {
  version: 1
  skinName: string
  createdAt: number
  updatedAt: number
  tweaks: Record<string, BackupTweakRecord>
}

// 1x1 32-bit RGBA Transparent PNG
const TRANSPARENT_1X1_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
)

// 44-byte silent PCM WAV
function createSilentWavBuffer(): Buffer {
  const buf = Buffer.alloc(44)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // AudioFormat: 1 (PCM)
  buf.writeUInt16LE(1, 22) // NumChannels: 1 (Mono)
  buf.writeUInt32LE(44100, 24) // SampleRate
  buf.writeUInt32LE(88200, 28) // ByteRate
  buf.writeUInt16LE(2, 32) // BlockAlign
  buf.writeUInt16LE(16, 34) // BitsPerSample
  buf.write('data', 36)
  buf.writeUInt32LE(0, 40) // Subchunk2Size: 0
  return buf
}
const SILENT_WAV = createSilentWavBuffer()

export interface TweakConfig {
  id: string
  category: SkinTweakCategory
  title: string
  subtitle: string
  description: string
  previewType: SkinPreviewType
  filePatterns?: RegExp[]
  defaultInjectFiles?: string[]
  isAudio?: boolean
  ini?: { section: string; key: string; tweakValue: string; revertValue?: string }
  previewCandidates: string[]
}

export const TWEAK_CONFIGS: TweakConfig[] = [
  {
    id: 'cursor-color',
    category: 'cursor',
    title: 'Цвет курсора и шлейфа',
    subtitle: 'cursor*.png, cursortrail*.png',
    description: 'Изменение оттенка курсора и шлейфа с сохранением внутренних градиентов, бликов и белых контуров.',
    previewType: 'cursor',
    previewCandidates: ['cursor.png', 'cursor@2x.png'],
  },
  {
    id: 'cursor-trail',
    category: 'cursor',
    title: 'След курсора (Cursor Trail)',
    subtitle: 'cursortrail.png, skin.ini: CursorTrail',
    description: 'Полное отключение шлейфа за курсором (замена спрайта на 1x1 прозрачный + CursorTrail: 0). Опцию нельзя отключить в osu! stable.',
    previewType: 'cursor',
    filePatterns: [/^cursortrail.*\.png$/i],
    defaultInjectFiles: ['cursortrail.png', 'cursortrail@2x.png'],
    ini: { section: 'General', key: 'CursorTrail', tweakValue: '0', revertValue: '1' },
    previewCandidates: ['cursortrail.png', 'cursortrail@2x.png'],
  },
  {
    id: 'continuous-cursor-trail',
    category: 'cursor',
    title: 'Непрерывный след курсора (Continuous Trail)',
    subtitle: 'cursormiddle.png (1x1)',
    description: 'Включает плавный длинный шлейф за курсором без пробелов между точками (механика osu!stable через cursormiddle.png).',
    previewType: 'cursor',
    filePatterns: [/^cursormiddle.*\.png$/i],
    defaultInjectFiles: ['cursormiddle.png', 'cursormiddle@2x.png'],
    previewCandidates: ['cursortrail.png', 'cursortrail@2x.png', 'cursor.png'],
  },
  {
    id: 'cursor-smoke',
    category: 'cursor',
    title: 'Дым курсора (Cursor Smoke)',
    subtitle: 'cursor-smoke.png',
    description: 'Отключает дымовой след при случайном или намеренном зажатии клавиши «C» во время игры.',
    previewType: 'image',
    filePatterns: [/^cursor-smoke.*\.png$/i],
    defaultInjectFiles: ['cursor-smoke.png', 'cursor-smoke@2x.png'],
    previewCandidates: ['cursor-smoke.png', 'cursor-smoke@2x.png'],
  },
  {
    id: 'cursor-expand',
    category: 'cursor',
    title: 'Пульсация курсора (Cursor Expand)',
    subtitle: 'skin.ini: CursorExpand',
    description: 'Запрещает курсору увеличиваться и пульсировать при нажатии клавиш (фиксированный размер).',
    previewType: 'ini',
    ini: { section: 'General', key: 'CursorExpand', tweakValue: '0', revertValue: '1' },
    previewCandidates: ['cursor.png', 'cursor@2x.png'],
  },
  {
    id: 'cursor-rotate',
    category: 'cursor',
    title: 'Вращение курсора (Cursor Rotate)',
    subtitle: 'skin.ini: CursorRotate',
    description: 'Отключает автоматическое вращение курсора вокруг своей оси (критично для стрелок и асимметричных курсоров).',
    previewType: 'ini',
    ini: { section: 'General', key: 'CursorRotate', tweakValue: '0', revertValue: '1' },
    previewCandidates: ['cursor.png', 'cursor@2x.png'],
  },
  {
    id: 'combo-colors',
    category: 'gameplay',
    title: 'Цвета комбо-нот',
    subtitle: 'skin.ini: [Colours]',
    description: 'Индивидуальная настройка цветов для каждой группы комбо-нот (Combo1...Combo8) в скине с интерактивным предпросмотром.',
    previewType: 'combo',
    previewCandidates: [
      'hitcircle.png',
      'hitcircle@2x.png',
      'hitcircleoverlay.png',
      'hitcircleoverlay@2x.png',
      'approachcircle.png',
    ],
  },
  {
    id: 'hit-300',
    category: 'gameplay',
    title: 'Скрытие оценки 300 (Hit 300)',
    subtitle: 'hit300*.png, hit300g, hit300k',
    description: 'Замена идеальных «300» на прозрачные спрайты. Очищает поле на стримах, оставляя только 100, 50 и миссы.',
    previewType: 'image',
    filePatterns: [/^hit300.*\.png$/i],
    defaultInjectFiles: [
      'hit300.png',
      'hit300@2x.png',
      'hit300g.png',
      'hit300g@2x.png',
      'hit300k.png',
      'hit300k@2x.png',
    ],
    previewCandidates: ['hit300.png', 'hit300@2x.png', 'hit300-0.png'],
  },
  {
    id: 'slider-end',
    category: 'gameplay',
    title: 'Конец слайдера (Slider End Circle)',
    subtitle: 'sliderendcircle*.png',
    description: 'Убирает кружок на конце тела слайдера, облегчая чтение паттернов за слайдером.',
    previewType: 'image',
    filePatterns: [/^sliderendcircle.*\.png$/i],
    defaultInjectFiles: [
      'sliderendcircle.png',
      'sliderendcircle@2x.png',
      'sliderendcircleoverlay.png',
      'sliderendcircleoverlay@2x.png',
    ],
    previewCandidates: ['sliderendcircle.png', 'sliderendcircleoverlay.png'],
  },
  {
    id: 'follow-points',
    category: 'gameplay',
    title: 'Линии следования (Follow Points)',
    subtitle: 'followpoint*.png',
    description: 'Убирает направляющие пунктирные линии между последовательными нотами для чистого визуала.',
    previewType: 'image',
    filePatterns: [/^followpoint.*\.png$/i],
    defaultInjectFiles: ['followpoint.png', 'followpoint@2x.png'],
    previewCandidates: ['followpoint.png', 'followpoint-0.png'],
  },
  {
    id: 'hit-lighting',
    category: 'gameplay',
    title: 'Вспышки попаданий (Hit Lighting)',
    subtitle: 'lighting*.png',
    description: 'Отключает яркую вспышку света за кругом при нажатии, снижая зрительную нагрузку.',
    previewType: 'image',
    filePatterns: [/^lighting.*\.png$/i],
    defaultInjectFiles: ['lighting.png', 'lighting@2x.png'],
    previewCandidates: ['lighting.png', 'lighting-0.png'],
  },
  {
    id: 'combo-numbers',
    category: 'gameplay',
    title: 'Цифры внутри кругов (Combo Numbers)',
    subtitle: 'default-0..9.png',
    description: 'Убирает цифры комбо из центров нот для создания чистого минималистичного стиля.',
    previewType: 'image',
    filePatterns: [/^default-[0-9].*\.png$/i],
    defaultInjectFiles: [
      'default-0.png',
      'default-1.png',
      'default-2.png',
      'default-3.png',
      'default-4.png',
      'default-5.png',
      'default-6.png',
      'default-7.png',
      'default-8.png',
      'default-9.png',
    ],
    previewCandidates: ['default-1.png', 'default-2.png', 'default-0.png'],
  },
  {
    id: 'combo-bursts',
    category: 'interface',
    title: 'Комбо-персонажи (Combo Bursts)',
    subtitle: 'comboburst*.png, skin.ini: ComboBurst',
    description: 'Полностью убирает выскакивающие картинки персонажей по бокам экрана при наборе комбо.',
    previewType: 'image',
    filePatterns: [/^comboburst.*\.png$/i],
    defaultInjectFiles: ['comboburst.png'],
    ini: { section: 'General', key: 'ComboBurst', tweakValue: '0', revertValue: '1' },
    previewCandidates: ['comboburst.png', 'comboburst-0.png'],
  },
  {
    id: 'section-pass-fail',
    category: 'interface',
    title: 'Баннеры секций (Section Pass/Fail)',
    subtitle: 'section-pass*, section-fail*',
    description: 'Убирает крупные баннеры PASS и FAIL во время пауз и брейков на карте.',
    previewType: 'image',
    filePatterns: [/^section-(pass|fail).*\.png$/i],
    defaultInjectFiles: [
      'section-pass.png',
      'section-pass@2x.png',
      'section-fail.png',
      'section-fail@2x.png',
    ],
    previewCandidates: ['section-pass.png', 'section-fail.png'],
  },
  {
    id: 'warning-arrows',
    category: 'interface',
    title: 'Стрелки предупреждения (Warning Arrows)',
    subtitle: 'play-warningarrow*.png',
    description: 'Скрывает мигающие красные стрелки перед началом нот после перерыва.',
    previewType: 'image',
    filePatterns: [/^play-warningarrow.*\.png$/i],
    defaultInjectFiles: ['play-warningarrow.png', 'play-warningarrow@2x.png'],
    previewCandidates: ['play-warningarrow.png', 'play-warningarrow@2x.png'],
  },
  {
    id: 'spinner-spin-audio',
    category: 'audio',
    title: 'Звук спиннера (Spinner Spin)',
    subtitle: 'spinnerspin.wav, spinnerbonus.wav',
    description: 'Заглушает громкий нарастающий гул и бонусные звуки спиннера тихими сэмплами.',
    previewType: 'audio',
    isAudio: true,
    filePatterns: [/^spinner(spin|bonus)\.(wav|mp3|ogg)$/i],
    defaultInjectFiles: ['spinnerspin.wav', 'spinnerbonus.wav'],
    previewCandidates: ['spinnerspin.wav', 'spinnerbonus.wav'],
  },
  {
    id: 'combobreak-audio',
    category: 'audio',
    title: 'Звук срыва комбо (Combo Break)',
    subtitle: 'combobreak.wav',
    description: 'Отключает резкий демотивирующий звук при потере комбо (миссе).',
    previewType: 'audio',
    isAudio: true,
    filePatterns: [/^combobreak\.(wav|mp3|ogg)$/i],
    defaultInjectFiles: ['combobreak.wav'],
    previewCandidates: ['combobreak.wav', 'combobreak.mp3', 'combobreak.ogg'],
  },
  {
    id: 'applause-audio',
    category: 'audio',
    title: 'Аплодисменты (Applause)',
    subtitle: 'applause.wav, applause.mp3',
    description: 'Отключает звук аплодисментов на экране результатов после карты.',
    previewType: 'audio',
    isAudio: true,
    filePatterns: [/^applause\.(wav|mp3|ogg)$/i],
    defaultInjectFiles: ['applause.wav'],
    previewCandidates: ['applause.wav', 'applause.mp3', 'applause.ogg'],
  },
]

// --- Color & INI helpers ---

export const DEFAULT_OSU_COMBO_COLORS: string[] = [
  '255, 192, 0',  // Combo1 (Yellow-Orange)
  '0, 202, 0',    // Combo2 (Green)
  '18, 124, 255', // Combo3 (Blue)
  '242, 24, 57',  // Combo4 (Red)
]

export function rgbStringToRgb(str: string): [number, number, number] {
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

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const clamped = Math.max(0, Math.min(255, Math.round(n)))
    return clamped.toString(16).padStart(2, '0')
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function rgbStringToHex(str: string): string {
  const [r, g, b] = rgbStringToRgb(str)
  return rgbToHex(r, g, b)
}

export function hexToRgb(hex: string): [number, number, number] {
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

export function hexToRgbString(hex: string): string {
  const [r, g, b] = hexToRgb(hex)
  return `${r}, ${g}, ${b}`
}

function normalizeSection(sec: string): string {
  const s = sec.trim().toLowerCase()
  return s === 'colors' ? 'colours' : s
}

function cleanIniValue(raw: string): string {
  let val = raw
  const commentIdx = val.search(/\/\/|;|#/)
  if (commentIdx !== -1) {
    val = val.substring(0, commentIdx)
  }
  return val.trim()
}

export function getIniValue(content: string, section: string, key: string): string | null {
  const lines = content.split(/\r?\n/)
  let currentSection = ''
  const targetSection = section.toLowerCase()
  const targetKey = key.toLowerCase()

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentSection = trimmed.slice(1, -1).trim().toLowerCase()
      continue
    }
    if (normalizeSection(currentSection) === normalizeSection(targetSection)) {
      if (trimmed.startsWith('//') || trimmed.startsWith(';') || trimmed.startsWith('#')) {
        continue
      }
      const idx = trimmed.indexOf(':')
      if (idx !== -1) {
        const k = trimmed.slice(0, idx).trim().toLowerCase()
        if (k === targetKey) {
          return cleanIniValue(trimmed.slice(idx + 1))
        }
      }
    }
  }
  return null
}

export function setIniValue(content: string, section: string, key: string, value: string): string {
  const lines = content.split(/\r?\n/)
  let currentSection = ''
  const targetSection = section.toLowerCase()
  const targetKey = key.toLowerCase()
  let sectionStartLine = -1
  let nextSectionLine = -1
  let keyLine = -1

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const sec = trimmed.slice(1, -1).trim().toLowerCase()
      if (normalizeSection(sec) === normalizeSection(targetSection)) {
        currentSection = sec
        sectionStartLine = i
      } else if (sectionStartLine !== -1 && nextSectionLine === -1) {
        nextSectionLine = i
        currentSection = sec
      } else {
        currentSection = sec
      }
      continue
    }

    if (normalizeSection(currentSection) === normalizeSection(targetSection)) {
      if (trimmed.startsWith('//') || trimmed.startsWith(';') || trimmed.startsWith('#')) {
        continue
      }
      const idx = trimmed.indexOf(':')
      if (idx !== -1) {
        const k = trimmed.slice(0, idx).trim().toLowerCase()
        if (k === targetKey) {
          keyLine = i
          break
        }
      }
    }
  }

  if (keyLine !== -1) {
    lines[keyLine] = `${key}: ${value}`
    return lines.join('\r\n')
  }

  if (sectionStartLine !== -1) {
    // Insert at end of section (before next section, skipping trailing empty lines)
    if (nextSectionLine !== -1) {
      let insertIdx = nextSectionLine
      while (insertIdx > sectionStartLine + 1 && lines[insertIdx - 1].trim() === '') {
        insertIdx--
      }
      lines.splice(insertIdx, 0, `${key}: ${value}`)
    } else {
      let insertIdx = lines.length
      while (insertIdx > sectionStartLine + 1 && lines[insertIdx - 1].trim() === '') {
        insertIdx--
      }
      lines.splice(insertIdx, 0, `${key}: ${value}`)
    }
    return lines.join('\r\n')
  }

  if (lines.length > 0 && lines[lines.length - 1].trim() !== '') {
    lines.push('')
  }
  lines.push(`[${section}]`)
  lines.push(`${key}: ${value}`)
  return lines.join('\r\n')
}

export function removeIniValue(content: string, section: string, key: string): string {
  const lines = content.split(/\r?\n/)
  let currentSection = ''
  const targetSection = section.toLowerCase()
  const targetKey = key.toLowerCase()
  let keyLine = -1

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      currentSection = trimmed.slice(1, -1).trim().toLowerCase()
      continue
    }
    if (normalizeSection(currentSection) === normalizeSection(targetSection)) {
      if (trimmed.startsWith('//') || trimmed.startsWith(';') || trimmed.startsWith('#')) {
        continue
      }
      const idx = trimmed.indexOf(':')
      if (idx !== -1) {
        const k = trimmed.slice(0, idx).trim().toLowerCase()
        if (k === targetKey) {
          keyLine = i
          break
        }
      }
    }
  }

  if (keyLine !== -1) {
    lines.splice(keyLine, 1)
    return lines.join('\r\n')
  }
  return content
}

export function extractComboColorsFromIni(iniContent: string): { colors: string[]; isDefault: boolean } {
  const colors: string[] = []
  for (let i = 1; i <= 8; i++) {
    const val = getIniValue(iniContent, 'Colours', `Combo${i}`)
    if (val) {
      const parts = val.split(',').map((p) => parseInt(p.trim(), 10))
      if (parts.length >= 3 && parts.slice(0, 3).every((n) => !isNaN(n) && n >= 0 && n <= 255)) {
        colors.push(`${parts[0]}, ${parts[1]}, ${parts[2]}`)
      }
    }
  }

  if (colors.length > 0) {
    return { colors, isDefault: false }
  }

  return {
    colors: [...DEFAULT_OSU_COMBO_COLORS],
    isDefault: true,
  }
}

// --- Backup & Manifest helpers ---

function getBackupDir(skinPath: string): string {
  return path.join(skinPath, '.tosu-backup')
}

function getBackupFilesDir(skinPath: string): string {
  return path.join(skinPath, '.tosu-backup', 'files')
}

function getManifestPath(skinPath: string): string {
  return path.join(skinPath, '.tosu-backup', 'manifest.json')
}

function readManifest(skinPath: string): BackupManifest | null {
  const manifestPath = getManifestPath(skinPath)
  if (!fs.existsSync(manifestPath)) return null
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8')
    return JSON.parse(raw) as BackupManifest
  } catch {
    return null
  }
}

function writeManifest(skinPath: string, manifest: BackupManifest): void {
  const backupDir = getBackupDir(skinPath)
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true })
  }
  fs.writeFileSync(getManifestPath(skinPath), JSON.stringify(manifest, null, 2), 'utf8')
}

function readSkinIni(skinPath: string): string {
  const iniPath = path.join(skinPath, 'skin.ini')
  if (fs.existsSync(iniPath)) {
    try {
      return fs.readFileSync(iniPath, 'utf8')
    } catch {
      return ''
    }
  }
  return ''
}

function writeSkinIni(skinPath: string, content: string): void {
  const iniPath = path.join(skinPath, 'skin.ini')
  fs.writeFileSync(iniPath, content, 'utf8')
}

function getFileAsBase64Url(filePath: string, isAudio = false): string | null {
  if (!fs.existsSync(filePath)) return null
  try {
    const stat = fs.statSync(filePath)
    // Audio preview limit: 2.5 MB, Image preview limit: 4 MB
    if (isAudio && stat.size > 2.5 * 1024 * 1024) return null
    if (!isAudio && stat.size > 4 * 1024 * 1024) return null

    const buf = fs.readFileSync(filePath)
    const ext = path.extname(filePath).toLowerCase()

    if (isAudio) {
      let mime = 'audio/wav'
      if (ext === '.mp3') mime = 'audio/mpeg'
      else if (ext === '.ogg') mime = 'audio/ogg'
      return `data:${mime};base64,${buf.toString('base64')}`
    } else {
      let mime = 'image/png'
      if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg'
      return `data:${mime};base64,${buf.toString('base64')}`
    }
  } catch {
    return null
  }
}

function findSpriteBase64(skinPath: string, candidates: string[]): string | null {
  for (const name of candidates) {
    const p = path.join(skinPath, name)
    if (fs.existsSync(p)) {
      const url = getFileAsBase64Url(p, false)
      if (url) return url
    }
  }
  return null
}

function findMatchingFilesInDir(dirPath: string, patterns: RegExp[]): string[] {
  if (!fs.existsSync(dirPath)) return []
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    const matched: string[] = []
    for (const ent of entries) {
      if (!ent.isFile()) continue
      for (const pat of patterns) {
        if (pat.test(ent.name)) {
          matched.push(ent.name)
          break
        }
      }
    }
    return matched
  } catch {
    return []
  }
}

// --- Main Customizer API ---

export async function getSkinCustomizationData(skinPath: string): Promise<SkinCustomizationData> {
  const skinName = path.basename(skinPath)
  if (!fs.existsSync(skinPath) || !fs.statSync(skinPath).isDirectory()) {
    throw new Error(`Папка скина не найдена: ${skinPath}`)
  }

  const manifest = readManifest(skinPath)
  const iniContent = readSkinIni(skinPath)
  const backupFilesDir = getBackupFilesDir(skinPath)

  // Cursor and trail previews for cursor tweaks
  let previewCursorImage: string | null = null
  let previewTrailImage: string | null = null

  const cursorCandidates = ['cursor.png', 'cursor@2x.png']
  for (const c of cursorCandidates) {
    const inBackup = path.join(backupFilesDir, c)
    if (fs.existsSync(inBackup)) {
      previewCursorImage = getFileAsBase64Url(inBackup, false)
      if (previewCursorImage) break
    }
    const inSkin = path.join(skinPath, c)
    if (fs.existsSync(inSkin)) {
      previewCursorImage = getFileAsBase64Url(inSkin, false)
      if (previewCursorImage) break
    }
  }

  const trailCandidates = ['cursortrail.png', 'cursortrail@2x.png']
  for (const c of trailCandidates) {
    const inBackup = path.join(backupFilesDir, c)
    if (fs.existsSync(inBackup)) {
      const s = fs.statSync(inBackup).size
      if (s > 150) {
        previewTrailImage = getFileAsBase64Url(inBackup, false)
        if (previewTrailImage) break
      }
    }
    const inSkin = path.join(skinPath, c)
    if (fs.existsSync(inSkin)) {
      const s = fs.statSync(inSkin).size
      if (s > 150) {
        previewTrailImage = getFileAsBase64Url(inSkin, false)
        if (previewTrailImage) break
      }
    }
  }

  let modifiedCount = 0
  const tweaks: SkinTweakInfo[] = []

  for (const cfg of TWEAK_CONFIGS) {
    const isManifestApplied = Boolean(manifest?.tweaks?.[cfg.id])
    let isNativeApplied = false

    // Check if tweak matches in skin.ini
    if (cfg.ini) {
      const val = getIniValue(iniContent, cfg.ini.section, cfg.ini.key)
      if (val === cfg.ini.tweakValue) {
        isNativeApplied = true
      }
    }

    // Check if files in skin match blank 1x1 or silent wav
    const matchedSkinFiles = cfg.filePatterns
      ? findMatchingFilesInDir(skinPath, cfg.filePatterns)
      : []

    if (matchedSkinFiles.length > 0 && !cfg.ini) {
      // Check if all matched files are transparent 1x1 (<= 150 bytes) or silent audio (<= 150 bytes)
      const allBlank = matchedSkinFiles.every((f) => {
        try {
          const s = fs.statSync(path.join(skinPath, f)).size
          return s <= 150
        } catch {
          return false
        }
      })
      if (allBlank) {
        isNativeApplied = true
      }
    }

    const applied = isManifestApplied || isNativeApplied
    const canReset = isManifestApplied

    if (applied) {
      modifiedCount++
    }

    // Determine preview asset: priority to backed-up original, then existing file
    let previewImage: string | null = null
    let previewAudio: string | null = null

    for (const candidate of cfg.previewCandidates) {
      const bPath = path.join(backupFilesDir, candidate)
      if (fs.existsSync(bPath)) {
        if (cfg.isAudio) {
          previewAudio = getFileAsBase64Url(bPath, true)
        } else {
          previewImage = getFileAsBase64Url(bPath, false)
        }
        if (previewImage || previewAudio) break
      }

      const sPath = path.join(skinPath, candidate)
      if (fs.existsSync(sPath)) {
        // If file is 1x1 blank and applied, don't show the blank 1x1 if we can avoid it
        const size = fs.statSync(sPath).size
        if (size > 150 || !applied) {
          if (cfg.isAudio) {
            previewAudio = getFileAsBase64Url(sPath, true)
          } else {
            previewImage = getFileAsBase64Url(sPath, false)
          }
          if (previewImage || previewAudio) break
        }
      }
    }

    const tweakRecord = manifest?.tweaks?.[cfg.id]

    let meta: Record<string, any> | undefined = tweakRecord?.meta
    let subtitle = cfg.subtitle
    let affectedFiles = matchedSkinFiles.length > 0 ? matchedSkinFiles : cfg.defaultInjectFiles || []

    if (cfg.id === 'combo-colors') {
      const extracted = extractComboColorsFromIni(iniContent)
      const activeColors = (tweakRecord?.meta?.colors as string[] | undefined) || extracted.colors
      const originalColors = (tweakRecord?.meta?.originalColors as string[] | undefined) || extracted.colors

      const hitcircleImage = findSpriteBase64(skinPath, ['hitcircle.png', 'hitcircle@2x.png'])
      const hitcircleOverlayImage = findSpriteBase64(skinPath, ['hitcircleoverlay.png', 'hitcircleoverlay@2x.png'])
      const approachCircleImage = findSpriteBase64(skinPath, ['approachcircle.png', 'approachcircle@2x.png'])

      const digitImages: Record<number, string | null> = {}
      for (let d = 1; d <= 8; d++) {
        digitImages[d] = findSpriteBase64(skinPath, [
          `default-${d}.png`,
          `default-${d}@2x.png`,
          `default_${d}.png`,
          `default_${d}@2x.png`,
        ])
      }
      const default1Image = digitImages[1] || null

      meta = {
        colors: activeColors,
        originalColors,
        isDefault: extracted.isDefault && !isManifestApplied,
        hitcircleImage,
        hitcircleOverlayImage,
        default1Image,
        digitImages,
        approachCircleImage,
      }
      subtitle = `skin.ini: [Colours] (${activeColors.length} комбо)`
      affectedFiles = ['skin.ini']
    }

    tweaks.push({
      id: cfg.id,
      title: cfg.title,
      subtitle,
      description: cfg.description,
      category: cfg.category,
      previewType: cfg.previewType,
      applied,
      canReset,
      previewImage: cfg.id === 'cursor-color' ? (previewTrailImage || previewImage) : previewImage,
      previewCursorImage: cfg.category === 'cursor' ? previewCursorImage : undefined,
      previewAudio,
      affectedFiles,
      meta,
    })
  }

  return {
    skinName,
    skinPath,
    modifiedCount,
    hasBackup: Boolean(manifest && Object.keys(manifest.tweaks).length > 0),
    tweaks,
  }
}

export async function applySkinTweak(
  skinPath: string,
  tweakId: string,
  enable: boolean
): Promise<SkinCustomizationData> {
  const cfg = TWEAK_CONFIGS.find((t) => t.id === tweakId)
  if (!cfg) {
    throw new Error(`Неизвестная настройка: ${tweakId}`)
  }

  if (!fs.existsSync(skinPath) || !fs.statSync(skinPath).isDirectory()) {
    throw new Error(`Папка скина не найдена: ${skinPath}`)
  }

  if (enable) {
    // --- ENABLE TWEAK ---
    let manifest = readManifest(skinPath)
    if (!manifest) {
      manifest = {
        version: 1,
        skinName: path.basename(skinPath),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tweaks: {},
      }
    }

    const backupFilesDir = getBackupFilesDir(skinPath)
    if (!fs.existsSync(backupFilesDir)) {
      fs.mkdirSync(backupFilesDir, { recursive: true })
    }

    const backedUpFiles: BackupFileRecord[] = []
    const matchingFiles = cfg.filePatterns
      ? findMatchingFilesInDir(skinPath, cfg.filePatterns)
      : []

    const filesToModify = matchingFiles.length > 0
      ? matchingFiles
      : (cfg.defaultInjectFiles || [])

    const replacementBuffer = cfg.isAudio ? SILENT_WAV : TRANSPARENT_1X1_PNG

    for (const relName of filesToModify) {
      const fullPath = path.join(skinPath, relName)
      const exists = fs.existsSync(fullPath)

      if (exists) {
        // Backup original file if not already backed up
        const backupTarget = path.join(backupFilesDir, relName)
        if (!fs.existsSync(backupTarget)) {
          fs.copyFileSync(fullPath, backupTarget)
        }
        backedUpFiles.push({
          relPath: relName,
          existedBefore: true,
          backupRelPath: relName,
        })
      } else {
        backedUpFiles.push({
          relPath: relName,
          existedBefore: false,
          backupRelPath: null,
        })
      }

      // Write transparent PNG or silent WAV
      fs.writeFileSync(fullPath, replacementBuffer)
    }

    // Handle ini change if specified
    const iniChanges: BackupIniRecord[] = []
    if (cfg.ini) {
      const iniContent = readSkinIni(skinPath)
      const currentVal = getIniValue(iniContent, cfg.ini.section, cfg.ini.key)
      const updatedIni = setIniValue(iniContent, cfg.ini.section, cfg.ini.key, cfg.ini.tweakValue)
      writeSkinIni(skinPath, updatedIni)

      iniChanges.push({
        section: cfg.ini.section,
        key: cfg.ini.key,
        originalValue: currentVal,
        appliedValue: cfg.ini.tweakValue,
      })
    }

    manifest.tweaks[tweakId] = {
      tweakId,
      appliedAt: Date.now(),
      files: backedUpFiles,
      iniChanges,
    }
    manifest.updatedAt = Date.now()
    writeManifest(skinPath, manifest)
  } else {
    // --- DISABLE TWEAK (REVERT) ---
    await resetSkinTweak(skinPath, tweakId)
  }

  return getSkinCustomizationData(skinPath)
}

export async function resetSkinTweak(
  skinPath: string,
  tweakId: string
): Promise<SkinCustomizationData> {
  const cfg = TWEAK_CONFIGS.find((t) => t.id === tweakId)
  if (!cfg) {
    throw new Error(`Неизвестная настройка: ${tweakId}`)
  }

  const manifest = readManifest(skinPath)
  const backupFilesDir = getBackupFilesDir(skinPath)
  const tweakRecord = manifest?.tweaks?.[tweakId]

  if (tweakRecord) {
    // Restore files from backup
    for (const f of tweakRecord.files) {
      const destPath = path.join(skinPath, f.relPath)
      if (f.existedBefore && f.backupRelPath) {
        const srcPath = path.join(backupFilesDir, f.backupRelPath)
        if (fs.existsSync(srcPath)) {
          fs.copyFileSync(srcPath, destPath)
          const isUsedByOther = Object.entries(manifest.tweaks).some(
            ([id, tw]) => id !== tweakId && tw.files?.some((rec) => rec.backupRelPath === f.backupRelPath)
          )
          if (!isUsedByOther) {
            try {
              fs.unlinkSync(srcPath)
            } catch {
              /* ignore */
            }
          }
        }
      } else {
        // Was injected by us; remove it
        if (fs.existsSync(destPath)) {
          try {
            fs.unlinkSync(destPath)
          } catch {
            /* ignore */
          }
        }
      }
    }

    // If we just restored cursor-trail, check if cursor-color tweak is active!
    // If so, the restored cursortrail.png must be recolored to the active hue.
    if (tweakId === 'cursor-trail') {
      const colorTweak = manifest.tweaks['cursor-color']
      if (colorTweak?.meta && typeof colorTweak.meta.hue === 'number' && colorTweak.meta.recolorTrail !== false) {
        const activeHue = colorTweak.meta.hue
        for (const f of tweakRecord.files) {
          if (f.relPath.startsWith('cursortrail')) {
            const trailPath = path.join(skinPath, f.relPath)
            if (fs.existsSync(trailPath)) {
              try {
                const buf = fs.readFileSync(trailPath)
                if (buf.length > 150) {
                  const recolored = processSpriteRecolor(buf, activeHue)
                  fs.writeFileSync(trailPath, recolored)
                }
              } catch (err) {
                console.error(`Ошибка перекрашивания восстановленного ${f.relPath}:`, err)
              }
            }
          }
        }
      }
    }

    // If we just restored cursor-color, ensure cursortrail is safely restored from backup
    if (tweakId === 'cursor-color') {
      for (const f of ['cursortrail.png', 'cursortrail@2x.png']) {
        const backupPath = path.join(backupFilesDir, f)
        const destPath = path.join(skinPath, f)
        if (fs.existsSync(backupPath)) {
          try {
            fs.copyFileSync(backupPath, destPath)
            fs.unlinkSync(backupPath)
          } catch {}
        }
      }
      const trailTweak = manifest.tweaks['cursor-trail']
      if (trailTweak) {
        for (const f of ['cursortrail.png', 'cursortrail@2x.png']) {
          const trailPath = path.join(skinPath, f)
          fs.writeFileSync(trailPath, TRANSPARENT_1X1_PNG)
        }
      }
    }

    // Revert ini changes if skin.ini existed before this tweak
    const createdIni = tweakRecord.files?.some((f) => f.relPath === 'skin.ini' && !f.existedBefore)
    if (!createdIni && tweakRecord.iniChanges && tweakRecord.iniChanges.length > 0) {
      let iniContent = readSkinIni(skinPath)
      for (const ini of tweakRecord.iniChanges) {
        if (ini.originalValue !== null) {
          iniContent = setIniValue(iniContent, ini.section, ini.key, ini.originalValue)
        } else {
          iniContent = removeIniValue(iniContent, ini.section, ini.key)
        }
      }
      writeSkinIni(skinPath, iniContent)
    }

    delete manifest.tweaks[tweakId]
    manifest.updatedAt = Date.now()

    if (Object.keys(manifest.tweaks).length === 0) {
      // No more tweaks in backup; remove .tosu-backup folder
      const backupDir = getBackupDir(skinPath)
      try {
        fs.rmSync(backupDir, { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    } else {
      writeManifest(skinPath, manifest)
    }
  } else {
    // Tweak wasn't in manifest, but user wants to revert (e.g. skin author had CursorExpand: 0)
    if (cfg.ini && cfg.ini.revertValue) {
      let iniContent = readSkinIni(skinPath)
      iniContent = setIniValue(iniContent, cfg.ini.section, cfg.ini.key, cfg.ini.revertValue)
      writeSkinIni(skinPath, iniContent)
    }
  }

  return getSkinCustomizationData(skinPath)
}

export async function resetAllSkinTweaks(skinPath: string): Promise<SkinCustomizationData> {
  const manifest = readManifest(skinPath)
  if (!manifest) {
    return getSkinCustomizationData(skinPath)
  }

  const tweakIds = Object.keys(manifest.tweaks)
  for (const tid of tweakIds) {
    await resetSkinTweak(skinPath, tid)
  }

  const backupDir = getBackupDir(skinPath)
  if (fs.existsSync(backupDir)) {
    try {
      fs.rmSync(backupDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }

  return getSkinCustomizationData(skinPath)
}

// --- Cursor Color Tinting / Recoloring ---

export interface RecolorCursorOptions {
  hue: number // Target hue (0-360)
  recolorTrail?: boolean // default: true
}

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

/**
 * Transforms RGBA buffer pixels to target hue.
 * - Detects base dominant hue to preserve subtle inner gradient differences and highlights.
 * - If sprite is grayscale/white, tints it gracefully while preserving white highlights and black outlines.
 * - If sprite is colored, maps the dominant color directly to targetHue, preserving gradient offsets and details!
 */
function processSpriteRecolor(imageBuffer: Buffer, targetHue: number): Buffer {
  const png = PNG.sync.read(imageBuffer)
  const data = png.data
  const pixelCount = png.width * png.height

  // Pass 1: analyze dominant hue
  let coloredPixels = 0
  let sinSum = 0
  let cosSum = 0

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a < 20) continue

    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const [h, s, l] = rgbToHsl(r, g, b)

    if (s > 0.08 && l > 0.08 && l < 0.94) {
      coloredPixels++
      const rad = (h * Math.PI) / 180
      sinSum += Math.sin(rad)
      cosSum += Math.cos(rad)
    }
  }

  const isGrayscale = coloredPixels < Math.max(10, pixelCount * 0.01)
  const baseHue =
    coloredPixels > 0
      ? ((Math.atan2(sinSum / coloredPixels, cosSum / coloredPixels) * 180) / Math.PI + 360) % 360
      : 0

  // Pass 2: apply transformation preserving gradients, lighting, and borders
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a < 5) continue

    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const [h, s, l] = rgbToHsl(r, g, b)

    if (isGrayscale) {
      // Tint grayscale/white sprite: retain pure white highlights (l >= 0.96) and pure black borders (l <= 0.05)
      if (l > 0.05 && l < 0.96) {
        const sat = Math.sin(l * Math.PI) * 0.92
        const [nr, ng, nb] = hslToRgb(targetHue, sat, l)
        data[i] = nr
        data[i + 1] = ng
        data[i + 2] = nb
      }
    } else {
      // Colored sprite: preserve gradient variation relative to baseHue
      if (s > 0.08 && l > 0.04 && l < 0.97) {
        let hueDiff = h - baseHue
        if (hueDiff > 180) hueDiff -= 360
        if (hueDiff < -180) hueDiff += 360

        const newH = (targetHue + hueDiff * 0.7 + 360) % 360
        const [nr, ng, nb] = hslToRgb(newH, Math.max(s, 0.75), l)
        data[i] = nr
        data[i + 1] = ng
        data[i + 2] = nb
      }
    }
  }

  return PNG.sync.write(png, { deflateLevel: 9 })
}

export interface CursorColorHistoryEntry {
  hue: number
  recolorTrail: boolean
  appliedAt: number
}

async function applyCursorColorInternal(
  skinPath: string,
  targetHue: number,
  recolorTrail: boolean,
  history: CursorColorHistoryEntry[]
): Promise<SkinCustomizationData> {
  let manifest = readManifest(skinPath)
  if (!manifest) {
    manifest = {
      version: 1,
      skinName: path.basename(skinPath),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tweaks: {},
    }
  }

  const isTrailSuppressed = Boolean(manifest.tweaks['cursor-trail'])
  const backupFilesDir = getBackupFilesDir(skinPath)
  if (!fs.existsSync(backupFilesDir)) {
    fs.mkdirSync(backupFilesDir, { recursive: true })
  }

  const tweakId = 'cursor-color'
  const existingRecord = manifest.tweaks[tweakId]
  const backedUpFiles: BackupFileRecord[] = existingRecord ? [...existingRecord.files] : []

  // Ensure all cursor and trail files are safely backed up
  const allPotentialFiles = [
    'cursor.png',
    'cursor@2x.png',
    'cursormiddle.png',
    'cursormiddle@2x.png',
    'cursortrail.png',
    'cursortrail@2x.png',
  ]

  for (const relName of allPotentialFiles) {
    const fullPath = path.join(skinPath, relName)
    const backupTarget = path.join(backupFilesDir, relName)
    const backupExists = fs.existsSync(backupTarget)
    const fullExists = fs.existsSync(fullPath)

    if (fullExists && !backupExists) {
      fs.copyFileSync(fullPath, backupTarget)
      if (!backedUpFiles.some((f) => f.relPath === relName)) {
        backedUpFiles.push({
          relPath: relName,
          existedBefore: true,
          backupRelPath: relName,
        })
      }
    } else if (backupExists && !backedUpFiles.some((f) => f.relPath === relName)) {
      backedUpFiles.push({
        relPath: relName,
        existedBefore: true,
        backupRelPath: relName,
      })
    }
  }

  // Target files to recolor
  const filesToRecolor = [
    'cursor.png',
    'cursor@2x.png',
    'cursormiddle.png',
    'cursormiddle@2x.png',
  ]
  if (recolorTrail && !isTrailSuppressed) {
    filesToRecolor.push('cursortrail.png', 'cursortrail@2x.png')
  }

  for (const relName of filesToRecolor) {
    const fullPath = path.join(skinPath, relName)
    const backupTarget = path.join(backupFilesDir, relName)
    const backupExists = fs.existsSync(backupTarget)
    const fullExists = fs.existsSync(fullPath)

    if (!fullExists && !backupExists) continue
    if (isTrailSuppressed && relName.startsWith('cursortrail')) continue

    const sourceBuffer = backupExists ? fs.readFileSync(backupTarget) : fs.readFileSync(fullPath)
    if (sourceBuffer.length <= 150) continue // Skip 1x1 blank

    try {
      const recolored = processSpriteRecolor(sourceBuffer, targetHue)
      fs.writeFileSync(fullPath, recolored)
    } catch (err) {
      console.error(`Ошибка перекрашивания ${relName}:`, err)
    }
  }

  // If trail recoloring is turned off, restore cursortrail from backup if it was previously recolored
  if (!recolorTrail && !isTrailSuppressed) {
    for (const relName of ['cursortrail.png', 'cursortrail@2x.png']) {
      const backupTarget = path.join(backupFilesDir, relName)
      const fullPath = path.join(skinPath, relName)
      if (fs.existsSync(backupTarget)) {
        try {
          fs.copyFileSync(backupTarget, fullPath)
        } catch {}
      }
    }
  }

  manifest.tweaks[tweakId] = {
    tweakId,
    appliedAt: Date.now(),
    files: backedUpFiles,
    meta: {
      hue: targetHue,
      recolorTrail,
      history,
    },
  }
  manifest.updatedAt = Date.now()
  writeManifest(skinPath, manifest)

  return getSkinCustomizationData(skinPath)
}

export async function recolorSkinCursor(
  skinPath: string,
  options: RecolorCursorOptions
): Promise<SkinCustomizationData> {
  if (!fs.existsSync(skinPath) || !fs.statSync(skinPath).isDirectory()) {
    throw new Error(`Папка скина не найдена: ${skinPath}`)
  }

  const { hue, recolorTrail = true } = options
  const targetHue = ((hue % 360) + 360) % 360

  const manifest = readManifest(skinPath)
  const existingRecord = manifest?.tweaks?.['cursor-color']
  const history: CursorColorHistoryEntry[] = Array.isArray(existingRecord?.meta?.history)
    ? [...existingRecord.meta.history]
    : []

  if (existingRecord?.meta && typeof existingRecord.meta.hue === 'number') {
    if (existingRecord.meta.hue !== targetHue || existingRecord.meta.recolorTrail !== recolorTrail) {
      history.push({
        hue: existingRecord.meta.hue,
        recolorTrail: existingRecord.meta.recolorTrail ?? true,
        appliedAt: existingRecord.appliedAt || Date.now(),
      })
      if (history.length > 20) history.shift()
    }
  }

  return applyCursorColorInternal(skinPath, targetHue, recolorTrail, history)
}

export async function revertPreviousCursorColor(skinPath: string): Promise<SkinCustomizationData> {
  if (!fs.existsSync(skinPath) || !fs.statSync(skinPath).isDirectory()) {
    throw new Error(`Папка скина не найдена: ${skinPath}`)
  }

  const manifest = readManifest(skinPath)
  const tweak = manifest?.tweaks?.['cursor-color']
  if (!manifest || !tweak) {
    return getSkinCustomizationData(skinPath)
  }

  const history: CursorColorHistoryEntry[] = Array.isArray(tweak.meta?.history)
    ? [...tweak.meta.history]
    : []

  if (history.length > 0) {
    const previous = history.pop()!
    return applyCursorColorInternal(skinPath, previous.hue, previous.recolorTrail, history)
  } else {
    // If no previous color in history, revert back to original unmodded skin
    return resetSkinTweak(skinPath, 'cursor-color')
  }
}

export async function setSkinComboColors(
  skinPath: string,
  colors: string[]
): Promise<SkinCustomizationData> {
  if (!fs.existsSync(skinPath) || !fs.statSync(skinPath).isDirectory()) {
    throw new Error(`Папка скина не найдена: ${skinPath}`)
  }

  if (!Array.isArray(colors) || colors.length === 0) {
    throw new Error('Необходимо указать хотя бы один цвет комбо')
  }

  // Clamp to max 8 colors (osu! limit)
  const targetColors = colors.slice(0, 8).map((c) => {
    if (typeof c !== 'string') return '255, 255, 255'
    const trimmed = c.trim()
    if (trimmed.startsWith('#')) {
      return hexToRgbString(trimmed)
    }
    const parts = trimmed.split(',').map((p) => Math.max(0, Math.min(255, parseInt(p.trim(), 10) || 0)))
    if (parts.length < 3) {
      return '255, 255, 255'
    }
    return `${parts[0]}, ${parts[1]}, ${parts[2]}`
  })

  let manifest = readManifest(skinPath)
  if (!manifest) {
    manifest = {
      version: 1,
      skinName: path.basename(skinPath),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      tweaks: {},
    }
  }

  const tweakId = 'combo-colors'
  const existingRecord = manifest.tweaks[tweakId]
  let iniChanges: BackupIniRecord[] = []
  let backedUpFiles: BackupFileRecord[] = []

  const iniPath = path.join(skinPath, 'skin.ini')
  const iniExisted = fs.existsSync(iniPath)

  if (existingRecord?.files && existingRecord.files.length > 0) {
    backedUpFiles = [...existingRecord.files]
  } else if (!iniExisted) {
    backedUpFiles = [{ relPath: 'skin.ini', existedBefore: false }]
  }

  let iniContent = readSkinIni(skinPath)

  if (existingRecord?.iniChanges && existingRecord.iniChanges.length > 0) {
    // Keep true original values before our modifications
    iniChanges = [...existingRecord.iniChanges]
  } else {
    // Record original state of Combo1 through Combo8 from current skin.ini
    for (let i = 1; i <= 8; i++) {
      const key = `Combo${i}`
      const origVal = getIniValue(iniContent, 'Colours', key)
      iniChanges.push({
        section: 'Colours',
        key,
        originalValue: origVal,
        appliedValue: '',
      })
    }
  }

  // Apply new combo colors
  for (let i = 1; i <= 8; i++) {
    const key = `Combo${i}`
    if (i <= targetColors.length) {
      const val = targetColors[i - 1]
      iniContent = setIniValue(iniContent, 'Colours', key, val)
      const rec = iniChanges.find((r) => r.key.toLowerCase() === key.toLowerCase())
      if (rec) {
        rec.appliedValue = val
      }
    } else {
      iniContent = removeIniValue(iniContent, 'Colours', key)
      const rec = iniChanges.find((r) => r.key.toLowerCase() === key.toLowerCase())
      if (rec) {
        rec.appliedValue = ''
      }
    }
  }

  writeSkinIni(skinPath, iniContent)

  const origList = iniChanges
    .filter((r) => r.originalValue !== null)
    .map((r) => r.originalValue as string)

  manifest.tweaks[tweakId] = {
    tweakId,
    appliedAt: Date.now(),
    files: backedUpFiles,
    iniChanges,
    meta: {
      colors: targetColors,
      originalColors: origList.length > 0 ? origList : [...DEFAULT_OSU_COMBO_COLORS],
    },
  }
  manifest.updatedAt = Date.now()
  writeManifest(skinPath, manifest)

  return getSkinCustomizationData(skinPath)
}

