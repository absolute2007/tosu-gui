import type { CounterDownloadState } from '../hooks/useCounterDownloads'

interface Props {
  state: CounterDownloadState
}

export function DownloadProgressBar({ state }: Props) {
  const label =
    state.status === 'downloading'
      ? `Загрузка… ${Math.round(state.progress)}%`
      : state.status === 'success'
        ? state.message ?? 'Готово'
        : state.message ?? 'Ошибка'

  return (
    <div className="counter-download-progress">
      <div className="progress-track">
        <div
          className={`progress-fill -${state.status}`}
          style={{ width: `${state.progress}%` }}
        />
      </div>
      <div className={`progress-label -${state.status}`}>{label}</div>
    </div>
  )
}