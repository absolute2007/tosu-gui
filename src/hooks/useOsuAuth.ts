import { useCallback, useEffect, useState } from 'react'
import type { OsuAccountInfo } from '../../electron/preload'

const CACHE_KEY = 'tosu_cached_osu_account'

export function useOsuAuth(onToast?: (msg: string, type: 'success' | 'error') => void) {
  const [account, setAccount] = useState<OsuAccountInfo | null>(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as OsuAccountInfo
        if (parsed && typeof parsed.loggedIn === 'boolean') {
          return parsed
        }
      }
    } catch {
      /* ignore */
    }
    return null
  })
  const [authBusy, setAuthBusy] = useState(false)
  const [authReady, setAuthReady] = useState(false)

  const syncAccountState = useCallback((info: OsuAccountInfo) => {
    setAccount(info)
    try {
      if (info.loggedIn) {
        localStorage.setItem(CACHE_KEY, JSON.stringify(info))
      } else {
        localStorage.removeItem(CACHE_KEY)
      }
    } catch {
      /* ignore */
    }
  }, [])

  const refreshAuth = useCallback(async () => {
    try {
      const info = await window.tosuGui.getOsuAuthStatus()
      syncAccountState(info)
      return info
    } catch {
      return account
    } finally {
      setAuthReady(true)
    }
  }, [syncAccountState, account])

  useEffect(() => {
    void refreshAuth()
  }, [refreshAuth])

  const login = useCallback(async () => {
    setAuthBusy(true)
    try {
      const info = await window.tosuGui.loginOsu()
      syncAccountState(info)
      if (info.loggedIn) {
        onToast?.(info.username ? `Вошли как ${info.username}` : 'Вход выполнен', 'success')
      } else {
        onToast?.('Вход не выполнен', 'error')
      }
      return info
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err ?? 'Ошибка входа')
      const clean = msg.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '')
      onToast?.(clean || 'Ошибка входа', 'error')
      throw err
    } finally {
      setAuthBusy(false)
    }
  }, [onToast, syncAccountState])

  const logout = useCallback(async () => {
    setAuthBusy(true)
    try {
      const info = await window.tosuGui.logoutOsu()
      syncAccountState(info)
      onToast?.('Вышли из osu!', 'success')
      return info
    } catch {
      onToast?.('Не удалось выйти', 'error')
      throw new Error('Не удалось выйти')
    } finally {
      setAuthBusy(false)
    }
  }, [onToast, syncAccountState])

  return {
    account,
    authBusy,
    authReady,
    login,
    logout,
    refreshAuth,
  }
}
