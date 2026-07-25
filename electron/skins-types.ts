/** Shared DTO for skins catalog / download (main ↔ renderer). */

export type SkinModeFilter = 'any' | 'osu' | 'taiko' | 'fruits' | 'mania'

export type SkinSort =
  | 'recent'
  | 'popular'
  | 'downloads'
  | 'likes'
  | 'views'

export type SkinPackageKind = 'osk' | 'lite' | 'ultra_lite' | 'extras'

export type SkinHost = 'google' | 'mega' | 'mediafire'

export interface SkinSearchParams {
  query?: string
  mode?: SkinModeFilter
  sort?: SkinSort
  page?: number
  /** Cursor from previous page (osuck uses last item _id / released_at via cookies; we pass explicitly) */
  cursorId?: string | null
  cursorValue?: string | null
}

export interface SkinCreator {
  id: number
  name: string
  avatarUrl: string | null
}

export interface SkinSummary {
  /** Numeric osuck skin id */
  id: number
  /** Mongo-style document id used for pagination */
  docId: string
  name: string
  version: string
  creators: SkinCreator[]
  likes: number
  views: number
  downloads: number
  sizeLabel: string
  /** Thumbnail URL (may need session headers — use skins:thumb proxy if broken) */
  thumbUrl: string | null
  coverUrl: string | null
  pageUrl: string
  modes: string[]
  releasedAt: string | null
}

export interface SkinPackageLink {
  kind: SkinPackageKind
  label: string
  sizeBytes: number
  hosts: SkinHost[]
  checksum: string
  /** Package index in osuck arrays (0=osk, 1=lite, …) */
  variantIndex: number
}

export interface SkinDetail extends SkinSummary {
  description: string
  screenshots: string[]
  packages: SkinPackageLink[]
  files: { name: string; checksum: string; modes: number[] }[]
}

export interface SkinSearchResult {
  skins: SkinSummary[]
  hasMore: boolean
  total: number | null
  /** Pass back as cursor for next page */
  cursorId: string | null
  cursorValue: string | null
  source: 'osuck'
}

export type SkinDownloadPhase =
  | 'queued'
  | 'resolving'
  | 'downloading'
  | 'installing'
  | 'done'
  | 'error'
  | 'cancelled'

export interface SkinDownloadProgress {
  /** Client job id (skin id or temp key) */
  jobId: string
  skinId: number
  phase: SkinDownloadPhase
  progress: number
  message?: string
  error?: string
  filePath?: string
}

export interface LocalSkinEntry {
  name: string
  path: string
  isDirectory: boolean
}
