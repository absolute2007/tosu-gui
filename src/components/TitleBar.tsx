import { useEffect, useState } from 'react'
import { AppIcon } from './AppIcon'
import './TitleBar.css'

export function TitleBar() {
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const unsubscribe = window.tosuGui.onMaximizeChanged(setMaximized)
    return () => {
      unsubscribe()
    }
  }, [])

  return (
    <header className="titlebar">
      <div className="titlebar-side -left">
        <div className="traffic-lights">
          <button
            type="button"
            className="tl-btn -close"
            onClick={() => window.tosuGui.close()}
            aria-label="Закрыть"
          >
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 3l6 6M9 3L3 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="tl-btn -minimize"
            onClick={() => window.tosuGui.minimize()}
            aria-label="Свернуть"
          >
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2.5 6h7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="tl-btn -maximize"
            onClick={() => window.tosuGui.maximize()}
            aria-label={maximized ? 'Восстановить' : 'Развернуть'}
          >
            {maximized ? (
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path
                  d="M4 2.5h5.5V8M8 4H2.5v5.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <rect x="2.5" y="2.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.4" fill="none" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="titlebar-center">
        <AppIcon size={15} />
        <span className="titlebar-title">tosu</span>
      </div>

      <div className="titlebar-side -right" aria-hidden="true" />
    </header>
  )
}