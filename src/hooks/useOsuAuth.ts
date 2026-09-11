import { useCallback, useEffect, useState } from 'react'
import type { OsuAccountInfo } from '../../electron/preload'

export function useOsuAuth(onToast?: (msg: string, type: 'success' | 'error') => void) {
  const [account, setAccount] = useState<OsuAccountInfo | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [authReady, setAuthReady] = useState(false)

  const refreshAuth = useCallback(async () => {
    try {
      const info = await window.tosuGui.getOsuAuthStatus()
      setAccount(info)
      return info
    } catch {
      const fallback: OsuAccountInfo = { loggedIn: false, userId: null, username: null, avatarUrl: null }
      setAccount(fallback)
      return fallback
    } finally {
      setAuthReady(true)
    }
  }, [])

  useEffect(() => {
    void refreshAuth()
  }, [refreshAuth])

  const login = useCallback(async () => {
    setAuthBusy(true)
    try {
      const info = await window.tosuGui.loginOsu()
      setAccount(info)
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
  }, [onToast])

  const logout = useCallback(async () => {
    setAuthBusy(true)
    try {
      const info = await window.tosuGui.logoutOsu()
      setAccount(info)
      onToast?.('Вышли из osu!', 'success')
      return info
    } catch {
      onToast?.('Не удалось выйти', 'error')
      throw new Error('Не удалось выйти')
    } finally {
      setAuthBusy(false)
    }
  }, [onToast])

  return {
    account,
    authBusy,
    authReady,
    login,
    logout,
    refreshAuth,
  }
}
