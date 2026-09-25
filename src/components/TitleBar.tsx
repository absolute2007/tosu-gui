import { useEffect, useState } from 'react'
import { AppIcon } from './AppIcon'
import { useI18n } from '../i18n/context'
import './TitleBar.css'

export function TitleBar() {
  const { lang } = useI18n()
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const unsubscribe = window.tosuGui.onMaximizeChanged((value) => {
      setMaximized(value)
      document.documentElement.classList.toggle('window-maximized', value)
    })
    return () => {
      unsubscribe()
      document.documentElement.classList.remove('window-maximized')
    }
  }, [])

  return (
    <header className="titlebar">
      <div className="titlebar-side -left">
        <div className="titlebar-brand">
          <AppIcon size={16} />
          <span className="titlebar-title">tosu</span>
        </div>
      </div>

      <div className="titlebar-center" aria-hidden="true" />

      <div className="titlebar-side -right">
        <div className="window-controls">
          <button
            type="button"
            className="win-btn -minimize"
            onClick={() => window.tosuGui.minimize()}
            aria-label={lang === 'en' ? 'Minimize' : 'Свернуть'}
            title={lang === 'en' ? 'Minimize' : 'Свернуть'}
          >
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <path d="M1 5h8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
            </svg>
          </button>
          <button
            type="button"
            className="win-btn -maximize"
            onClick={() => window.tosuGui.maximize()}
            aria-label={maximized ? (lang === 'en' ? 'Restore' : 'Восстановить') : (lang === 'en' ? 'Maximize' : 'Развернуть')}
            title={maximized ? (lang === 'en' ? 'Restore' : 'Восстановить') : (lang === 'en' ? 'Maximize' : 'Развернуть')}
          >
            {maximized ? (
              <svg viewBox="0 0 10 10" aria-hidden="true">
                <path
                  d="M3 1.5h5.5V7M7 3H1.5v5.5"
                  stroke="currentColor"
                  strokeWidth="1.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 10 10" aria-hidden="true">
                <rect x="1.5" y="1.5" width="7" height="7" rx="0.5" stroke="currentColor" strokeWidth="1.1" fill="none" />
              </svg>
            )}
          </button>
          <button
            type="button"
            className="win-btn -close"
            onClick={() => window.tosuGui.close()}
            aria-label={lang === 'en' ? 'Close' : 'Закрыть'}
            title={lang === 'en' ? 'Close' : 'Закрыть'}
          >
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}