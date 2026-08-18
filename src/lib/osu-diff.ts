/**
 * Official osu-web difficulty colours + mode icons (ppy/osu-web beatmap-helper).
 * Colour scale: d3.interpolateRgb.gamma(2.2) over the published breakpoints.
 */

export type OsuModeName = 'osu' | 'taiko' | 'fruits' | 'mania'

const DIFF_DOMAIN = [0.1, 1.25, 2, 2.5, 3.3, 4.2, 4.9, 5.8, 6.7, 7.7, 9]
const DIFF_RANGE = [
  '#4290FB',
  '#4FC0FF',
  '#4FFFD5',
  '#7CFF4F',
  '#F6F05C',
  '#FF8068',
  '#FF4E6F',
  '#C645B8',
  '#6563DE',
  '#18158E',
  '#000000',
]

/** Font paths from ppy/osu-web extra.svg (y-up, 1000 em). */
export const MODE_PATHS: Record<OsuModeName, string> = {
  osu: 'M500 740q106 0 197-53 88-52 140-140 53-91 53-197t-53-197q-52-88-140-140-91-53-197-53t-197 53q-88 52-140 140-53 91-53 197t53 197q52 88 140 140 91 53 197 53z m0 80q-97 0-182-36t-150-102q-64-62-101-148t-37-184 37-182 101-150q62-64 149-101t183-37 182 36 150 102q64 62 101 149t37 183-36 182-102 150q-62 64-148 101t-184 37v0z m0-232q-64 0-119-32t-87-87-32-119 32-119 87-87 119-32 119 32 87 87 32 119-32 119-87 87-119 32z',
  fruits:
    'M500 740q106 0 197-53 88-52 140-140 53-91 53-197t-53-197q-52-88-140-140-91-53-197-53t-197 53q-88 52-140 140-53 91-53 197t53 197q52 88 140 140 91 53 197 53z m0 80q-97 0-182-36t-150-102q-64-62-101-148t-37-184 37-182 101-150q62-64 149-101t183-37 182 36 150 102q64 62 101 149t37 183-36 182-102 150q-62 64-148 101t-184 37v0z m192-470q0 31-22 53t-53 22-53-22-22-53 22-53 53-22 53 22 22 53z m-174 152q0 31-22 53t-53 22-53-22-22-53 22-53 53-22 53 22 22 53z m0-304q0 31-22 53t-53 22-53-22-22-53 22-53 54-22 53 22 21 53z',
  mania:
    'M500 48q-21 0-35 15t-15 35v504q0 21 15 36t35 14 36-14 14-36v-504q0-21-14-35t-36-15z m-110 192v220q0 21-14 36t-36 14-35-14-15-36v-220q0-21 15-35t35-15 36 15 14 35z m320 0v220q0 21-14 36t-36 14-35-14-15-36v-220q0-21 15-35t35-15 36 15 14 35z m-210 500q-106 0-197-53-88-52-140-140-53-91-53-197t53-197q52-88 140-140 91-53 197-53t197 53q88 52 140 140 53 91 53 197t-53 197q-52 88-140 140-91 53-197 53z m0 80q97 0 182-36t150-102q64-62 101-148t37-184-36-182-102-150q-62-64-148-101t-184-37-182 36-150 102q-64 62-101 149t-37 183 37 182 101 150q62 64 149 101t183 37v0z',
  taiko:
    'M500 650q-82 0-152-41-67-40-107-107-41-70-41-152t41-152q40-67 107-107 70-41 152-41t152 41q67 40 107 107 41 70 41 152t-41 152q-40 67-107 107-70 41-152 41z m-200-300q0 69 43 123t107 71v-388q-65 17-107 71t-43 123z m250-194v388q65-17 108-71t42-123-42-123-108-71z m-50 584q106 0 197-53 88-52 140-140 53-91 53-197t-53-197q-52-88-140-140-91-53-197-53t-197 53q-88 52-140 140-53 91-53 197t53 197q52 88 140 140 91 53 197 53z m0 80q-97 0-182-36t-150-102q-64-62-101-148t-37-184 37-182 101-150q62-64 149-101t183-37 182 36 150 102q64 62 101 149t37 183-36 182-102 150q-62 64-148 101t-184 37v0z',
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ]
}

