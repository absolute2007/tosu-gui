import { useEffect, useState, type ReactNode } from 'react'
import { Copy } from 'lucide-react'
import { Toggle } from '../components/Toggle'
import { useI18n } from '../i18n/context'

interface Props {
  onToast: (msg: string, type: 'success' | 'error') => void
}

interface CalcState {
  areaW: number
  areaH: number
  lessLag: boolean
}

const STORAGE_KEY = 'tosu-gui.tablet.radialFollow.v2'
const RESAMPLER_KEY = 'tosu-gui.tablet.temporalResampler'
const TOOL_KEY = 'tosu-gui.tablet.tool'

const CALC_DEFAULTS: CalcState = { areaW: 0, areaH: 0, lessLag: false }

interface RadialFollowValues {
  outerRadius: number
  innerRadius: number
  initialSmoothingCoefficient: number
  softKneeScale: number
  smoothingLeakCoefficient: number
}

/**
 * Same formulas as Mixmg's Radial Follow Smoothing Calculator
 * (mixmg.github.io/smoothing), for the "(Tablet coordinates)" variant.
 * Area in millimetres, e.g. 42 × 39 → 0.37548 / 0.2535 / 0.2535 / 0.48884 / 0.21926.
 */
function computeRadialFollow(width: number, height: number, lessLag: boolean): RadialFollowValues | null {
  if (!(width > 0) || !(height > 0)) return null
  const a = 0.0298 * width
  const b = 0.0065 * height
  // The original reads the aspect ratio back from a 4-decimal field
  const aspect = Number((width / height).toFixed(4))
  return {
    outerRadius: 0.3 * a,
    innerRadius: b,
    initialSmoothingCoefficient: b,
    softKneeScale: Math.log1p(Math.exp(-Math.tanh(0.5 * (a - b)))),
    smoothingLeakCoefficient: (lessLag ? 0.17 : 0.3) * Math.log1p(aspect),
  }
}

/** 5 decimals like the original, without trailing zeros */
function fmt(n: number): string {
  return String(Number(n.toFixed(5)))
}

function DecimalInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(value > 0 ? String(value) : '')

  return (
    <input
      className="glass-input -narrow"
      type="text"
      inputMode="decimal"
      placeholder="0"
      value={text}
      onChange={(e) => {
        const next = e.target.value.replace(',', '.')
        if (next === '' || /^\d*\.?\d*$/.test(next)) {
          setText(next)
          const parsed = parseFloat(next)
          onChange(Number.isFinite(parsed) ? parsed : 0)
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}

function Row({ label, desc, children }: { label: string; desc?: string; children: ReactNode }) {
  return (
    <div className="setting-row">
      <div className="setting-info">
        <div className="setting-label">{label}</div>
        {desc && <div className="setting-desc">{desc}</div>}
      </div>
      <div className="setting-control">{children}</div>
    </div>
  )
}

function useCopy(onToast: Props['onToast']) {
  const { lang } = useI18n()
  const en = lang === 'en'
  return async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      onToast(en ? `Copied ${label}: ${value}` : `Скопировано ${label}: ${value}`, 'success')
    } catch {
      onToast(en ? 'Could not copy' : 'Не удалось скопировать', 'error')
    }
  }
}

function CopyButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const { lang } = useI18n()
  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={onClick}
      disabled={disabled}
      title={lang === 'en' ? 'Copy' : 'Скопировать'}
    >
      <Copy size={12} />
    </button>
  )
}

/** Persists a tool's inputs in localStorage */
function useStoredState<T extends object>(key: string, defaults: T) {
  const [s, setS] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw) return { ...defaults, ...JSON.parse(raw) }
    } catch {
      /* ignore */
    }
    return defaults
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(s))
    } catch {
      /* ignore */
    }
  }, [key, s])

  const set = <K extends keyof T>(k: K, value: T[K]) => setS((prev) => ({ ...prev, [k]: value }))
  return [s, set] as const
}

