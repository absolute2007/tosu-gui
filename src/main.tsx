import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles/global.css'

const root = document.getElementById('root')
if (!root) {
  throw new Error('Root element not found')
}

if (!window.tosuGui) {
  root.innerHTML = '<div style="padding:32px;color:#e8ecf2;font-family:Segoe UI,sans-serif">Ошибка: preload не загружен. Перезапустите приложение.</div>'
} else {
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  )
}