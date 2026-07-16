import { Download, ExternalLink, X } from 'lucide-react'

export interface UpdateBannerProgress {
  progress: number
  message: string
}

interface Props {
  title: string
  fromVersion: string
  toVersion: string | null
  installing: boolean
  progress: UpdateBannerProgress | null
  releaseUrl?: string | null
  installLabel?: string
  onInstall: () => void
  onDismiss: () => void
  onOpenRelease?: () => void
}

export function UpdateBanner({
  title,
  fromVersion,
  toVersion,
  installing,
  progress,
  releaseUrl,
  installLabel = 'Обновить',
  onInstall,
  onDismiss,
  onOpenRelease,
}: Props) {
  const progressLabel = installing && progress ? progress.message : null

  return (
    <div className="update-banner">
      <div className="update-banner-content">
        <div className="update-banner-text">
          <div className="update-banner-title">{title}</div>
          <div className="update-banner-desc">
            v{fromVersion}
            {toVersion ? ` → v${toVersion}` : ''}
            {progressLabel ? ` · ${progressLabel}` : ''}
          </div>
        </div>
        <div className="update-banner-actions">
          {releaseUrl && onOpenRelease && (
            <button className="btn btn-ghost" onClick={onOpenRelease} disabled={installing}>
              <ExternalLink size={14} />
              Релиз
            </button>
          )}
          <button className="btn btn-primary" onClick={onInstall} disabled={installing}>
            <Download size={14} />
            {installing ? 'Обновление…' : installLabel}
          </button>
          <button
            className="btn btn-ghost update-banner-close"
            onClick={onDismiss}
            disabled={installing}
            aria-label="Скрыть"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      {installing && progress && (
        <div className="update-banner-progress">
          <div className="progress-track">
            <div
              className="progress-fill -downloading"
              style={{ width: `${Math.max(4, progress.progress)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