const valueStyle = { fontSize: 13, fontWeight: 600, fontVariantNumeric: 'tabular-nums' } as const
const mutedStyle = { fontSize: 13, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' } as const

function RadialFollowTool({ onToast }: Props) {
  const { lang } = useI18n()
  const en = lang === 'en'
  const [s, set] = useStoredState(STORAGE_KEY, CALC_DEFAULTS)
  const copy = useCopy(onToast)

  const result = computeRadialFollow(s.areaW, s.areaH, s.lessLag)
  const aspect = s.areaW > 0 && s.areaH > 0 ? (s.areaW / s.areaH).toFixed(4) : '—'

  const rows: { label: string; unit?: string; value: number | undefined }[] = [
    { label: 'Outer Radius', unit: 'mm', value: result?.outerRadius },
    { label: 'Inner Radius', unit: 'mm', value: result?.innerRadius },
    { label: 'Initial Smoothing Coefficient', value: result?.initialSmoothingCoefficient },
    { label: 'Soft Knee Scale', value: result?.softKneeScale },
    { label: 'Smoothing Leak Coefficient', value: result?.smoothingLeakCoefficient },
  ]

  return (
    <>
      <div className="glass-card">
        <div className="card-header">{en ? 'Tablet area' : 'Область планшета'}</div>
        <div className="card-body">
          <Row
            label={en ? 'Area size' : 'Размер области'}
            desc={en ? 'Width × height in millimetres, as in OTD' : 'Ширина × высота в миллиметрах, как в OTD'}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <DecimalInput value={s.areaW} onChange={(v) => set('areaW', v)} />
              ×
              <DecimalInput value={s.areaH} onChange={(v) => set('areaH', v)} />
            </span>
          </Row>
          <Row label={en ? 'Aspect ratio' : 'Соотношение сторон'}>
            <span style={mutedStyle}>{aspect}</span>
          </Row>
          <Row
            label={en ? 'Smaller cursor lag' : 'Меньше задержка курсора'}
            desc={
              en
                ? 'Lower Smoothing Leak Coefficient: less lag, less precision'
                : 'Ниже Smoothing Leak Coefficient: меньше задержка, но меньше точность'
            }
          >
            <Toggle checked={s.lessLag} onChange={(v) => set('lessLag', v)} />
          </Row>
        </div>
      </div>

      <div className="glass-card">
        <div className="card-header">AbstractQbit's Radial Follow Smoothing (Tablet coordinates)</div>
        <div className="card-body">
          {rows.map(({ label, unit, value }) => (
            <Row key={label} label={label}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={valueStyle}>
                  {value === undefined ? '—' : `${fmt(value)}${unit ? ` ${unit}` : ''}`}
                </span>
                <CopyButton
                  onClick={() => value !== undefined && void copy(fmt(value), label)}
                  disabled={value === undefined}
                />
              </span>
            </Row>
          ))}
        </div>
      </div>

      <p className="setting-desc" style={{ margin: '10px 14px 0' }}>
        {en
          ? "Formulas from Mixmg's Radial Follow Smoothing Calculator. Enter the values in OTD → Filters for the (Tablet coordinates) plugin."
          : 'Формулы из калькулятора Mixmg (Radial Follow Smoothing Calculator). Значения вводятся в OTD → Filters для плагина (Tablet coordinates).'}
      </p>
    </>
  )
}

type ResamplerProfile = 'balanced' | 'predictive'

interface ResamplerState {
  monitorHz: number
  tabletRps: number
  frequency: number
  reverseEma: number
  profile: ResamplerProfile
}

const RESAMPLER_DEFAULTS: ResamplerState = {
  monitorHz: 240,
  tabletRps: 133,
  frequency: 1000,
  reverseEma: 1,
  profile: 'balanced',
}

/**
 * Starting values for shmkle's TemporalResampler (v1.5). Latency terms follow the plugin:
 * prediction leaves (1 − ratio) of a report interval, resampling adds 0.5 / (Frequency + rps)
 * with Maximize Frequency on, Smoothing Latency is added as is.
 */
function computeResampler(s: ResamplerState) {
  if (!(s.tabletRps > 0) || !(s.frequency > 0)) return null
  const reportMs = 1000 / s.tabletRps
  const predictionRatio = s.profile === 'predictive' ? 1 : 0.5
  // Full prediction overshoots on its own; the README pairs it with a little smoothing
  const smoothingLatency = s.profile === 'predictive' ? Math.round(reportMs * 0.5 * 10) / 10 : 0
  const predictionMs = (1 - predictionRatio) * reportMs
  const resampleMs = 500 / (s.frequency + s.tabletRps)
  return {
    predictionRatio,
    smoothingLatency,
    reportMs,
    predictionMs,
    resampleMs,
    totalMs: predictionMs + resampleMs + smoothingLatency,
  }
}

function TemporalResamplerTool({ onToast }: Props) {
  const { lang } = useI18n()
  const en = lang === 'en'
  const [s, set] = useStoredState(RESAMPLER_KEY, RESAMPLER_DEFAULTS)
  const copy = useCopy(onToast)
  const r = computeResampler(s)
  const ms = (n: number) => `${n.toFixed(2)} ms`

  const results: { label: string; value: string | undefined; unit?: string; hint: string }[] = [
    {
      label: 'Prediction Ratio',
      value: r ? String(r.predictionRatio) : undefined,
      hint:
        s.profile === 'predictive'
          ? en
            ? 'Predicts the whole report interval: no prediction lag'
            : 'Предсказывает весь интервал между репортами: без задержки предсказания'
          : en
            ? 'Plugin default: half a report of lag, no overshoot'
            : 'Значение по умолчанию: полрепорта задержки, без перелётов',
    },
    {
      label: 'Follow Radius',
      value: '0',
      unit: 'mm',
      hint: en
        ? 'Cursor trails the pen by this distance; 0 for aim'
        : 'Курсор отстаёт от пера на это расстояние; для аима 0',
    },
    {
      label: 'Smoothing Latency',
      value: r ? String(r.smoothingLatency) : undefined,
      unit: 'ms',
      hint:
        s.profile === 'predictive'
          ? en
            ? 'Half a report interval to calm full prediction'
            : 'Полинтервала репорта, чтобы успокоить полное предсказание'
          : en
            ? 'No smoothing'
            : 'Без сглаживания',
    },
    {
      label: 'Reverse EMA',
      value: String(s.reverseEma),
      hint: en ? 'Your tuned value, see below' : 'Ваше подобранное значение, см. ниже',
    },
    { label: 'Maximize Frequency', value: 'On', hint: en ? 'More updates, no extra CPU' : 'Больше обновлений без нагрузки на CPU' },
    { label: 'Log Stats', value: 'Off', hint: en ? 'Only for measuring' : 'Только для замеров' },
    {
      label: 'Frequency',
      value: String(s.frequency),
      unit: 'hz',
      hint:
        s.frequency < s.monitorHz
          ? en
            ? 'Lower than the monitor refresh rate: raise it'
            : 'Ниже частоты монитора — повысьте'
          : en
            ? 'Above the monitor refresh rate'
            : 'Выше частоты монитора',
    },
  ]

  return (
    <>
      <div className="glass-card">
        <div className="card-header">{en ? 'Your setup' : 'Ваше железо'}</div>
        <div className="card-body">
          <Row label={en ? 'Monitor refresh rate' : 'Частота монитора'} desc="Hz">
            <DecimalInput value={s.monitorHz} onChange={(v) => set('monitorHz', v)} />
          </Row>
          <Row
            label={en ? 'Tablet report rate' : 'Частота репортов планшета'}
            desc={
              en
                ? 'rps, see OTD → Tablet debugger. Wacom CTL-472/672: 133'
                : 'rps, смотрите в OTD → Tablet debugger. Wacom CTL-472/672: 133'
            }
          >
            <DecimalInput value={s.tabletRps} onChange={(v) => set('tabletRps', v)} />
          </Row>
          <Row
            label={en ? 'Profile' : 'Профиль'}
            desc={
              s.profile === 'predictive'
                ? en
                  ? 'Lowest lag; can feel slightly floaty'
                  : 'Минимум задержки; курсор может слегка «плавать»'
                : en
                  ? 'Plugin defaults: stable and predictable'
                  : 'Как в плагине по умолчанию: стабильно и предсказуемо'
            }
          >
            <select
              className="glass-input"
              value={s.profile}
              onChange={(e) => set('profile', e.target.value as ResamplerProfile)}
            >
              <option value="balanced">{en ? 'Balanced' : 'Сбалансированный'}</option>
              <option value="predictive">{en ? 'Full prediction' : 'Полное предсказание'}</option>
            </select>
          </Row>
          <Row
            label="Frequency"
            desc={en ? 'Output rate of the filter. 1000 is a safe value' : 'Частота вывода фильтра. 1000 — надёжное значение'}
          >
            <DecimalInput value={s.frequency} onChange={(v) => set('frequency', v)} />
          </Row>
          <Row
            label="Reverse EMA"
            desc={en ? '1 = off. Tune it with the test below' : '1 = выключено. Подбирается тестом ниже'}
          >
            <DecimalInput value={s.reverseEma} onChange={(v) => set('reverseEma', Math.min(v, 1))} />
          </Row>
        </div>
      </div>

      <div className="glass-card">
        <div className="card-header">Temporal Resampler</div>
        <div className="card-body">
          {results.map(({ label, value, unit, hint }) => (
            <Row key={label} label={label} desc={hint}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={valueStyle}>{value === undefined ? '—' : `${value}${unit ? ` ${unit}` : ''}`}</span>
                <CopyButton onClick={() => value !== undefined && void copy(value, label)} disabled={value === undefined} />
              </span>
            </Row>
          ))}
        </div>
      </div>

      {r && (
        <div className="glass-card">
          <div className="card-header">{en ? 'Estimated added latency' : 'Примерная добавленная задержка'}</div>
          <div className="card-body">
            <Row label={en ? 'Report interval' : 'Интервал между репортами'}>
              <span style={mutedStyle}>{ms(r.reportMs)}</span>
            </Row>
            <Row label={en ? 'Prediction' : 'Предсказание'}>
              <span style={mutedStyle}>{ms(r.predictionMs)}</span>
            </Row>
            <Row label={en ? 'Resampling' : 'Ресемплинг'}>
              <span style={mutedStyle}>{ms(r.resampleMs)}</span>
            </Row>
            <Row label={en ? 'Smoothing' : 'Сглаживание'}>
              <span style={mutedStyle}>{ms(r.smoothingLatency)}</span>
            </Row>
            <Row label={en ? 'Total' : 'Итого'}>
              <span style={valueStyle}>{ms(r.totalMs)}</span>
            </Row>
          </div>
        </div>
      )}

      <div className="glass-card">
        <div className="card-header">{en ? 'Tuning Reverse EMA' : 'Как подобрать Reverse EMA'}</div>
        <div className="card-body">
          <p className="setting-desc" style={{ margin: 0, lineHeight: 1.6 }}>
            {en
              ? 'Reverse EMA removes the smoothing some tablets apply in hardware. Start at 0.5. Put a ruler or another object with a corner on the tablet, hold it firmly and hit the corner with the pen at speed. If the cursor bounces back past the stop point, it overshoots: raise the value. If movement still feels smoothed, lower it. Keep the lowest value that does not overshoot. If your tablet has no hardware smoothing, leave 1.'
              : 'Reverse EMA убирает сглаживание, которое некоторые планшеты делают сами. Начните с 0.5. Положите на планшет линейку или другой предмет с углом, прижмите его и резко ударьте пером в угол. Если курсор отскакивает назад после остановки — это перелёт, повысьте значение. Если движение всё ещё ощущается сглаженным — понизьте. Оставьте минимальное значение без перелётов. Если у планшета нет аппаратного сглаживания, оставьте 1.'}
          </p>
        </div>
      </div>

      <p className="setting-desc" style={{ margin: '10px 14px 0' }}>
        {en
          ? "Based on shmkle's TemporalResampler (v1.5) and the Reconstructor wiki. These are starting points, not exact values."
          : 'По описанию TemporalResampler от shmkle (v1.5) и вики Reconstructor. Это отправные значения, а не точный расчёт.'}
      </p>
    </>
  )
}

/** Each OTD plugin helper is its own sub-tab */
const TOOLS = [
  { id: 'radial-follow', label: 'Radial Follow Smoothing', Component: RadialFollowTool },
  { id: 'temporal-resampler', label: 'Temporal Resampler', Component: TemporalResamplerTool },
] as const

type ToolId = (typeof TOOLS)[number]['id']

function loadTool(): ToolId {
  try {
    const saved = localStorage.getItem(TOOL_KEY)
    const found = TOOLS.find((tool) => tool.id === saved)
    if (found) return found.id
  } catch {
    /* ignore */
  }
  return TOOLS[0].id
}

export function TabletPage({ onToast }: Props) {
  const { lang } = useI18n()
  const en = lang === 'en'
  const [tool, setTool] = useState<ToolId>(loadTool)
  const active = TOOLS.find((t) => t.id === tool) ?? TOOLS[0]

  useEffect(() => {
    try {
      localStorage.setItem(TOOL_KEY, tool)
    } catch {
      /* ignore */
    }
  }, [tool])

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">{en ? 'Tablet' : 'Планшет'}</h1>
        <p className="page-subtitle">
          {en ? 'Helpers for OpenTabletDriver filters' : 'Помощники для фильтров OpenTabletDriver'}
        </p>
      </div>

      <div className="tabs-inline">
        {TOOLS.map(({ id, label }) => (
          <button key={id} className={`tab-btn ${tool === id ? '-active' : ''}`} onClick={() => setTool(id)}>
            {label}
          </button>
        ))}
      </div>

      <active.Component onToast={onToast} />
    </div>
  )
}
