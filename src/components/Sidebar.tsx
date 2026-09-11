import { useState } from 'react'
import {
  Activity,
  Globe,
  Layers,
  LayoutGrid,
  Loader2,
  LogIn,
  LogOut,
  Map as MapIcon,
  Palette,
  Settings,
  SlidersHorizontal,
  User,
} from 'lucide-react'
import type { Page } from '../App'
import type { OsuAccountInfo } from '../../electron/preload'
import { AppIcon } from './AppIcon'
import { useI18n } from '../i18n/context'
import type { TranslationKey } from '../i18n/translations'
import './Sidebar.css'

const NAV: { id: Page; labelKey: TranslationKey; icon: typeof Activity; skinsOnly?: boolean }[] = [
  { id: 'status', labelKey: 'sidebar.status', icon: Activity },
  { id: 'counters', labelKey: 'sidebar.counters', icon: LayoutGrid },
  { id: 'maps', labelKey: 'sidebar.maps', icon: MapIcon },
  { id: 'skins', labelKey: 'sidebar.skins', icon: Palette, skinsOnly: true },
  { id: 'skin-customizer', labelKey: 'sidebar.skinCustomizer', icon: SlidersHorizontal, skinsOnly: true },
  { id: 'overlay', labelKey: 'sidebar.overlay', icon: Layers },
  { id: 'settings', labelKey: 'sidebar.settings', icon: Settings },
]

interface Props {
  active: Page
  onChange: (page: Page) => void
  osuConnected: boolean
  showSkins?: boolean
  account: OsuAccountInfo | null
  authBusy?: boolean
  onLogin: () => Promise<unknown>
  onLogout: () => Promise<unknown>
}

export function Sidebar({
  active,
  onChange,
  osuConnected,
  showSkins = true,
  account,
  authBusy = false,
  onLogin,
  onLogout,
}: Props) {
  const { t, lang, setLang } = useI18n()
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const items = NAV.filter((item) => !item.skinsOnly || showSkins)
  const loggedIn = Boolean(account?.loggedIn)

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon">
          <AppIcon size={28} />
        </div>
        <div>
          <div className="brand-name">tosu</div>
          <div className="brand-status">
            <span className={`status-dot ${osuConnected ? '-online' : '-waiting'}`} />
            {osuConnected ? t('sidebar.osuConnected') : t('sidebar.osuDisconnected')}
          </div>
        </div>
      </div>

      <ul className="sidebar-nav">
        {items.map(({ id, labelKey, icon: Icon }) => (
          <li key={id}>
            <button
              className={`nav-item ${active === id ? '-active' : ''}`}
              onClick={() => onChange(id)}
            >
              <Icon size={16} strokeWidth={1.8} />
              {t(labelKey)}
            </button>
          </li>
        ))}
      </ul>

      {/* Bottom-left footer: User Login/Profile + Language Switcher */}
      <div className="sidebar-footer">
        <div className="sidebar-footer-row">
          {loggedIn ? (
            <button
              type="button"
              className="sidebar-user-btn"
              onClick={() => setShowLogoutModal(true)}
              disabled={authBusy}
              title={t('sidebar.logoutTitle', { user: account?.username || '' })}
            >
              <div className="sidebar-user-avatar">
                {account?.avatarUrl ? (
                  <img src={account.avatarUrl} alt="" />
                ) : (
                  <User size={13} />
                )}
              </div>
              <span className="sidebar-username">{account?.username || t('sidebar.user')}</span>
              <LogOut size={13} className="sidebar-logout-icon" />
            </button>
          ) : (
            <button
              type="button"
              className="sidebar-login-btn"
              onClick={() => void onLogin()}
              disabled={authBusy}
              title={t('sidebar.login')}
            >
              {authBusy ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <LogIn size={14} strokeWidth={1.8} />
              )}
              <span>{authBusy ? t('sidebar.loggingIn') : t('sidebar.login')}</span>
            </button>
          )}

          <button
            type="button"
            className="sidebar-lang-btn"
            onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}
            title={t('sidebar.switchLang')}
          >
            <Globe size={13} />
            <span>{lang.toUpperCase()}</span>
          </button>
        </div>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="sidebar-modal-overlay" onClick={() => setShowLogoutModal(false)}>
          <div className="sidebar-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sidebar-modal-header">
              <div className="sidebar-modal-icon-wrap">
                <LogOut size={18} />
              </div>
              <h3 className="sidebar-modal-title">{t('sidebar.logoutConfirmTitle')}</h3>
            </div>
            <p className="sidebar-modal-desc">
              {t('sidebar.logoutConfirmDesc', { user: account?.username || '' })}
            </p>
            <div className="sidebar-modal-actions">
              <button
                type="button"
                className="sidebar-modal-btn -cancel"
                onClick={() => setShowLogoutModal(false)}
                disabled={authBusy}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="sidebar-modal-btn -confirm"
                onClick={async () => {
                  try {
                    await onLogout()
                    setShowLogoutModal(false)
                  } catch {
                    /* error toasted by hook */
                  }
                }}
                disabled={authBusy}
              >
                {authBusy ? <Loader2 size={13} className="spin" /> : null}
                {t('sidebar.logout')}
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}