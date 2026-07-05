import { Download, ExternalLink, X } from 'lucide-react'
import type { TosuUpdateInfo, UpdateProgress } from '../../electron/tosu-updater'

interface Props {
  info: TosuUpdateInfo
  installing: boolean
  progress: UpdateProgress | null
  onInstall: () => void
  onDismiss: () => void
  onOpenRelease: () => void
}

export function UpdateBanner({ info, installing, progress, onInstall, onDismiss, onOpenRelease }: Props) {
  const progressLabel = installing && progress ? progress.message : null

  return (
    <div className="update-banner">
      <div className="update-banner-content">
        <div className="update-banner-text">
          <div className="update-banner-title">Доступно обновление tosu</div>
          <div className="update-banner-desc">
            v{info.currentVersion} → v{info.latestVersion}
            {progressLabel ? ` · ${progressLabel}` : ''}
          </div>
        </div>
        <div className="update-banner-actions">
          {info.releaseUrl && (
            <button className="btn btn-ghost" onClick={onOpenRelease} disabled={installing}>
              <ExternalLink size={14} />
              Релиз
            </button>
          )}
          <button className="btn btn-primary" onClick={onInstall} disabled={installing}>
            <Download size={14} />
            {installing ? 'Обновление…' : 'Обновить'}
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