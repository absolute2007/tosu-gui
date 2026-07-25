import { Activity, Layers, LayoutGrid, Map as MapIcon, Palette, Settings } from 'lucide-react'
import type { Page } from '../App'
import { AppIcon } from './AppIcon'
import './Sidebar.css'

const NAV: { id: Page; label: string; icon: typeof Activity; skinsOnly?: boolean }[] = [
  { id: 'status', label: 'Статус', icon: Activity },
  { id: 'counters', label: 'Счётчики', icon: LayoutGrid },
  { id: 'maps', label: 'Карты', icon: MapIcon },
  { id: 'skins', label: 'Скины', icon: Palette, skinsOnly: true },
  { id: 'overlay', label: 'Оверлей', icon: Layers },
  { id: 'settings', label: 'Настройки', icon: Settings },
]

interface Props {
  active: Page
  onChange: (page: Page) => void
  osuConnected: boolean
  showSkins?: boolean
}

export function Sidebar({ active, onChange, osuConnected, showSkins = true }: Props) {
  const items = NAV.filter((item) => !item.skinsOnly || showSkins)

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon">
          <AppIcon size={22} />
        </div>
        <div>
          <div className="brand-name">tosu</div>
          <div className="brand-status">
            <span className={`status-dot ${osuConnected ? '-online' : '-waiting'}`} />
            {osuConnected ? 'osu! подключён' : 'osu! не найден'}
          </div>
        </div>
      </div>

      <ul className="sidebar-nav">
        {items.map(({ id, label, icon: Icon }) => (
          <li key={id}>
            <button
              className={`nav-item ${active === id ? '-active' : ''}`}
              onClick={() => onChange(id)}
            >
              <Icon size={16} strokeWidth={1.8} />
              {label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}