function toLin(c: number): number {
  return Math.pow(c / 255, 2.2)
}

function toSrgb(c: number): number {
  return Math.round(Math.pow(Math.min(1, Math.max(0, c)), 1 / 2.2) * 255)
}

function rgbHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`
}

/** Same colour the website uses on difficulty icons. */
export function getDiffColour(rating: number): string {
  if (!(rating > 0) || rating < 0.1) return '#AAAAAA'
  if (rating >= 9) return '#000000'
  let i = 0
  while (i < DIFF_DOMAIN.length - 2 && rating > DIFF_DOMAIN[i + 1]) i++
  const a = DIFF_DOMAIN[i]
  const b = DIFF_DOMAIN[i + 1]
  const t = (rating - a) / (b - a || 1)
  const [r1, g1, b1] = hexToRgb(DIFF_RANGE[i])
  const [r2, g2, b2] = hexToRgb(DIFF_RANGE[i + 1])
  return rgbHex(
    toSrgb(toLin(r1) + (toLin(r2) - toLin(r1)) * t),
    toSrgb(toLin(g1) + (toLin(g2) - toLin(g1)) * t),
    toSrgb(toLin(b1) + (toLin(b2) - toLin(b1)) * t)
  )
}

export function normalizeOsuMode(mode: string | number | undefined): OsuModeName {
  const m = String(mode ?? 'osu').toLowerCase()
  if (m === '1' || m === 'taiko') return 'taiko'
  if (m === '2' || m === 'fruits' || m === 'ctb' || m === 'catch') return 'fruits'
  if (m === '3' || m === 'mania') return 'mania'
  return 'osu'
}

export function isOsuStandardMode(mode: string | number | undefined): boolean {
  const m = String(mode ?? '').toLowerCase()
  return m === 'osu' || m === '0' || m === ''
}

/** osu-web UserStatistics::calculateRecommendedStarDifficulty */
export function recommendedStarsFromPp(pp: number, mode: OsuModeName = 'osu'): number {
  if (!(pp > 0)) return 1
  if (mode === 'taiko') return Math.pow(pp, 0.35) * 0.27
  return Math.pow(pp, 0.4) * 0.195
}

export interface DiffPickable {
  id: number
  stars: number
  mode: string
}

/** Closest star rating to the player's recommended difficulty (osu!standard first). */
export function pickRecommendedBeatmap<T extends DiffPickable>(
  beatmaps: T[],
  recommendedStars: number | null | undefined,
  preferMode: OsuModeName = 'osu'
): T | null {
  if (!beatmaps.length) return null
  const pool =
    preferMode === 'osu'
      ? beatmaps.filter((b) => isOsuStandardMode(b.mode))
      : beatmaps.filter((b) => normalizeOsuMode(b.mode) === preferMode)
  const list = pool.length ? pool : beatmaps.slice()
  if (recommendedStars == null || !(recommendedStars > 0)) {
    return list[Math.floor(list.length / 2)] || list[0]
  }
  let best = list[0]
  let bestDist = Math.abs((best.stars || 0) - recommendedStars)
  for (let i = 1; i < list.length; i++) {
    const d = Math.abs((list[i].stars || 0) - recommendedStars)
    if (d < bestDist) {
      best = list[i]
      bestDist = d
    }
  }
  return best
}

export function modePath(mode: string | number | undefined): string {
  return MODE_PATHS[normalizeOsuMode(mode)]
}

export function diffIconSvg(mode: string | number | undefined, stars: number, size = 18): string {
  const color = getDiffColour(stars)
  const d = modePath(mode)
  return (
    `<svg class="osu-diff-icon" width="${size}" height="${size}" viewBox="0 0 1000 1000" aria-hidden="true">` +
    `<g transform="translate(0,1000) scale(1,-1)">` +
    `<path fill="${color}" fill-rule="evenodd" d="${d}"/>` +
    `</g></svg>`
  )
}
